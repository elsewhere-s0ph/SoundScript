#!/usr/bin/env node
/* Genera le icone launcher Android dalle PNG della PWA.
   Sovrascrive le mipmap di default di Capacitor a tutte le densità e
   rimuove la adaptive-icon XML di default, così il launcher usa le PNG
   reali (icona SoundScript) invece del segnaposto vuoto. */
import sharp from "sharp";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ANY = "public/icons/icon-512.png";
const MASK = "public/icons/icon-maskable-512.png";
const RES = "android/app/src/main/res";

if (!existsSync(ANY)) {
  console.error("::error::" + ANY + " non trovato");
  process.exit(1);
}
const src = existsSync(MASK) ? MASK : ANY;

const DENS = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function circleMask(s) {
  return Buffer.from(
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#ffffff"/></svg>`
  );
}

for (const [d, s] of Object.entries(DENS)) {
  const dir = join(RES, "mipmap-" + d);
  mkdirSync(dir, { recursive: true });

  await sharp(src).resize(s, s, { fit: "cover" }).png()
    .toFile(join(dir, "ic_launcher.png"));

  await sharp(src).resize(s, s, { fit: "cover" })
    .composite([{ input: circleMask(s), blend: "dest-in" }])
    .png()
    .toFile(join(dir, "ic_launcher_round.png"));

  console.log("mipmap-" + d + " · " + s + "px");
}

// Rimuovi la adaptive-icon di default: altrimenti Android 8+ preferisce
// quella XML (segnaposto) alle PNG appena generate.
for (const v of ["mipmap-anydpi-v26", "mipmap-anydpi"]) {
  for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const p = join(RES, v, f);
    if (existsSync(p)) { rmSync(p); console.log("rimosso " + p); }
  }
}

console.log("Icone Android generate.");