'use strict';

// Cliente API-only del bot (Fase 2 SaaS). Cuando WHATSAPP_BOT_TOKEN está seteado,
// el bot obtiene TODO del backend por /api/bot/* con su token por-tenant, sin tocar
// la BD ni tener DATABASE_URL/JWT_SECRET. Sin token → modo legacy (prisma directo),
// para que el deploy sea seguro y el cutover sea un flip de variable reversible.
// Ver docs/whatsapp-bot-saas-plan.md §9.

const axios = require('axios');

function useApi() {
  return !!process.env.WHATSAPP_BOT_TOKEN;
}

// El restaurantId va embebido en el token (bt_<rid>.<secret>); fallback al env.
// Así el bot self-hosted no necesita WHATSAPP_BOT_RESTAURANT_ID por separado.
function restaurantId() {
  const t = process.env.WHATSAPP_BOT_TOKEN || '';
  const m = /^bt_([^.]+)\./.exec(t);
  if (m) return m[1];
  return process.env.WHATSAPP_BOT_RESTAURANT_ID || null;
}

function apiBase() {
  return (process.env.WHATSAPP_BOT_API_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '');
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.WHATSAPP_BOT_TOKEN}` };
}

// Menú + negocio para el prompt: { businessName, locationId, menuString, promosHoy,
// config:{isOpen,scheduleEnabled,businessHours,timezone,estimatedDelivery} }.
async function getContext() {
  const r = await axios.get(`${apiBase()}/api/bot/context`, { headers: authHeaders(), timeout: 12000 });
  return r.data;
}

// Config editable: { active, extraInstructions, ignoreNumbers, ignoreGroupName }.
async function getConfig() {
  const r = await axios.get(`${apiBase()}/api/bot/config`, { headers: authHeaders(), timeout: 8000 });
  return r.data;
}

// Identidad del tenant del token: { restaurantId, name, isActive, enabled }.
async function whoami() {
  const r = await axios.get(`${apiBase()}/api/bot/whoami`, { headers: authHeaders(), timeout: 8000 });
  return r.data;
}

// Detalle de una orden (items + modifiers + notes) para el ticket.
async function getOrderDetail(orderId) {
  const r = await axios.get(`${apiBase()}/api/bot/orders/${encodeURIComponent(orderId)}`, { headers: authHeaders(), timeout: 8000 });
  return r.data;
}

// Agregar items a una orden (ADD_TO_ORDER). El backend resuelve empleado + sucursal.
async function addItems(orderId, items) {
  const r = await axios.post(`${apiBase()}/api/bot/orders/${encodeURIComponent(orderId)}/items`, { items }, { headers: authHeaders(), timeout: 12000 });
  return r.data;
}

// Último pedido del CHAT dentro de la ventana de dedupe (o null). `ref` = hash
// del chat (chatRefFor). Trae `canAdd` server-side: el ticket sigue vivo en
// cocina y sin cobrar → se le pueden AGREGAR items. Es la memoria persistente
// del bot: sobrevive restarts, a diferencia del Map de 15 min de client.js.
async function getChatOrder(ref) {
  const r = await axios.get(`${apiBase()}/api/bot/chat-order`, {
    params: { ref }, headers: authHeaders(), timeout: 8000,
  });
  return r.data?.order || null;
}

module.exports = { useApi, restaurantId, getContext, getConfig, whoami, getOrderDetail, addItems, getChatOrder };
