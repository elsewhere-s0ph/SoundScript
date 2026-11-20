#!/usr/bin/env node
/* Gate post-build: apre l'APK appena prodotto e verifica che il manifest
   Android contenga il consegnatario della condivisione.
   Il pacchetto precedente aveva ACTION_SEND e audio/*, ma non
   ShareTargetActivity: WhatsApp mostrava l'app e il file andava perso.
   Questo controllo impedisce di ripubblicare la stessa condizione. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const APK = process.argv[2] || "app-release-signed.apk";
const errors = [];
const notes = [];
let passed = 0;
const ok = (m) => { passed++; console.log("  OK   " + m); };
const bad = (m) => { errors.push(m); console.log("  FAIL " + m); };
const warn = (m) => { notes.push(m); console.log("  WARN " + m); };

console.log("== Verifica APK: consegna condivisione ==");

if (!existsSync(join(process.cwd(), APK))) {
  bad(APK + " non trovato. Esegui bubblewrap build prima di questo controllo.");
  finish();
}

const buf = readFileSync(join(process.cwd(), APK));
ok(APK + " letto · " + (buf.length / 1048576).toFixed(2) + " MB");

/* ---------- ZIP: central directory ---------- */
function zipEntries(b) {
  const out = [];
  if (b.length < 22) return out;
  const maxBack = Math.min(b.length, 65557);
  let eocd = -1;
  for (let i = b.length - 22; i >= b.length - maxBack; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (off + 46 > b.length) break;
    if (b.readUInt32LE(off) !== 0x02014b50) break;
    const method = b.readUInt16LE(off + 10);
    const csize = b.readUInt32LE(off + 20);
    const usize = b.readUInt32LE(off + 24);
    const nl = b.readUInt16LE(off + 28);
    const el = b.readUInt16LE(off + 30);
    const cl = b.readUInt16LE(off + 32);
    const lho = b.readUInt32LE(off + 42);
    const ns = off + 46;
    if (ns + nl > b.length) break;
    const name = b.toString("utf8", ns, ns + nl);
    out.push({ name, method, csize, usize, lho });
    off = ns + nl + el + cl;
  }
  return out;
}

function entryBuffer(b, e) {
  if (e.lho + 30 > b.length) throw new Error("local header fuori limite");
  if (b.readUInt32LE(e.lho) !== 0x04034b50) throw new Error("local header non valido");
  const nl = b.readUInt16LE(e.lho + 26);
  const el = b.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nl + el;
  if (start + e.csize > b.length) throw new Error("dati fuori limite");
  const raw = b.subarray(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error("compressione non supportata: metodo " + e.method);
}

const entries = zipEntries(buf);
if (!entries.length) { bad("archivio ZIP non leggibile"); finish(); }
ok(entries.length + " voci nell'archivio");

const names = entries.map((e) => e.name);
const lower = names.map((n) => n.toLowerCase());

if (lower.some((n) => /\.(keystore|jks|p12|pem|key)$/.test(n))) {
  bad("l'APK contiene una chiave privata: non pubblicarlo");
}
if (names.indexOf("BundleConfig.pb") >= 0 || lower.some((n) => n.startsWith("base/manifest/"))) {
  bad("questo è un AAB, non un APK: il gate richiede il pacchetto installabile");
  finish();
}
if (names.indexOf("AndroidManifest.xml") < 0) { bad("AndroidManifest.xml assente"); finish(); }

const manEntry = entries.find((e) => e.name === "AndroidManifest.xml");
let man;
try {
  man = entryBuffer(buf, manEntry);
  ok("AndroidManifest.xml estratto · " + man.length + " byte · " + (manEntry.method === 8 ? "deflate" : "stored"));
} catch (e) {
  bad("estrazione fallita: " + e.message);
  finish();
}

/* ---------- AXML: string pool ---------- */
function stringPool(b) {
  if (b.length < 16) throw new Error("manifest troppo corto");
  if (b.readUInt16LE(0) !== 0x0003) throw new Error("non è AXML Android");
  const cs = 8;
  if (b.readUInt16LE(cs) !== 0x0001) throw new Error("string pool non in testa");
  const count = b.readUInt32LE(cs + 8);
  const flags = b.readUInt32LE(cs + 16);
  const stringsStart = b.readUInt32LE(cs + 20);
  const utf8 = (flags & 0x100) !== 0;
  const base = cs + stringsStart;
  const offs = [];
  for (let i = 0; i < count; i++) {
    const p = cs + 28 + i * 4;
    if (p + 4 > b.length) break;
    offs.push(b.readUInt32LE(p));
  }
  const out = [];
  const len8 = (pos) => {
    const l = b[pos];
    if (l & 0x80) return { v: ((l & 0x7f) << 8) | b[pos + 1], n: 2 };
    return { v: l, n: 1 };
  };
  const len16 = (pos) => {
    const l = b.readUInt16LE(pos);
    if (l & 0x8000) return { v: ((l & 0x7fff) << 16) | b.readUInt16LE(pos + 2), n: 4 };
    return { v: l, n: 2 };
  };
  for (const o of offs) {
    let pos = base + o;
    if (pos >= b.length) { out.push(""); continue; }
    try {
      if (utf8) {
        const a = len8(pos); pos += a.n;
        const c = len8(pos); pos += c.n;
        if (pos + c.v > b.length) { out.push(""); continue; }
        out.push(b.toString("utf8", pos, pos + c.v));
      } else {
        const a = len16(pos); pos += a.n;
        const bytes = a.v * 2;
        if (pos + bytes > b.length) { out.push(""); continue; }
        out.push(b.toString("utf16le", pos, pos + bytes));
      }
    } catch (e) { out.push(""); }
  }
  return { strings: out.filter(Boolean), utf8 };
}

function rawScan(b) {
  const out = [];
  const seen = new Set();
  const push = (s) => { if (s.length >= 4 && /^[\x20-\x7E]+$/.test(s) && !seen.has(s)) { seen.add(s); out.push(s); } };
  let cur = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c >= 0x20 && c <= 0x7e) cur += String.fromCharCode(c);
    else { push(cur); cur = ""; }
  }
  push(cur);
  cur = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    if (b[i + 1] === 0 && b[i] >= 0x20 && b[i] <= 0x7e) cur += String.fromCharCode(b[i]);
    else { push(cur); cur = ""; }
  }
  push(cur);
  return out;
}

