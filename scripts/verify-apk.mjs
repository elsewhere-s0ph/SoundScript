#!/usr/bin/env node
/* Gate post-build: verifica che l'APK dichiari la consegna della condivisione.
   Accetta due architetture:
   - TWA: meta-data METADATA_SHARE_TARGET di android-browser-helper
   - Capacitor: intent-filter SEND audio/* sulla MainActivity con BridgeActivity
   Blocca sempre: chiave privata dentro l'APK, AAB spacciato per APK,
   estensioni usate come MIME type (INSTALL_PARSE_FAILED_MANIFEST_MALFORMED). */
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
  bad(APK + " non trovato.");
  finish();
}

const buf = readFileSync(join(process.cwd(), APK));
ok(APK + " letto · " + (buf.length / 1048576).toFixed(2) + " MB");

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
    const nl = b.readUInt16LE(off + 28);
    const el = b.readUInt16LE(off + 30);
    const cl = b.readUInt16LE(off + 32);
    const lho = b.readUInt32LE(off + 42);
    const ns = off + 46;
    if (ns + nl > b.length) break;
    out.push({ name: b.toString("utf8", ns, ns + nl), method, csize, lho });
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
  bad("questo è un AAB, non un APK");
  finish();
}
if (!lower.some((n) => /^meta-inf\/.*\.(rsa|dsa|ec)$/.test(n))) {
  warn("nessuna firma v1 in META-INF: possibile firma solo v2/v3");
} else {
  ok("firma presente in META-INF");
}
if (names.indexOf("AndroidManifest.xml") < 0) { bad("AndroidManifest.xml assente"); finish(); }

function stringPool(b) {
  if (b.length < 16) throw new Error("buffer troppo corto");
  if (b.readUInt16LE(0) !== 0x0003) throw new Error("non è AXML");
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
  return out.filter(Boolean);
}
function rawStrings(b) {
  const out = [];
  const seen = new Set();
  const push = (s) => { if (s.length >= 3 && /^[\x20-\x7E]+$/.test(s) && !seen.has(s)) { seen.add(s); out.push(s); } };
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
function stringsOf(b) {
  try {
    const p = stringPool(b);
    if (p.length > 2) return p;
  } catch (e) { /* non AXML */ }
  return rawStrings(b);
}

const manEntry = entries.find((e) => e.name === "AndroidManifest.xml");
let manStrings = [];
try {
  const mb = entryBuffer(buf, manEntry);
  manStrings = stringsOf(mb);
  ok("AndroidManifest.xml estratto · " + mb.length + " byte · " + manStrings.length + " stringhe");
} catch (e) {
  bad("estrazione manifest fallita: " + e.message);
  finish();
}

const has = (re) => manStrings.some((s) => re.test(s));
const find = (re) => manStrings.filter((s) => re.test(s));

/* 1 · registrazione nel menu Condividi */
const send = has(/android\.intent\.action\.SEND$/i);
const audioMime = find(/^audio\//i);
const anyMime = find(/^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+*-]+$/i).filter((m) => !/^android\./i.test(m));
send ? ok("ACTION_SEND presente") : bad("ACTION_SEND assente: l'app non compare nel menu Condividi");
audioMime.length ? ok("mime audio: " + audioMime.join(", "))
  : bad("nessun mime audio (trovati: " + (anyMime.join(", ") || "nessuno") + ")");

/* 1bis · nessuna estensione usata come MIME type */
const malformed = manStrings.filter((s) => /^\.[A-Za-z0-9]{1,8}$/.test(s));
if (malformed.length) {
  bad("MIME type malformati: " + malformed.join(", ") + " · Android rifiuta l'installazione");
} else {
  ok("nessuna estensione usata come MIME type");
}

/* 2 · meccanismo di consegna: TWA oppure Capacitor */
const metaShare = find(/METADATA_SHARE_TARGET/i);
const shareString = find(/share-?target/i);
const capacitor = find(/BridgeActivity|com\.getcapacitor/i);
const delegation = find(/DelegationService/i);

if (capacitor.length) {
  ok("pacchetto Capacitor: WebView nativa, intent letto in-process");
} else if (metaShare.length || shareString.length) {
  ok("pacchetto TWA: meta-data di consegna presente");
} else {
  bad("nessun meccanismo di consegna: né Capacitor né meta-data TWA");
}
if (delegation.length) ok("DelegationService presente (TWA)");

/* 3 · bundle web dentro l'APK (modalità bundled) */
const hasBundle = names.some((n) => n.startsWith("assets/public/"));
hasBundle ? ok("bundle web impacchettato in assets/public")
  : warn("nessun assets/public: verifica webDir in capacitor.config.json");

/* 4 · verdetto */
const declared = send && audioMime.length > 0 && (capacitor.length > 0 || metaShare.length > 0 || shareString.length > 0);
console.log("");
if (declared) {
  ok("VERDETTO: il pacchetto dichiara la consegna della condivisione audio");
} else {
  bad("VERDETTO: dichiarazione di consegna incompleta");
  console.log("Stringhe rilevanti:");
  manStrings.filter((s) => /intent|audio|share|capacitor|Bridge|Main/i.test(s))
    .forEach((s) => console.log("  · " + s));
}

finish();

function finish() {
  console.log("\n----------------------------------------");
  console.log("Controlli superati: " + passed + " · Problemi: " + errors.length + " · Avvisi: " + notes.length);
  if (errors.length) {
    console.log("\nPROBLEMI BLOCCANTI:");
    errors.forEach((e, i) => console.log(" " + (i + 1) + ") " + e));
    process.exit(1);
  }
  console.log("APK idoneo alla pubblicazione.");
}