require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de imagen no permitido'));
  },
});

// Transformaciones de subida por tipo de imagen. Productos/logos van cuadrados
// (800x800); los banners en 16:9 nativo para no perder los lados ni el tope al
// recortar después en el render. Cambiar 'default' afecta a TODO el catálogo.
const UPLOAD_TRANSFORMS = {
  default: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
  banner:  [{ width: 1280, height: 720, crop: 'fill', quality: 'auto' }],
  // hero = imagen de portada ancha del storefront. NO recortamos (crop: limit):
  // solo limitamos el ancho conservando la proporción original, para no perder
  // los lados de un banner panorámico (p.ej. balón a la izq. y copa a la der.).
  hero:    [{ width: 1600, crop: 'limit', quality: 'auto' }],
};

async function uploadImage(buffer, folder = 'menu', mode = 'default') {
  const transformation = UPLOAD_TRANSFORMS[mode] || UPLOAD_TRANSFORMS.default;
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `master-burgers/${folder}`, transformation },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

module.exports = { upload, uploadImage };
