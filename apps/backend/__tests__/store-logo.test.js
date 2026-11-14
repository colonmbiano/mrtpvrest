'use strict';

// Tests de GET /api/store/logo y de lib/public-store-logo: el logo de la tienda
// se guarda como data URL en base64 y se sirve como imagen para el catálogo del
// marketplace. Solo se publican PNG/JPEG/WebP cuyo contenido coincide con su tipo.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
  },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const storeRoutes = require('../src/routes/store.routes');
const { decodeStoreLogo, publicStoreLogoUrl } = require('../src/lib/public-store-logo');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', storeRoutes);
  return app;
}

const PNG_BYTES = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('contenido')]);
const JPEG_BYTES = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.from('contenido')]);
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('contenido')]);
const dataUrl = (type, bytes) => `data:image/${type};base64,${bytes.toString('base64')}`;
const store = (logoUrl, extra = {}) => ({ id: 'r1', slug: 'tacos', isActive: true, logoUrl, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PUBLIC_API_URL;
});

describe('GET /api/store/logo', () => {
  test('sirve el logo como imagen, incrustable desde otro origen', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(store(dataUrl('png', PNG_BYTES)));

    const res = await request(makeApp()).get('/api/store/logo?r=tacos').expect(200);

    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({ where: { slug: 'tacos' } });
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(Buffer.compare(res.body, PNG_BYTES)).toBe(0);
  });

  test('404 si la tienda no tiene logo, es una URL o no es una imagen permitida', async () => {
    const app = makeApp();
    for (const logoUrl of [null, 'https://cdn.example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zy8+']) {
      prisma.restaurant.findUnique.mockResolvedValue(store(logoUrl));
      await request(app).get('/api/store/logo?r=tacos').expect(404);
    }
  });

  test('respeta las reglas de la tienda: sin slug 400, inexistente 404, inactiva 403', async () => {
    const app = makeApp();
    await request(app).get('/api/store/logo').expect(400);

    prisma.restaurant.findUnique.mockResolvedValue(null);
    await request(app).get('/api/store/logo?r=nadie').expect(404);

    prisma.restaurant.findUnique.mockResolvedValue(store(dataUrl('png', PNG_BYTES), { isActive: false }));
    await request(app).get('/api/store/logo?r=tacos').expect(403);
  });
});

describe('decodeStoreLogo', () => {
  test('acepta PNG, JPEG y WebP con su firma', () => {
    expect(decodeStoreLogo(dataUrl('png', PNG_BYTES))).toEqual({ bytes: PNG_BYTES, contentType: 'image/png' });
    expect(decodeStoreLogo(dataUrl('jpeg', JPEG_BYTES)).contentType).toBe('image/jpeg');
    expect(decodeStoreLogo(dataUrl('webp', WEBP_BYTES)).contentType).toBe('image/webp');
  });

  test('rechaza lo que no es una imagen raster válida', () => {
    expect(decodeStoreLogo(null)).toBeNull();
    expect(decodeStoreLogo('https://cdn.example.com/logo.png')).toBeNull();
    expect(decodeStoreLogo('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(decodeStoreLogo('data:text/html;base64,PGgxPg==')).toBeNull();
    // Tipo declarado PNG pero el contenido es JPEG: no se publica.
    expect(decodeStoreLogo(dataUrl('png', JPEG_BYTES))).toBeNull();
    expect(decodeStoreLogo('data:image/png;base64,no es base64!')).toBeNull();
    // Tope de tamaño del data URL (3 MB).
    expect(decodeStoreLogo(dataUrl('png', Buffer.concat([PNG_BYTES, Buffer.alloc(3 * 1024 * 1024)])))).toBeNull();
  });
});

describe('publicStoreLogoUrl', () => {
  test('enlaza a /api/store/logo con el slug escapado', () => {
    expect(publicStoreLogoUrl(dataUrl('png', PNG_BYTES), 'master-burguer-s'))
      .toBe('https://api.mrtpvrest.com/api/store/logo?r=master-burguer-s');
  });

  test('usa PUBLIC_API_URL solo si es https; sin logo válido no hay enlace', () => {
    process.env.PUBLIC_API_URL = 'https://api.staging.example.com/';
    expect(publicStoreLogoUrl(dataUrl('png', PNG_BYTES), 'tacos')).toBe('https://api.staging.example.com/api/store/logo?r=tacos');

    process.env.PUBLIC_API_URL = 'http://api.example.com';
    expect(publicStoreLogoUrl(dataUrl('png', PNG_BYTES), 'tacos')).toBeUndefined();

    delete process.env.PUBLIC_API_URL;
    expect(publicStoreLogoUrl('https://cdn.example.com/logo.png', 'tacos')).toBeUndefined();
  });
});
