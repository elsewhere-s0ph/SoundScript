#!/usr/bin/env node
/* Rasterizza il banner SVG pulito in public/icons/og-1200.png (anteprima social).
   Così il PNG non invecchia mai più rispetto al SVG: si rigenera da esso. */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/og-banner.svg");
await sharp(svg, { density: 96 })
  .resize(1200, 630, { fit: "cover" })
  .png()
  .toFile("public/icons/og-1200.png");
console.log("og-1200.png rigenerato dal banner pulito.");