let pool = [];
try {
  const p = stringPool(man);
  pool = p.strings;
  ok("string pool: " + pool.length + " voci · " + (p.utf8 ? "UTF-8" : "UTF-16"));
} catch (e) {
  warn("parsing AXML fallito (" + e.message + "), uso la scansione grezza");
  pool = rawScan(man);
  ok("scansione grezza: " + pool.length + " stringhe");
}

const has = (re) => pool.some((s) => re.test(s));
const find = (re) => pool.filter((s) => re.test(s));

/* ---------- i controlli che contano ---------- */
const send = has(/android\.intent\.action\.SEND$/i);
const shareActivity = find(/ShareTargetActivity/i);
const shareString = find(/share-?target/i);
const audioMime = find(/^audio\//i);
const anyMime = find(/^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+*-]+$/i).filter((m) => !/^android\./i.test(m));
const multipart = has(/multipart/i);
const helper = find(/androidbrowserhelper/i);

send ? ok("ACTION_SEND presente") : bad("ACTION_SEND assente: l'app non compare nel menu Condividi");
audioMime.length
  ? ok("mime audio: " + audioMime.join(", "))
  : bad("nessun mime audio nel filtro (trovati: " + (anyMime.join(", ") || "nessuno") + ")");

if (shareActivity.length) ok("ShareTargetActivity presente: " + shareActivity.join(", "));
else bad("ShareTargetActivity ASSENTE: il pacchetto riceve l'intent ma non ha chi lo converte nella POST. È esattamente il difetto del pacchetto precedente.");

if (shareString.length) ok("destinazione share-target: " + shareString.join(", "));
else bad("nessuna stringa share-target: l'URL di consegna non è nel manifest Android");

multipart ? ok("traccia multipart presente") : warn("nessuna stringa multipart: può essere normale, il valore vive nelle risorse");
helper.length ? ok(helper.length + " componenti android-browser-helper") : warn("nessun componente android-browser-helper rilevato");

if (!send || !audioMime.length || !shareActivity.length || !shareString.length) {
  console.log("\nComponenti trovati nel pool:");
  helper.forEach((h) => console.log("  · " + h));
  console.log("\nStringhe rilevanti:");
  pool.filter((s) => /intent|audio|share|browserhelper|Delegation|Launcher/i.test(s))
    .forEach((s) => console.log("  · " + s));
}

finish();

function finish() {
  console.log("\n----------------------------------------");
  console.log("Controlli superati: " + passed + " · Problemi: " + errors.length + " · Avvisi: " + notes.length);
  if (errors.length) {
    console.log("\nPROBLEMI BLOCCANTI:");
    errors.forEach((e, i) => console.log(" " + (i + 1) + ") " + e));
    console.log("\nL'APK non viene pubblicato. Se manca ShareTargetActivity,");
    console.log("la versione di Bubblewrap non ha generato il consegnatario:");
    console.log("verifica che twa-manifest.json contenga shareTarget con");
    console.log("method POST, enctype multipart/form-data e params.files.");
    process.exit(1);
  }
  console.log("APK idoneo alla pubblicazione.");
}