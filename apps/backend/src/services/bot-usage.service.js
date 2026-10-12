'use strict';

const { prisma } = require('@mrtpvrest/database');

const MAX_COUNT = 1_000_000_000;

// Tarifas estándar de Gemini 2.5 Flash verificadas el 2026-10-12.
// Se pueden sobreescribir sin deploy si Google cambia el precio.
const GEMINI_25_FLASH_INPUT_USD_PER_M = Number(process.env.GEMINI_25_FLASH_INPUT_USD_PER_M || 0.30);
const GEMINI_25_FLASH_OUTPUT_USD_PER_M = Number(process.env.GEMINI_25_FLASH_OUTPUT_USD_PER_M || 2.50);

function count(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_COUNT, Math.trunc(n));
}

function text(value, max = 120) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 1_000_000);
}

function estimateCostUsd({ aiProvider, aiModel, inputTokens, outputTokens, reported }) {
  const explicit = money(reported);
  if (explicit > 0) return explicit;
  const provider = String(aiProvider || '').toLowerCase();
  const model = String(aiModel || '').toLowerCase();
  if (provider === 'gemini' && model === 'gemini-2.5-flash') {
    return (inputTokens / 1_000_000) * GEMINI_25_FLASH_INPUT_USD_PER_M
      + (outputTokens / 1_000_000) * GEMINI_25_FLASH_OUTPUT_USD_PER_M;
  }
  return 0;
}

async function recordBotUsage(restaurantId, payload = {}) {
  if (!restaurantId) throw new Error('restaurantId requerido');

  const inputTokens = count(payload.inputTokens ?? payload.promptTokens);
  const outputTokens = count(payload.outputTokens ?? payload.completionTokens);
  const reportedTotal = count(payload.totalTokens);
  const totalTokens = reportedTotal || inputTokens + outputTokens;
  const externalEventId = text(payload.externalEventId, 160);
  const aiProvider = text(payload.aiProvider, 40);
  const aiModel = text(payload.aiModel, 120);

  const data = {
    restaurantId,
    source: text(payload.source, 60) || 'WHATSAPP_ASSISTANT',
    transport: text(payload.transport, 40),
    aiProvider,
    aiModel,
    inboundMessages: count(payload.inboundMessages),
    outboundMessages: count(payload.outboundMessages),
    aiRequests: count(payload.aiRequests),
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: estimateCostUsd({ aiProvider, aiModel, inputTokens, outputTokens, reported: payload.estimatedCostUsd }),
    externalEventId,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
  };

  if (Number.isNaN(data.occurredAt.getTime())) data.occurredAt = new Date();

  try {
    return await prisma.botUsageEvent.create({ data });
  } catch (err) {
    // Reintentos del worker: el evento ya contado no se vuelve a sumar.
    if (err?.code === 'P2002' && externalEventId) {
      return { duplicate: true, externalEventId };
    }
    throw err;
  }
}

function normalizeAggregate(agg) {
  const s = agg?._sum || {};
  return {
    events: agg?._count?._all || 0,
    inboundMessages: Number(s.inboundMessages || 0),
    outboundMessages: Number(s.outboundMessages || 0),
    aiRequests: Number(s.aiRequests || 0),
    inputTokens: Number(s.inputTokens || 0),
    outputTokens: Number(s.outputTokens || 0),
    totalTokens: Number(s.totalTokens || 0),
    estimatedCostUsd: Number(s.estimatedCostUsd || 0),
  };
}

async function aggregateSince(restaurantId, from) {
  const agg = await prisma.botUsageEvent.aggregate({
    where: { restaurantId, source: 'WHATSAPP_ASSISTANT', occurredAt: { gte: from } },
    _count: { _all: true },
    _sum: {
      inboundMessages: true,
      outboundMessages: true,
      aiRequests: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCostUsd: true,
    },
  });
  return normalizeAggregate(agg);
}

async function computeBotUsageMetrics(restaurantId) {
  if (!restaurantId) throw new Error('restaurantId requerido');
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [last7d, last30d, transports, ai] = await Promise.all([
    aggregateSince(restaurantId, d7),
    aggregateSince(restaurantId, d30),
    prisma.botUsageEvent.groupBy({
      by: ['transport'],
      where: { restaurantId, source: 'WHATSAPP_ASSISTANT', occurredAt: { gte: d30 } },
      _count: { _all: true },
      _sum: { inboundMessages: true, outboundMessages: true },
    }),
    prisma.botUsageEvent.groupBy({
      by: ['aiProvider', 'aiModel'],
      where: { restaurantId, source: 'WHATSAPP_ASSISTANT', occurredAt: { gte: d30 }, aiRequests: { gt: 0 } },
      _count: { _all: true },
      _sum: { aiRequests: true, totalTokens: true, estimatedCostUsd: true },
    }),
  ]);

  return {
    last7d,
    last30d,
    transports30d: transports.map((r) => ({
      transport: r.transport || 'UNKNOWN',
      events: r._count._all,
      inboundMessages: Number(r._sum.inboundMessages || 0),
      outboundMessages: Number(r._sum.outboundMessages || 0),
    })),
    ai30d: ai.map((r) => ({
      provider: r.aiProvider || 'UNKNOWN',
      model: r.aiModel || 'UNKNOWN',
      events: r._count._all,
      aiRequests: Number(r._sum.aiRequests || 0),
      totalTokens: Number(r._sum.totalTokens || 0),
      estimatedCostUsd: Number(r._sum.estimatedCostUsd || 0),
    })),
  };
}

module.exports = { recordBotUsage, computeBotUsageMetrics };
