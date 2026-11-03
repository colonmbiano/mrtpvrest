// Genera los PNG de public/icons desde sus SVG (node scripts/generate-icons.mjs,
// desde apps/client). Los PNG se versionan: el build no los genera. Usa el sharp
// que ya instala Next como dependencia opcional.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(createRequire(import.meta.url).resolve('next/package.json'));
const sharp = require('sharp');
const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));

const ICONS = [
  ['marketplace-icon.svg', 'marketplace-192.png', 192],
  ['marketplace-icon.svg', 'marketplace-512.png', 512],
  ['marketplace-maskable.svg', 'marketplace-maskable-512.png', 512],
  ['marketplace-maskable.svg', 'marketplace-apple-touch-icon.png', 180],
  ['store-icon.svg', 'icon-192.png', 192],
  ['store-icon.svg', 'icon-512.png', 512],
  ['store-icon.svg', 'apple-touch-icon.png', 180],
];

for (const [source, target, size] of ICONS) {
  const svg = await readFile(dir + source);
  let image = sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 }).resize(size, size);
  // iOS pinta de negro la transparencia del apple-touch-icon: va opaco.
  if (target.includes('apple-touch')) image = image.flatten({ background: '#ffffff' });
  await image.png({ compressionLevel: 9 }).toFile(dir + target);
  console.log(`${target} (${size}×${size})`);
}
