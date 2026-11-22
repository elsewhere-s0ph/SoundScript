#!/usr/bin/env node
/* Genera le icone launcher Android con adaptive-icon day/night.
   - Legacy mipmap (Android < 8) + round, dall'icona piena.
   - Adaptive-icon (Android 8+): il BACKGROUND è l'icona piena, così riempie
     tutta la maschera del launcher (tonda/squircle) e sparisce il "quadrato
     nel cerchio". Il foreground è trasparente.
   - Due background qualificati: drawable/ (modalità chiara) e drawable-night/
     (modalità scura). Android sceglie da solo in base al tema di sistema.
     Vale per home, app drawer, share sheet e recenti.
   Per invertire giorno/notte, scambia DAY_SRC e NIGHT_SRC. */
import sharp from "sharp";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DAY_SRC = "public/icons/icon-512.png";              // tema chiaro  -> icona scura
const NIGHT_SRC = "public/icons/icon-maskable-512.png";   // tema scuro   -> icona chiara
const RES = "android/app/src/main/res";

if (!existsSync(DAY_SRC)) { console.error("::error::" + DAY_SRC + " non trovato"); process.exit(1); }
const night = existsSync(NIGHT_SRC) ? NIGHT_SRC : DAY_SRC;
if (night === DAY_SRC) console.log("::warning::sorgente notturna assente, uso la stessa per entrambe le modalità");

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

function circleMask(s) {
  return Buffer.from(
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#ffffff"/></svg>`
  );
}

/* ---------- legacy + round (Android < 8 e fallback) ---------- */
for (const [d, s] of Object.entries(LEGACY)) {
  const dir = join(RES, "mipmap-" + d);
  mkdirSync(dir, { recursive: true });
  await sharp(DAY_SRC).resize(s, s, { fit: "cover" }).png().toFile(join(dir, "ic_launcher.png"));
  await sharp(DAY_SRC).resize(s, s, { fit: "cover" })
    .composite([{ input: circleMask(s), blend: "dest-in" }]).png()
    .toFile(join(dir, "ic_launcher_round.png"));
}
console.log("legacy mipmap ok");

/* ---------- adaptive background, day e night, per densità ---------- */
for (const [d, s] of Object.entries(ADAPTIVE)) {
  const dayDir = join(RES, "drawable-" + d);
  const nightDir = join(RES, "drawable-night-" + d);
  mkdirSync(dayDir, { recursive: true });
  mkdirSync(nightDir, { recursive: true });
  await sharp(DAY_SRC).resize(s, s, { fit: "cover" }).png().toFile(join(dayDir, "ic_launcher_background.png"));
  await sharp(night).resize(s, s, { fit: "cover" }).png().toFile(join(nightDir, "ic_launcher_background.png"));
}
console.log("adaptive background day/night ok");

/* ---------- adaptive-icon XML ---------- */
const ADAPTIVE_XML =
  `<?xml version="1.0" encoding="utf-8"?>\n` +
  `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
  `    <background android:drawable="@drawable/ic_launcher_background"/>\n` +
  `    <foreground android:drawable="@android:color/transparent"/>\n` +
  `</adaptive-icon>\n`;

const anydpi = join(RES, "mipmap-anydpi-v26");
mkdirSync(anydpi, { recursive: true });
writeFileSync(join(anydpi, "ic_launcher.xml"), ADAPTIVE_XML);
writeFileSync(join(anydpi, "ic_launcher_round.xml"), ADAPTIVE_XML);
console.log("adaptive-icon XML ok");

console.log("Icone Android generate (adaptive day/night).");
