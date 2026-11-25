/* Test di regressione per scripts/verify-apk.mjs.
   Costruisce APK-fixture in memoria (ZIP stored, manifest come testo piano
   che il gate legge via rawStrings) e verifica che il gate accetti i pacchetti
   buoni e blocchi quelli cattivi. Gira con: node --test scripts/verify-apk.test.mjs
   Nota: il gate risolve il percorso con join(cwd, argv[2]); quindi qui lo
   lanciamo con cwd = cartella fixture e nome RELATIVO, altrimenti join
   concatenerebbe un percorso assoluto producendo un path inesistente. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "verify-apk.mjs");
const DIR = mkdtempSync(join(tmpdir(), "ss-gate-"));
after(() => rmSync(DIR, { recursive: true, force: true }));

/* Minimal ZIP writer (method 0 = stored). Il gate non verifica i CRC. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nb = Buffer.from(name, "utf8");
    const db = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(db.length, 18);
    lh.writeUInt32LE(db.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nb, db);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(0, 16);
    ch.writeUInt32LE(db.length, 20);
    ch.writeUInt32LE(db.length, 24);
    ch.writeUInt16LE(nb.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nb);
    offset += lh.length + nb.length + db.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const manifest = (tokens) => tokens.join("\0");
const SIG = ["META-INF/CERT.RSA", "x"];
const BRIDGE = ["assets/native-bridge.js", "//"];
const BUNDLE = ["assets/public/index.html", "<html>"];
const MAIN = "studio.littleelsewhere.soundscript.MainActivity";
const SEND = "android.intent.action.SEND";
const META = "android.support.customtabs.trusted.METADATA_SHARE_TARGET";

function run(entries, name) {
  const file = name + ".apk";
  writeFileSync(join(DIR, file), zip(entries));
  // cwd = DIR + nome relativo: il join(cwd, argv[2]) del gate risolve corretto.
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: "utf8", cwd: DIR });
  return { status: r.status, out: r.stdout + r.stderr };
}

test("Capacitor APK valido passa", () => {
  const r = run([["AndroidManifest.xml", manifest([SEND, "audio/*", MAIN])], BRIDGE, BUNDLE, SIG], "good-cap");
  assert.equal(r.status, 0, r.out);
});

test("TWA APK valido passa", () => {
  const r = run([["AndroidManifest.xml", manifest([SEND, "audio/*", META])], SIG], "good-twa");
  assert.equal(r.status, 0, r.out);
});

test("ACTION_SEND assente viene bloccato", () => {
  const r = run([["AndroidManifest.xml", manifest(["audio/*", MAIN])], BRIDGE, BUNDLE, SIG], "no-send");
  assert.equal(r.status, 1, r.out);
});

test("estensione usata come MIME type viene bloccata", () => {
  const r = run([["AndroidManifest.xml", manifest([SEND, "audio/*", ".ogg", MAIN])], BRIDGE, BUNDLE, SIG], "ext-mime");
  assert.equal(r.status, 1, r.out);
});

test("chiave privata dentro l'APK viene bloccata", () => {
  const r = run([["AndroidManifest.xml", manifest([SEND, "audio/*", MAIN])], BRIDGE, BUNDLE, SIG, ["release.keystore", "secret"]], "key-leak");
  assert.equal(r.status, 1, r.out);
});

test("AAB spacciato per APK viene bloccato", () => {
  const r = run([["BundleConfig.pb", "x"], ["AndroidManifest.xml", manifest([SEND, "audio/*"])], SIG], "aab");
  assert.equal(r.status, 1, r.out);
});

test("nessun meccanismo di consegna viene bloccato", () => {
  const r = run([["AndroidManifest.xml", manifest([SEND, "audio/*"])], SIG], "no-mech");
  assert.equal(r.status, 1, r.out);
});
