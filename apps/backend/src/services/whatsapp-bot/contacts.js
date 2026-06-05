// contacts.js — CRM de WhatsApp. Registra/actualiza el contacto del cliente
// cada vez que hace un pedido por el chatbot, para poder hacer remarketing.
// Best-effort: nunca lanza (no debe romper la creación del pedido).

const { toDigits } = require('./provider');

/**
 * Upsert del contacto. Si `orderTotal > 0` cuenta como un pedido (incrementa
 * contadores y marca lastOrderAt). Multi-tenant: scope por restaurantId.
 */
async function upsertContact(prisma, restaurantId, { phone, name, orderTotal = 0 } = {}) {
  const clean = toDigits(phone);
  if (!restaurantId || !clean) return null;
  const counted = Number(orderTotal) > 0;
  const now = new Date();
  try {
    return await prisma.whatsappContact.upsert({
      where: { restaurantId_phone: { restaurantId, phone: clean } },
      create: {
        restaurantId,
        phone: clean,
        name: name || null,
        orderCount: counted ? 1 : 0,
        totalSpent: counted ? Number(orderTotal) : 0,
        lastOrderAt: counted ? now : null,
      },
      update: {
        ...(name ? { name } : {}),
        ...(counted
          ? {
              orderCount: { increment: 1 },
              totalSpent: { increment: Number(orderTotal) },
              lastOrderAt: now,
            }
          : {}),
      },
    });
  } catch (e) {
    console.error('[wa-bot] upsertContact:', e.message);
    return null;
  }
}

module.exports = { upsertContact };
