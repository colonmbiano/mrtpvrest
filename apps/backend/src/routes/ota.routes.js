// OTA — endpoints para Capacitor live updates del TPV.
//
// Flujo:
// 1) El plugin @capgo/capacitor-updater en el TPV hace POST /api/ota/check con
//    su versión actual y canal. El backend responde con la última versión
//    activa y una signed URL de descarga si hay update disponible.
// 2) El plugin descarga el zip en background y lo aplica en el próximo arranque.
// 3) Para publicar nuevas versiones: POST /api/ota/publish (multipart) desde
//    el script `pnpm --filter @mrtpvrest/tpv ota:release`.
//
// Auth:
// - /check es público (cada TPV se identifica por appId, no por user). Esto es
//   el patrón que el plugin de Capgo asume para self-hosted.
// - /publish, /bundles, /bundles/:id requieren SUPER_ADMIN porque tocan
//   distribución global de software a todos los tenants.

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const semver = (() => {
  // Mini-comparador semver suficiente para "X.Y.Z" sin pre-release.
  // Evitamos agregar la dep `semver` solo para esto.
  const parse = (v) => String(v || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  return {
    gt: (a, b) => {
      const [aM, am, ap] = parse(a);
      const [bM, bm, bp] = parse(b);
      if (aM !== bM) return aM > bM;
      if (am !== bm) return am > bm;
      return ap > bp;
    },
  };
})();

const prisma = require('@mrtpvrest/database').prisma;
const { authenticate } = require('../middleware/auth.middleware');
const {
  uploadBundle,
  createSignedDownloadUrl,
  deleteBundle,
} = require('../lib/supabase-storage');

const router = express.Router();

const OTA_APPS = {
  tpv: {
    appId: 'com.mrtpvrest.tpv',
    workflow: 'tpv-ota-release.yml',
  },
  delivery: {
    appId: 'com.mrtpvrest.delivery',
    workflow: 'delivery-ota-release.yml',
  },
  kiosk: {
    appId: 'com.mrtpvrest.kiosk',
    workflow: 'kiosk-ota-release.yml',
  },
  kds: {
    appId: 'com.mrtpvrest.kds',
    workflow: 'kds-ota-release.yml',
  },
  'meseros-lite': {
    appId: 'com.mrtpvrest.meseroslite',
    workflow: 'meseros-lite-ota-release.yml',
  },
  inventario: {
    appId: 'com.mrtpvrest.inventario',
    workflow: 'inventario-ota-release.yml',
  },
  moda: {
    appId: 'com.mrtpvrest.moda',
    workflow: 'moda-ota-release.yml',
  },
};

const resolveOtaApp = (raw) => {
  const value = String(raw || 'tpv').trim();
  if (OTA_APPS[value]) return OTA_APPS[value];
  return Object.values(OTA_APPS).find((app) => app.appId === value) || OTA_APPS.tpv;
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') return next();
  return res.status(403).json({ error: 'Solo SUPER_ADMIN puede gestionar OTA' });
};

// Comparacion en tiempo constante para evitar timing attacks al validar tokens.
const timingSafeEqualStr = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

// Auth para publicar bundles OTA. Acepta tokens de CI o JWT humano SUPER_ADMIN.
const authenticateOtaPublisher = (req, res, next) => {
  const serviceToken = process.env.OTA_PUBLISH_TOKEN;
  const authHeader = req.headers.authorization || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const buildToken = req.headers['x-ota-build-token'];

  if (serviceToken && presented && timingSafeEqualStr(presented, serviceToken)) {
    req.user = {
      id: 'ota-service',
      name: 'OTA Service Token',
      email: null,
      role: 'SUPER_ADMIN',
      isServiceToken: true,
    };
    return next();
  }

  if (
    process.env.OTA_BUILD_SECRET &&
    buildToken &&
    timingSafeEqualStr(buildToken, process.env.OTA_BUILD_SECRET)
  ) {
    req.user = {
      id: 'ota-buildbot',
      name: 'OTA Build Token',
      email: 'buildbot@mrtpvrest.com',
      role: 'SUPER_ADMIN',
      isServiceToken: true,
    };
    return next();
  }

  return authenticate(req, res, () => requireSuperAdmin(req, res, next));
};

// 50 MB max por bundle. El zip de un Next static export del TPV ronda 5-15 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: el TPV consulta si hay update disponible.
//
// El plugin @capgo/capacitor-updater envía POST con un body como:
//   { app_id, version_name, version_code, platform, custom_id, ... }
// y espera el manifest oficial de Capgo:
//   - Sin update:  {}  (objeto vacío) — el plugin no hace nada.
//   - Con update:  { version, url, checksum }  — el plugin descarga.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/check', async (req, res) => {
  try {
    const appId = req.body?.app_id || req.body?.appId || 'com.mrtpvrest.tpv';
    const currentVersion = req.body?.version_name || req.body?.version || '0.0.0';
    const channel = req.body?.channel || req.body?.defaultChannel || 'production';

    const latest = await prisma.otaBundle.findFirst({
      where: { appId, channel, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 1, // optimización
    });

    if (!latest || !semver.gt(latest.version, currentVersion)) {
      return res.json({});
    }

    const url = await createSignedDownloadUrl(latest.storagePath, 60 * 60); // 1h

    return res.json({
      version: latest.version,
      url,
      checksum: latest.checksum,
    });
  } catch (e) {
    console.error('POST /api/ota/check:', e);
    return res.status(500).json({ error: 'OTA check failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: publicar nuevo bundle. Multipart con campo `bundle` (zip) +
// metadata en body: appId, version, channel, notes, minNative.
// El checksum sha256 se calcula en el backend para evitar tampering del cliente.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/publish',
  authenticateOtaPublisher,
  upload.single('bundle'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Falta el archivo bundle' });

      const appId = req.body?.appId || 'com.mrtpvrest.tpv';
      const version = String(req.body?.version || '').trim();
      const channel = (req.body?.channel || 'production').trim();
      const notes = req.body?.notes || null;
      const minNative = req.body?.minNative || null;

      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return res.status(400).json({ error: 'version inválida (esperado X.Y.Z)' });
      }

      const buffer = req.file.buffer;
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const storagePath = `${appId}/${channel}/${version}-${Date.now()}.zip`;

      await uploadBundle(storagePath, buffer);

      const bundle = await prisma.otaBundle.upsert({
        where: { appId_channel_version: { appId, channel, version } },
        create: {
          appId,
          channel,
          version,
          storagePath,
          checksum,
          sizeBytes: buffer.length,
          notes,
          minNative,
          isActive: true,
        },
        update: {
          storagePath,
          checksum,
          sizeBytes: buffer.length,
          notes,
          minNative,
          isActive: true,
        },
      });

      return res.status(201).json({ ok: true, bundle });
    } catch (e) {
      console.error('POST /api/ota/publish:', e);
      return res.status(500).json({ error: e.message || 'OTA publish failed' });
    }
  }
);

// ADMIN: listar bundles por canal.
router.get('/bundles', authenticate, requireSuperAdmin, async (req, res) => {
  const appId = req.query.appId || 'com.mrtpvrest.tpv';
  const channel = req.query.channel || 'production';
  const bundles = await prisma.otaBundle.findMany({
    where: { appId, channel },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ bundles });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: dispara manualmente el workflow de GitHub Actions que builda y
// publica un nuevo bundle. Útil para forzar un release sin esperar al
// próximo push (ej. desde la UI del SaaS).
//
// Requiere GITHUB_TOKEN (PAT con scope workflow) y GITHUB_REPO (owner/repo).
// El PAT vive solo del lado servidor para no exponerlo en la SPA.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trigger-build', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const channel = req.body?.channel || 'production';
    const notes = req.body?.notes || '';
    const ref = req.body?.ref || 'master';
    const otaApp = resolveOtaApp(req.body?.appKey || req.body?.app || req.body?.appId);

    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPO;
    if (!ghToken || !ghRepo) {
      return res.status(500).json({
        error: 'GITHUB_TOKEN y GITHUB_REPO no configurados en el backend',
      });
    }

    const url = `https://api.github.com/repos/${ghRepo}/actions/workflows/${otaApp.workflow}/dispatches`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: { channel, notes } }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({
        error: `GitHub API ${r.status}: ${text.slice(0, 300)}`,
      });
    }

    // GitHub responde 204 sin body; devolvemos OK + URL de Actions para
    // que el SaaS ofrezca un link directo al run.
    res.json({
      ok: true,
      appId: otaApp.appId,
      actionsUrl: `https://github.com/${ghRepo}/actions/workflows/${otaApp.workflow}`,
    });
  } catch (e) {
    console.error('POST /api/ota/trigger-build:', e);
    res.status(500).json({ error: e.message || 'Trigger failed' });
  }
});

// ADMIN: desactivar un bundle (soft delete; el archivo en storage se borra).
// Útil para rollback inmediato — cualquier TPV que aún no haya descargado
// dejará de ver esta versión y caerá a la anterior activa.
router.delete('/bundles/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const bundle = await prisma.otaBundle.findUnique({ where: { id: req.params.id } });
    if (!bundle) return res.status(404).json({ error: 'No existe' });

    await prisma.otaBundle.update({
      where: { id: bundle.id },
      data: { isActive: false },
    });

    // Mejor esfuerzo — si la limpieza del storage falla no es bloqueante.
    deleteBundle(bundle.storagePath).catch((err) =>
      console.error('OTA storage cleanup failed:', err.message)
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/ota/bundles:', e);
    res.status(500).json({ error: 'OTA delete failed' });
  }
});

module.exports = router;
