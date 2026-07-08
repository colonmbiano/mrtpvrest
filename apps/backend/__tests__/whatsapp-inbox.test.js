'use strict';

// Tests de la bandeja de entrada de WhatsApp:
//  - Persistencia de entrantes/salientes (conversación + mensaje).
//  - Detección de "quiero hablar con un humano" y escalación con aviso al dueño.
//  - Handoff: con la conversación en NEEDS_HUMAN el bot guarda pero NO contesta.
//  - Ventana de 24h.
// Mockeamos Prisma y axios para no tocar BD ni red.

let mockAxiosPost;

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    whatsappConversation: {
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    whatsappMessage: { create: jest.fn().mockResolvedValue({}) },
    restaurant: { findUnique: jest.fn() },
    restaurantConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    integrationConfig: { findFirst: jest.fn() },
    location: { findMany: jest.fn().mockResolvedValue([]) },
    whatsappSession: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('axios', () => {
  mockAxiosPost = jest.fn().mockResolvedValue({ data: { id: 'sent' } });
  return { post: (...args) => mockAxiosPost(...args), get: jest.fn() };
});

const { prisma } = require('@mrtpvrest/database');
const inbox = require('../src/services/whatsapp-bot/inbox');
const { norm } = require('../src/services/whatsapp-bot/engine');
const bot = require('../src/services/whatsapp-bot');

const CFG_WHAPI = JSON.stringify({ provider: 'WHAPI', token: 'tok-1', ownerPhone: '5215599990000' });
const restaurant = { id: 'r1', name: 'Tacos Don Juan', slug: 'tacos', isActive: true };
const integration = { config: CFG_WHAPI };

function conversationRow(overrides = {}) {
  return {
    id: 'c1',
    restaurantId: 'r1',
    phone: '5215511112222',
    status: 'OPEN',
    lastInboundAt: new Date(),
    unreadCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.whatsappConversation.upsert.mockResolvedValue(conversationRow());
});

describe('inbox.wantsHuman', () => {
  const positives = [
    'quiero hablar con un humano',
    'me puede atender una persona',
    'necesito un asesor',
    'quiero hablar con alguien',
    'pásame al gerente',
  ];
  const negatives = ['quiero 2 hamburguesas', 'menú', '1', 'finalizar', 'sí'];

  test.each(positives)('detecta: "%s"', (text) => {
    expect(inbox.wantsHuman(norm(text))).toBe(true);
  });

  test.each(negatives)('no detecta: "%s"', (text) => {
    expect(inbox.wantsHuman(norm(text))).toBe(false);
  });
});

describe('inbox.windowOpen', () => {
  it('abierta si el último entrante tiene menos de 24h', () => {
    expect(inbox.windowOpen(new Date(Date.now() - 60 * 60 * 1000))).toBe(true);
  });
  it('cerrada pasadas 24h o sin entrantes', () => {
    expect(inbox.windowOpen(new Date(Date.now() - 25 * 60 * 60 * 1000))).toBe(false);
    expect(inbox.windowOpen(null)).toBe(false);
  });
});

describe('inbox.recordInbound', () => {
  const message = { id: 'wamid.1', from: '5215511112222', fromName: 'Ana', type: 'text', text: 'hola' };

  it('hace upsert del hilo y persiste el mensaje entrante', async () => {
    await inbox.recordInbound(prisma, 'r1', message);

    expect(prisma.whatsappConversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId_phone: { restaurantId: 'r1', phone: '5215511112222' } },
        update: expect.objectContaining({ unreadCount: { increment: 1 } }),
      })
    );
    expect(prisma.whatsappMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'c1',
        restaurantId: 'r1',
        direction: 'IN',
        body: 'hola',
        waMessageId: 'wamid.1',
        sentBy: 'CUSTOMER',
      }),
    });
  });

  it('reabre un hilo RESOLVED cuando llega mensaje nuevo', async () => {
    prisma.whatsappConversation.upsert.mockResolvedValue(conversationRow({ status: 'RESOLVED' }));

    const conversation = await inbox.recordInbound(prisma, 'r1', message);

    expect(conversation.status).toBe('OPEN');
    expect(prisma.whatsappConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) })
    );
  });
});

describe('inbox.escalate', () => {
  it('marca NEEDS_HUMAN y avisa al dueño por su WhatsApp personal', async () => {
    prisma.whatsappConversation.upsert.mockResolvedValue(conversationRow({ status: 'NEEDS_HUMAN' }));
    const cfg = { provider: 'WHAPI', token: 'tok-1', apiUrl: 'https://gate.whapi.cloud', ownerPhone: '5215599990000' };

    await inbox.escalate({ prisma, cfg, restaurant, phone: '5215511112222', reason: 'lo pidió' });

    expect(prisma.whatsappConversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'NEEDS_HUMAN' }) })
    );
    // El aviso va al número del dueño, no al del cliente.
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/messages/text'),
      expect.objectContaining({ to: '5215599990000@s.whatsapp.net' }),
      expect.anything()
    );
  });

  it('sin ownerPhone configurado no manda aviso', async () => {
    prisma.whatsappConversation.upsert.mockResolvedValue(conversationRow({ status: 'NEEDS_HUMAN' }));

    await inbox.escalate({
      prisma,
      cfg: { provider: 'WHAPI', token: 'tok-1', apiUrl: 'https://gate.whapi.cloud', ownerPhone: null },
      restaurant,
      phone: '5215511112222',
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});

describe('bot.processMessage :: handoff humano', () => {
  const inboundText = (text) => ({ id: 'wamid.x', from: '5215511112222', fromName: 'Ana', type: 'text', text });

  it('con el hilo en NEEDS_HUMAN guarda el mensaje pero el bot NO contesta', async () => {
    prisma.whatsappConversation.upsert.mockResolvedValue(conversationRow({ status: 'NEEDS_HUMAN' }));

    await bot.processMessage({ restaurant, integration, message: inboundText('hola?'), io: null });

    expect(prisma.whatsappMessage.create).toHaveBeenCalled(); // quedó en el hilo
    expect(mockAxiosPost).not.toHaveBeenCalled(); // sin respuesta del bot
    expect(prisma.restaurantConfig.findUnique).not.toHaveBeenCalled(); // ni llegó al motor
  });

  it('cuando el cliente pide un humano: escala, avisa al dueño y confirma al cliente', async () => {
    await bot.processMessage({
      restaurant,
      integration,
      message: inboundText('quiero hablar con un humano por favor'),
      io: null,
    });

    const targets = mockAxiosPost.mock.calls.map(([, body]) => body.to);
    expect(targets).toContain('5215599990000@s.whatsapp.net'); // aviso al dueño
    expect(targets).toContain('5215511112222@s.whatsapp.net'); // confirmación al cliente

    // La escalación quedó persistida (upsert con NEEDS_HUMAN).
    const escalations = prisma.whatsappConversation.upsert.mock.calls.filter(
      ([args]) => args.update?.status === 'NEEDS_HUMAN'
    );
    expect(escalations.length).toBe(1);
  });
});
