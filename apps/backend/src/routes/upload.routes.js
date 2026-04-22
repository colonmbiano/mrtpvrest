const express  = require('express');
const { upload, uploadImage } = require('../services/cloudinary.service');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// Middleware para permitir ADMIN o SUPER_ADMIN
const requireStaffOrSuper = (req, res, next) => {
  if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN')) {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado' });
  }
};

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

module.exports = router;
