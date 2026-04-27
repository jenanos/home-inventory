// Renders apps/web/public/icon.svg to PNG at the sizes Chrome requires for
// PWA installability (192, 512). Run with `node apps/web/scripts/generate-icons.mjs`
// after updating the SVG.

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, "..", "public")
const svgPath = resolve(publicDir, "icon.svg")

const sizes = [
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" },
]

const svg = await readFile(svgPath)

for (const { size, file } of sizes) {
  const out = resolve(publicDir, file)
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log(`wrote ${out}`)
}
