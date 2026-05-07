'use strict';

// Mock Prisma para no depender de DB real.
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
  },
}));

// Mock de la utilidad de descifrado para que el test no dependa de
// AI_ENCRYPTION_KEY. Por defecto devuelve la string tal cual.
jest.mock('../src/lib/secret-crypto', () => ({
  decryptSecret: jest.fn((s) => s),
}));

const { prisma } = require('@mrtpvrest/database');
const { resolveGroqKey, resolveGeminiKey } = require('../src/services/ai-key.service');

describe('ai-key.service', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GROQ_API_KEY;
    prisma.restaurant.findUnique.mockReset();
  });

  describe('resolveGeminiKey (vision)', () => {
    test('lanza AI_KEY_REQUIRED cuando GOOGLE_AI_API_KEY no está configurada', () => {
      expect(() => resolveGeminiKey()).toThrow(/GOOGLE_AI_API_KEY/);
      try { resolveGeminiKey(); } catch (e) {
        expect(e.code).toBe('AI_KEY_REQUIRED');
      }
    });

    test('devuelve la platform key cuando está configurada', () => {
      process.env.GOOGLE_AI_API_KEY = 'ai-studio-XYZ';
      const out = resolveGeminiKey();
      expect(out).toEqual({
        apiKey: 'ai-studio-XYZ',
        source: 'platform',
        provider: 'gemini',
      });
    });
  });

  describe('resolveGroqKey (chat/texto)', () => {
    test('lanza BAD_REQUEST cuando no hay restaurantId', async () => {
      await expect(resolveGroqKey({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    test('lanza NOT_FOUND cuando el restaurante no existe', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(resolveGroqKey({ restaurantId: 'r1' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('usa la BYOK del restaurante si existe', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        aiApiKey: 'gsk_byok',
        tenant: { subscription: null },
      });
      const out = await resolveGroqKey({ restaurantId: 'r1' });
      expect(out).toEqual({ apiKey: 'gsk_byok', source: 'customer', provider: 'groq' });
    });

    test('fallback a platform key durante TRIAL activo', async () => {
      process.env.GROQ_API_KEY = 'gsk_platform';
      prisma.restaurant.findUnique.mockResolvedValue({
        aiApiKey: null,
        tenant: {
          subscription: {
            status: 'TRIAL',
            trialEndsAt: new Date(Date.now() + 86_400_000), // mañana
          },
        },
      });
      const out = await resolveGroqKey({ restaurantId: 'r1' });
      expect(out.source).toBe('platform-trial');
      expect(out.provider).toBe('groq');
      expect(out.apiKey).toBe('gsk_platform');
    });

    test('lanza AI_KEY_REQUIRED cuando no hay BYOK ni TRIAL activo', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        aiApiKey: null,
        tenant: {
          subscription: {
            status: 'TRIAL',
            trialEndsAt: new Date(Date.now() - 86_400_000), // ayer
          },
        },
      });
      await expect(resolveGroqKey({ restaurantId: 'r1' }))
        .rejects.toMatchObject({ code: 'AI_KEY_REQUIRED' });
    });
  });
});
