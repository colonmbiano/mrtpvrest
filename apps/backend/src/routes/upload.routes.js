const express  = require('express');
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const { upload, uploadImage } = require('../services/cloudinary.service');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

const MAX_REMOTE_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_REMOTE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Middleware para permitir ADMIN o SUPER_ADMIN
const requireStaffOrSuper = (req, res, next) => {
  if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN')) {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado' });
  }
};


function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 0) return true;
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

async function assertPublicImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error('URL de imagen invalida');
    err.statusCode = 400;
    throw err;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const err = new Error('Solo se permiten URLs http o https');
    err.statusCode = 400;
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    const err = new Error('URL de imagen no permitida');
    err.statusCode = 400;
    throw err;
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    const err = new Error('URL de imagen no permitida');
    err.statusCode = 400;
    throw err;
  }

  return parsed.toString();
}

async function downloadPublicImage(sourceUrl, redirectsRemaining = 2) {
  const response = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 12000,
    maxRedirects: 0,
    maxContentLength: MAX_REMOTE_IMAGE_BYTES,
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.location;
    if (!location || redirectsRemaining <= 0) {
      const err = new Error('No se pudo seguir la redireccion de la imagen');
      err.statusCode = 400;
      throw err;
    }
    const nextUrl = await assertPublicImageUrl(new URL(location, sourceUrl).toString());
    return downloadPublicImage(nextUrl, redirectsRemaining - 1);
  }

  return response;
}

router.post('/image', authenticate, requireTenantAccess, requireStaffOrSuper, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    // Si viene de un restaurante, lo ponemos en su carpeta, si no, en 'global'
    const folder = req.restaurantSlug || 'global';
    const url = await uploadImage(req.file.buffer, folder);

    res.json({ url });
  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({ error: 'Error al subir imagen a la nube' });
  }
});


router.post('/image-from-url', authenticate, requireTenantAccess, requireStaffOrSuper, async (req, res) => {
  try {
    const sourceUrl = await assertPublicImageUrl(String(req.body?.url || '').trim());
    const response = await downloadPublicImage(sourceUrl);

    const contentType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!ALLOWED_REMOTE_IMAGE_TYPES.has(contentType)) {
      return res.status(400).json({ error: 'La URL no devuelve una imagen JPG, PNG o WebP' });
    }

    const buffer = Buffer.from(response.data);
    if (!buffer.length) return res.status(400).json({ error: 'La imagen descargada esta vacia' });
    if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
      return res.status(413).json({ error: 'La imagen supera el limite de 6 MB' });
    }

    const folder = req.restaurantSlug || 'global';
    const url = await uploadImage(buffer, folder);
    res.json({ url });
  } catch (error) {
    const status =
      error.statusCode ||
      (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' ? 413 : null) ||
      (error.response ? 400 : null) ||
      (error.code === 'ERR_BAD_RESPONSE' ? 400 : 500);
    if (status >= 500) console.error('Error al importar imagen por URL:', error);
    res.status(status).json({ error: status >= 500 ? 'Error al importar imagen' : error.message });
  }
});

module.exports = router;
