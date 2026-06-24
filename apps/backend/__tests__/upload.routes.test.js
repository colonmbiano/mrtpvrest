'use strict';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', tenantId: 'tenant-1', restaurantId: 'restaurant-1', role: 'ADMIN' };
    req.restaurantSlug = 'master-burger';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
}));

jest.mock('../src/services/cloudinary.service', () => ({
  upload: { single: () => (_req, _res, next) => next() },
  uploadImage: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const dns = require('dns').promises;
const { uploadImage } = require('../src/services/cloudinary.service');
const uploadRoutes = require('../src/routes/upload.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/upload', uploadRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('upload routes', () => {
  test('POST /api/upload/image-from-url downloads and stores a public image', async () => {
    axios.get.mockResolvedValue({
      headers: { 'content-type': 'image/jpeg' },
      data: Buffer.from('image-bytes'),
    });
    uploadImage.mockResolvedValue('https://cdn.example.com/menu/item.jpg');

    const res = await request(makeApp())
      .post('/api/upload/image-from-url')
      .send({ url: 'https://example.com/item.jpg' })
      .expect(200);

    expect(axios.get).toHaveBeenCalledWith('https://example.com/item.jpg', expect.objectContaining({
      responseType: 'arraybuffer',
    }));
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), 'master-burger');
    expect(res.body).toEqual({ url: 'https://cdn.example.com/menu/item.jpg' });
  });

  test('POST /api/upload/image-from-url rejects non-image responses', async () => {
    axios.get.mockResolvedValue({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html></html>'),
    });

    await request(makeApp())
      .post('/api/upload/image-from-url')
      .send({ url: 'https://example.com/page' })
      .expect(400);

    expect(uploadImage).not.toHaveBeenCalled();
  });

  test('POST /api/upload/image-from-url rejects local URLs', async () => {
    await request(makeApp())
      .post('/api/upload/image-from-url')
      .send({ url: 'http://localhost/image.jpg' })
      .expect(400);

    expect(axios.get).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
