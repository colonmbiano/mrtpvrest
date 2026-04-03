require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

async function uploadImage(buffer, folder = 'menu') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `master-burgers/${folder}`, transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }] },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

module.exports = { upload, uploadImage };
