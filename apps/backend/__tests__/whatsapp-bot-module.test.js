'use strict';

// Fase C: el bot de WhatsApp como módulo facturable. Verifica que la clave
// esté registrada en el catálogo canónico y que el gate tenga rollout suave
// (apagado por default → no rompe bots activos).

// lib/modules importa @mrtpvrest/database (requiere DATABASE_URL). Lo mockeamos
// para no tocar BD; el modo suave ni siquiera consulta Prisma.
jest.mock('@mrtpvrest/database', () => ({
  prisma: { restaurant: { findUnique: jest.fn() } },
}));

describe('whatsapp_bot :: catálogo de módulos', () => {
  const tm = require('../src/lib/tenantModules');

  test('whatsapp_bot es una clave canónica válida', () => {
    expect(tm.toCanonicalKey('whatsapp_bot')).toBe('whatsapp_bot');
  });

  test('el alias "chatbot" resuelve a whatsapp_bot', () => {
    expect(tm.toCanonicalKey('chatbot')).toBe('whatsapp_bot');
  });

  test('whatsapp_bot es un módulo opcional gestionable por plan (kind key)', () => {
    expect(tm.VALID_MODULE_KEYS.has('whatsapp_bot')).toBe(true);
  });
});

describe('whatsapp_bot :: gate de entitlement', () => {
  const OLD = process.env.ENFORCE_BOT_MODULE;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ENFORCE_BOT_MODULE;
    else process.env.ENFORCE_BOT_MODULE = OLD;
    jest.resetModules();
  });

  test('con ENFORCE_BOT_MODULE apagado, botModuleAllowed deja pasar (rollout suave)', async () => {
    delete process.env.ENFORCE_BOT_MODULE;
    jest.resetModules();
    const { botModuleAllowed, isBotEnforceMode } = require('../src/lib/modules');
    expect(isBotEnforceMode()).toBe(false);
    // No toca la BD en modo suave: devuelve true sin consultar Prisma.
    await expect(botModuleAllowed('cualquier-id')).resolves.toBe(true);
  });
});
