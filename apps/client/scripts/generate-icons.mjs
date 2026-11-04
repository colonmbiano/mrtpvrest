// Genera los PNG de public/icons y de la app Android desde sus SVG
// (node scripts/generate-icons.mjs, desde apps/client). Los PNG se versionan: el
// build no los genera. Usa el sharp que ya instala Next como dependencia opcional.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(createRequire(import.meta.url).resolve('next/package.json'));
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));

const WEB = 'public/icons/';
const RES = 'android/app/src/main/res/';
// Densidades de Android: el tamaño en dp por este factor da los píxeles.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const perDensity = (source, folder, name, dp) =>
  Object.entries(DENSITIES).map(([density, factor]) => [source, `${RES}${folder}-${density}/${name}`, dp * factor]);

const ICONS = [
  [WEB + 'marketplace-icon.svg', WEB + 'marketplace-192.png', 192],
  [WEB + 'marketplace-icon.svg', WEB + 'marketplace-512.png', 512],
  [WEB + 'marketplace-maskable.svg', WEB + 'marketplace-maskable-512.png', 512],
  [WEB + 'marketplace-maskable.svg', WEB + 'marketplace-apple-touch-icon.png', 180],
  [WEB + 'store-icon.svg', WEB + 'icon-192.png', 192],
  [WEB + 'store-icon.svg', WEB + 'icon-512.png', 512],
  [WEB + 'store-icon.svg', WEB + 'apple-touch-icon.png', 180],
  // Android: ícono clásico (antes de Android 8), capa del adaptable, pantalla de
  // inicio de la TWA y el ícono de los avisos en la barra.
  ...perDensity(WEB + 'marketplace-icon.svg', 'mipmap', 'ic_launcher.png', 48),
  ...perDensity('android/icons/launcher-foreground.svg', 'mipmap', 'ic_launcher_foreground.png', 108),
  ...perDensity(WEB + 'marketplace-icon.svg', 'drawable', 'splash.png', 144),
  ...perDensity('android/icons/notification.svg', 'drawable', 'ic_notification_icon.png', 24),
];

for (const [source, target, size] of ICONS) {
  const svg = await readFile(root + source);
  let image = sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 }).resize(size, size);
  // iOS pinta de negro la transparencia del apple-touch-icon: va opaco.
  if (target.includes('apple-touch')) image = image.flatten({ background: '#ffffff' });
  await mkdir(dirname(root + target), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(root + target);
  console.log(`${target} (${size}×${size})`);
}
