#!/usr/bin/env node
/* Genera le icone launcher Android, tre meccanismi coesistenti:
   1. Adaptive-icon PIENA day/night: il background è l'icona completa
      (chiara di giorno, scura di notte), riempie la maschera del launcher
      → tonda, niente "quadrato nel cerchio". I launcher che rispettano la
      qualifica -night (es. alcuni OEM) scambiano automaticamente le due.
   2. Layer MONOCHROME: con "Themed icons" attivo (Android 12+, Pixel) il
     launcher tinge questo layer col tema/wallpaper, quindi segue chiaro/scuro.
   3. Legacy mipmap + round (Android < 8) dalla variante giorno.
   Chi non applica né -night né themed icons vede la variante giorno (chiara). */
import sharp from "sharp";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LIGHT_SRC = "public/icons/icon-maskable-512.png"; // modalità giorno -> icona chiara
const DARK_SRC = "public/icons/icon-512.png";           // modalità notte  -> icona scura
const MONO_SRC = "public/icon-dark-transparent.svg";    // glyph per themed icons
const RES = "android/app/src/main/res";

let light = existsSync(LIGHT_SRC) ? LIGHT_SRC : DARK_SRC;
let dark = existsSync(DARK_SRC) ? DARK_SRC : light;
if (!existsSync(light)) { console.error("::error::nessuna sorgente icona trovata"); process.exit(1); }
const hasMono = existsSync(MONO_SRC);
if (!hasMono) console.log("::warning::sorgente monochrome assente: salto il layer themed-icons");

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

function circleMask(s) {
  return Buffer.from(
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#ffffff"/></svg>`
  );
}

/* legacy mipmap + round (Android < 8), variante giorno */
for (const [d, s] of Object.entries(LEGACY)) {
  const dir = join(RES, "mipmap-" + d);
  mkdirSync(dir, { recursive: true });
  await sharp(light).resize(s, s, { fit: "cover" }).png().toFile(join(dir, "ic_launcher.png"));
  await sharp(light).resize(s, s, { fit: "cover" })
    .composite([{ input: circleMask(s), blend: "dest-in" }]).png()
    .toFile(join(dir, "ic_launcher_round.png"));
}
console.log("legacy mipmap ok (variante giorno)");

/* adaptive background day/night + monochrome, per densità */
for (const [d, s] of Object.entries(ADAPTIVE)) {
  const dayDir = join(RES, "drawable-" + d);
  const nightDir = join(RES, "drawable-night-" + d);
  mkdirSync(dayDir, { recursive: true });
  mkdirSync(nightDir, { recursive: true });
  await sharp(light).resize(s, s, { fit: "cover" }).png().toFile(join(dayDir, "ic_launcher_background.png"));
  await sharp(dark).resize(s, s, { fit: "cover" }).png().toFile(join(nightDir, "ic_launcher_background.png"));
  if (hasMono) {
    await sharp(MONO_SRC, { density: 300 })
      .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(dayDir, "ic_launcher_monochrome.png"));
  }
}
console.log("adaptive background day/night + monochrome ok");

/* adaptive-icon XML (monochrome ignorato sotto API 31) */
const mono = hasMono
  ? `    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n`
  : "";
const ADAPTIVE_XML =
  `<?xml version="1.0" encoding="utf-8"?>\n` +
  `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
  `    <background android:drawable="@drawable/ic_launcher_background"/>\n` +
  `    <foreground android:drawable="@android:color/transparent"/>\n` +
  mono +
  `</adaptive-icon>\n`;

const anydpi = join(RES, "mipmap-anydpi-v26");
mkdirSync(anydpi, { recursive: true });
writeFileSync(join(anydpi, "ic_launcher.xml"), ADAPTIVE_XML);
writeFileSync(join(anydpi, "ic_launcher_round.xml"), ADAPTIVE_XML);
console.log("adaptive-icon XML ok");

console.log("Icone generate: giorno chiara · notte scura · monochrome per themed icons.");
