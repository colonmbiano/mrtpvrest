/**
 * scripts/upload-colorines-images.js
 *
 * Extrae las 27 imágenes originales embebidas (ASCII85 + DCTDecode/JPEG) de
 * Catalogo_ventas_Colorines.pdf, las sube a Cloudinary y actualiza imageUrl
 * en MenuItem, RetailProduct y RetailSku para el tenant "colorines".
 */

require('dotenv').config({ path: 'apps/backend/.env' });
const fs = require('fs');
let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
} catch {
  cloudinary = require('../apps/backend/node_modules/cloudinary').v2;
}
const { prisma, runWithBypass } = require('../packages/database/index.js');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Orden exacto de los 27 objetos de imagen en Catalogo_ventas_Colorines.pdf (páginas 1 a 6)
const ORDERED_SKUS = [
  // Página 1 — Detergentes y Suavizantes
  'DET-CLOR-37L',
  'DET-PERS-9L',
  'DET-MASC-664L',
  'SUA-BABY-3L',
  'SUA-MAGI-48L',
  'SUA-CSUP-48L',
  // Página 2 — Limpieza y Cuidado
  'LIMP-SALV-26L',
  'LIMP-REGJ-12R',
  'CUID-HUGG-960T',
  // Página 3 — Café y Despensa
  'CAF-NESO-180G',
  'CAF-NESC-180G',
  'CAF-NSTD-100G',
  'CAF-NSTV-100G',
  'BEB-STAM-12L',
  'DES-MRWA-1GAL',
  // Página 4 — Perfumería
  'PER-NAU83-100M',
  'PER-NAUV-100M',
  'PER-GUSD-34OZ',
  'PER-GUSM-25OZ',
  'PER-TOMM-100M',
  // Página 5 — Belleza y Básicos
  'BEL-MAYB-COQ',
  'BEL-MAYB-PET',
  'ROPA-CALC-10P',
  // Página 6 — Licores
  'LIC-DJ70-700M',
  'LIC-JD07-700M',
  'LIC-JDHO-700M',
  'LIC-JDBL-700M',
];

function ascii85Decode(input) {
  const s = input.replace(/\s+/g, '').replace(/~>$/, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === 'z') {
      out.push(0, 0, 0, 0);
      i += 1;
      continue;
    }
    const chunk = s.slice(i, i + 5);
    const pad = 5 - chunk.length;
    let val = 0;
    for (let j = 0; j < 5; j++) {
      const code = j < chunk.length ? chunk.charCodeAt(j) : 117; // 'u' = 117
      val = val * 85 + (code - 33);
    }
    const b0 = (val >>> 24) & 0xff;
    const b1 = (val >>> 16) & 0xff;
    const b2 = (val >>> 8) & 0xff;
    const b3 = val & 0xff;
    const bytes = [b0, b1, b2, b3];
    for (let j = 0; j < 4 - pad; j++) {
      out.push(bytes[j]);
    }
    i += 5;
  }
  return Buffer.from(out);
}

function extractJpegsFromPdf(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const str = buf.toString('latin1');
  const re = /\/Subtype\s*\/Image[\s\S]{0,400}?\/Length\s+(\d+)[\s\S]{0,100}?stream\r?\n/g;
  const jpegs = [];
  let m;
  while ((m = re.exec(str)) !== null) {
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    const rawStream = str.slice(start, start + len);
    const jpgBuffer = ascii85Decode(rawStream);
    jpegs.push(jpgBuffer);
  }
  return jpegs;
}

function uploadBufferToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'mrtpvrest/colorines',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ width: 900, height: 900, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

async function main() {
  const pdfPath = 'C:/Users/colon/Downloads/Catalogo_ventas_Colorines.pdf';
  console.log('📄 Extrayendo 27 imágenes JPEG originales del PDF...');
  const jpegs = extractJpegsFromPdf(pdfPath);
  if (jpegs.length !== ORDERED_SKUS.length) {
    throw new Error(`Se esperaban ${ORDERED_SKUS.length} imágenes y se encontraron ${jpegs.length}`);
  }
  console.log(`✅ ${jpegs.length} imágenes JPEG decodificadas correctamente.`);

  await runWithBypass(async () => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'colorines' },
    });
    if (!restaurant) throw new Error('No se encontró el restaurante colorines');

    // Subir en lotes de 6 en paralelo para mayor velocidad
    const BATCH = 6;
    for (let i = 0; i < ORDERED_SKUS.length; i += BATCH) {
      const slice = ORDERED_SKUS.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (skuCode, offset) => {
          const idx = i + offset;
          const jpg = jpegs[idx];
          const url = await uploadBufferToCloudinary(jpg, skuCode.toLowerCase());

          const retailSku = await prisma.retailSku.findUnique({
            where: {
              restaurantId_sku: {
                restaurantId: restaurant.id,
                sku: skuCode,
              },
            },
            include: { product: true },
          });

          if (retailSku) {
            await prisma.retailSku.update({
              where: { id: retailSku.id },
              data: { imageUrl: url },
            });
            await prisma.retailProduct.update({
              where: { id: retailSku.productId },
              data: { imageUrl: url },
            });
            await prisma.menuItem.updateMany({
              where: {
                restaurantId: restaurant.id,
                name: retailSku.product.name,
              },
              data: { imageUrl: url, imageFit: 'contain' },
            });
            console.log(`  🖼️ [${idx + 1}/27] ${skuCode} (${retailSku.product.name}) → ${url}`);
          }
        })
      );
    }
  });

  console.log('🎉 ¡Las 27 fotografías reales están en Cloudinary y vinculadas a Colorines!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
