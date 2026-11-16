#!/usr/bin/env node
/* Controlli strutturali della PWA. Zero dipendenze: solo Node.
   Va eseguito DOPO npm run build: verifica anche il contenuto di dist/. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const SITE = "https://soundscript-app.pages.dev";
const MANIFEST_ID = "https://soundscript-app.pages.dev/";
const errors = [];
let passed = 0;
const ok = (m) => { passed++; console.log("  OK   " + m); };
const bad = (m) => { errors.push(m); console.log("  FAIL " + m); };
const group = (t) => console.log("\n== " + t + " ==");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (p) => !!p && existsSync(join(ROOT, p));

function attr(tag, name) {
  const m = tag.match(new RegExp("\\s" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return m ? m[1] : "";
}
function tags(html, name) {
  return html.match(new RegExp("<" + name + "\\b[^>]*>", "gi")) || [];
}
function scriptBlocks(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ attrs: m[1] || "", body: m[2] || "" });
  return out;
}
function sha256(t) { return "sha256-" + createHash("sha256").update(t, "utf8").digest("base64"); }

/* risolve un riferimento HTML: prova root repo, poi public/, poi dist/ */
function resolveWeb(ref, mode) {
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (/^(https?:)?\/\//i.test(clean)) return null;
  if (/^(mailto|tel|data|javascript|blob):/i.test(clean)) return null;
  const rel = clean.replace(/^\/+/, "");
  if (mode === "dist") return has(join("dist", rel)) ? join("dist", rel) : null;
  if (has(rel)) return rel;
  if (has(join("public", rel))) return join("public", rel);
  return null;
}

/* ---------- 1. file sorgente ---------- */
group("File sorgente");
const SRC = [
  "index.html", "package.json", "vite.config.js",
  "src/main.js", "src/providers.js", "src/i18n.js", "src/style.css",
  "src/install.js", "src/install.css",
  "public/manifest.json", "public/sw.js", "public/share-target.html",
  "public/_headers", "public/robots.txt", "public/sitemap.xml",
  "public/fonts/roboto-flex.woff2"
];
for (const f of SRC) has(f) ? ok(f) : bad("manca " + f);

/* ---------- 2. package.json ---------- */
group("package.json");
let pkg = null;
try {
  pkg = JSON.parse(read("package.json"));
  ok("JSON valido");
  /^\d+\.\d+\.\d+$/.test(pkg.version || "") ? ok("version semver: " + pkg.version) : bad("version non semver: " + pkg.version);
  pkg.type === "module" ? ok('type: "module"') : bad('type deve essere "module"');
  pkg.scripts && pkg.scripts.build ? ok("scripts.build presente") : bad("scripts.build mancante");
} catch (e) { bad("package.json non parseabile: " + e.message); }

/* ---------- 3. manifest ---------- */
group("manifest.json");
let man = null;
if (has("public/manifest.json")) {
  try {
    man = JSON.parse(read("public/manifest.json"));
    ok("JSON valido");
    man.id === MANIFEST_ID ? ok("id permanente corretto") : bad('id deve restare "' + MANIFEST_ID + '" (trovato: ' + man.id + ")");
    for (const k of ["name", "short_name", "start_url", "display"]) man[k] ? ok(k) : bad("manifest senza " + k);
    const refs = [];
    for (const i of man.icons || []) refs.push(i.src);
    for (const s of man.screenshots || []) refs.push(s.src);
    for (const s of man.shortcuts || []) { for (const i of s.icons || []) refs.push(i.src); }
    if (man.share_target && man.share_target.action) refs.push(man.share_target.action);
    if (!(man.icons || []).length) bad("manifest senza icone");
    for (const r of refs) {
      const clean = String(r).split("?")[0].replace(/^\.?\//, "");
      has(join("public", clean)) ? ok("asset: " + clean) : bad("asset mancante: public/" + clean);
    }
  } catch (e) { bad("manifest non parseabile: " + e.message); }
}

/* ---------- 4. index.html ---------- */
group("index.html");
let cspHashes = new Set();
let cspLine = "";
if (has("public/_headers")) {
  const headers = read("public/_headers");
  const cspLines = headers.split(/\r?\n/).filter((l) => /^\s*content-security-policy\s*:/i.test(l));
  if (cspLines.length !== 1) bad("attesa 1 riga CSP, trovate " + cspLines.length);
  else {
    cspLine = cspLines[0];
    ok("CSP su una riga sola");
    cspHashes = new Set((cspLine.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).map((s) => s.slice(1, -1)));
    for (const need of ["script-src 'self'", "'wasm-unsafe-eval'", "media-src 'self' blob:", "worker-src 'self' blob:", "object-src 'none'", "frame-ancestors 'none'", "https://huggingface.co"]) {
      cspLine.includes(need) ? ok("CSP: " + need) : bad("CSP senza " + need);
    }
  }
  for (const need of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
    new RegExp("^\\s*" + need + "\\s*:", "im").test(headers) ? ok(need) : bad("header mancante: " + need);
  }
}
if (has("index.html")) {
  const html = read("index.html");
  attr((html.match(/<html\b[^>]*>/i) || [""])[0], "lang") ? ok("lang presente") : bad("html senza lang");
  (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1].trim() ? ok("title") : bad("title mancante");
  /name=["']description["']/i.test(html) ? ok("meta description") : bad("meta description mancante");
  /name=["']viewport["']/i.test(html) ? ok("viewport") : bad("viewport mancante");
  const canonical = attr((html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [""])[0], "href");
  canonical === SITE + "/" ? ok("canonical corretto") : bad("canonical atteso " + SITE + "/ trovato " + canonical);
  /rel=["']manifest["']/i.test(html) ? ok("link manifest") : bad("link manifest mancante");
  (html.match(/name=["']theme-color["']/gi) || []).length >= 2 ? ok("theme-color chiaro+scuro") : bad("theme-color incompleti");
  /rel=["']preload["'][^>]*as=["']font["']/i.test(html) ? ok("preload font") : bad("preload font mancante");
  /id=["']app["']/.test(html) ? ok("contenitore #app") : bad("#app mancante");
  /src=["']\/src\/main\.js["']/.test(html) ? ok("entry main.js") : bad("entry main.js mancante");
  /src=["']\/src\/install\.js["']/.test(html) ? ok("entry install.js") : bad("entry install.js mancante");

  let broken = 0, checked = 0;
  for (const t of [...tags(html, "link"), ...tags(html, "img"), ...tags(html, "script")]) {
    const ref = attr(t, "href") || attr(t, "src");
    if (!ref || ref.startsWith("#")) continue;
    if (/^(https?:)?\/\//i.test(ref) || /^(data|mailto|tel):/i.test(ref)) continue;
    checked++;
    if (!resolveWeb(ref, "src")) { bad("riferimento non risolto: " + ref); broken++; }
  }
  if (!broken) ok(checked + " riferimenti risolti");

  for (const s of scriptBlocks(html)) {
    if (/\ssrc\s*=/i.test(s.attrs)) continue;
    const type = attr(s.attrs, "type").toLowerCase();
    if (type === "application/ld+json") { try { JSON.parse(s.body); ok("JSON-LD valido"); } catch (e) { bad("JSON-LD rotto"); } continue; }
    const h = sha256(s.body);
    cspHashes.has(h) ? ok("script inline autorizzato") : bad("script inline NON in CSP. Hash: '" + h + "'");
  }
  if (/kevin-flynn89|\.github\.io/i.test(html)) bad("riferimento obsoleto in index.html");
}

/* ---------- 5. service worker e build config ---------- */
group("Service worker");
if (has("public/sw.js")) {
  const sw = read("public/sw.js");
  sw.includes("__SW_BUILD__") ? ok("timbro di build presente") : bad("sw.js senza __SW_BUILD__");
  /CORE_CACHE\s*=\s*["']soundscript-core-["']\s*\+\s*SW_BUILD/.test(sw) ? ok("cache timbrata per build") : bad("cache NON timbrata: usa soundscript-core- + SW_BUILD");
  /caches\.delete/.test(sw) ? ok("pulizia cache vecchie in activate") : bad("pulizia cache mancante");
  /share-target\.html/.test(sw) ? ok("gestore share target") : bad("gestore share target mancante");
  const list = sw.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (list) {
    const items = [...list[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1].replace(/^\.?\//, "") || "index.html");
    for (const it of items) {
      const clean = it === "" ? "index.html" : it;
      has(join("public", clean)) || clean === "index.html" ? ok("precache: " + clean) : bad("precache punta a file inesistente: public/" + clean);
    }
  } else bad("CORE_ASSETS non trovato in sw.js");
}
if (has("vite.config.js")) {
  read("vite.config.js").includes("__SW_BUILD__") ? ok("vite sostituisce il timbro") : bad("vite.config.js non sostituisce __SW_BUILD__");
}

/* ---------- 6. CSS ---------- */
group("CSS");
for (const f of ["src/style.css", "src/install.css"]) {
  if (!has(f)) continue;
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\((["']?)[^)]*\1\)/g, "url()");
  const o = (css.match(/{/g) || []).length, c = (css.match(/}/g) || []).length;
  o === c ? ok(f + ": graffe bilanciate (" + o + ")") : bad(f + ": graffe sbilanciate " + o + "/" + c);
}

/* ---------- 7. SEO file ---------- */
group("robots.txt e sitemap.xml");
if (has("public/robots.txt")) {
  const r = read("public/robots.txt");
  /<!doctype|<html/i.test(r) ? bad("robots.txt contiene HTML") : ok("robots.txt è testo puro");
  r.includes("Sitemap: " + SITE + "/sitemap.xml") ? ok("robots: Sitemap corretto") : bad("robots: riga Sitemap errata");
}
if (has("public/sitemap.xml")) {
  const locs = [...read("public/sitemap.xml").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  locs.includes(SITE + "/") ? ok("sitemap contiene la home") : bad("sitemap senza " + SITE + "/");
  for (const l of locs) l.startsWith(SITE) ? ok("sitemap: " + l) : bad("sitemap fuori dominio: " + l);
}

/* ---------- 8. output di build ---------- */
group("Build (dist/)");
if (!has("dist/index.html")) {
  bad("dist/index.html mancante: esegui npm run build prima dei controlli");
} else {
  ok("dist/index.html");
  for (const f of ["dist/sw.js", "dist/manifest.json", "dist/_headers", "dist/robots.txt", "dist/sitemap.xml"]) {
    has(f) ? ok(f) : bad("manca " + f);
  }
  if (has("dist/sw.js")) {
    read("dist/sw.js").includes("__SW_BUILD__") ? bad("dist/sw.js: timbro NON sostituito") : ok("dist/sw.js: timbro sostituito");
  }
  const dhtml = read("dist/index.html");
  let broken = 0, checked = 0;
  for (const t of [...tags(dhtml, "link"), ...tags(dhtml, "img"), ...tags(dhtml, "script")]) {
    const ref = attr(t, "href") || attr(t, "src");
    if (!ref || ref.startsWith("#")) continue;
    if (/^(https?:)?\/\//i.test(ref) || /^(data|mailto|tel):/i.test(ref)) continue;
    checked++;
    if (!resolveWeb(ref, "dist")) { bad("dist: riferimento rotto " + ref); broken++; }
  }
  if (!broken) ok("dist: " + checked + " riferimenti risolti");
}

/* ---------- 9. residui ---------- */
group("Residui obsoleti");
for (const f of ["index.html", "src/main.js", "src/i18n.js", "src/install.js", "src/style.css", "src/install.css", "public/manifest.json"]) {
  if (!has(f)) continue;
  /kevin-flynn89|\.github\.io/i.test(read(f)) ? bad("riferimento obsoleto in " + f) : ok(f + " pulito");
}

console.log("\n----------------------------------------");
console.log("Controlli superati: " + passed + " · Problemi: " + errors.length);
if (errors.length) {
  console.log("\nPROBLEMI:");
  errors.forEach((e, i) => console.log(" " + (i + 1) + ") " + e));
  process.exit(1);
}
console.log("Tutto verde.");