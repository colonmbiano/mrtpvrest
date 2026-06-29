// Zod schemas para POST/PUT de /api/orders.
// Diseñados conservadores: campos opcionales preservados como en el handler
// original, pero los tipos sí se validan. Mejor 400 limpio que 500 opaco al
// hacer Number(undefined).

const { z } = require('zod');

const cartItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity:   z.coerce.number().int().positive(),
  // Peso en KG para productos vendidos por báscula (MenuItem.soldByWeight).
  // Decimal positivo; el servidor decide si lo respeta (solo si el producto
  // es por peso) y cobra price/kg × weightKg. Tope defensivo de 10000 kg.
  weightKg:   z.coerce.number().positive().max(10000).optional().nullable(),
  // El TPV envía price y modifiers; toleramos ambos extra fields.
  price:      z.coerce.number().nonnegative().optional(),
  notes:      z.string().max(500).optional(),
  // Comensal al que pertenece el item (1..N). null/undefined = compartido.
  seatNumber: z.coerce.number().int().positive().max(50).optional().nullable(),
}).passthrough();

const orderTypeSchema = z.enum(['DINE_IN', 'TAKEOUT', 'DELIVERY']);

// Cobro mixto (split-tender): un renglón por método con su monto. El servidor
// re-valida que la suma cuadre con el total (lib/money.normalizeTenders); el
// monto del cliente nunca decide cuánto debe la orden.
const paymentTenderSchema = z.object({
  method: z.string().min(1).max(40),
  amount: z.coerce.number().nonnegative(),
}).passthrough();

const createOrderSchema = z.object({
  items:         z.array(cartItemSchema).min(1, 'Sin productos'),
  orderType:     orderTypeSchema.optional(),
  // nullable: meseros-lite/TPV envían tableNumber:null cuando la orden va por
  // tableId real (sin número de mesa demo). `.optional()` solo cubría undefined,
  // así que el null reventaba la validación → "Datos inválidos" al guardar por mesa.
  tableNumber:   z.union([z.string(), z.number()]).optional().nullable(),
  tableId:       z.string().optional().nullable(),
  // Cuántos comensales se sentaron al iniciar la cuenta DINE_IN.
  numberOfGuests: z.coerce.number().int().positive().max(50).optional().nullable(),
  paymentMethod: z.string().optional(),
  // Cobro mixto al crear-y-pagar (TAKEOUT/DELIVERY de un toque): desglose por
  // método. Si viene, gana sobre paymentMethod y la orden queda MIXED.
  payments:      z.array(paymentTenderSchema).min(1).optional(),
  tip:           z.coerce.number().nonnegative().optional(),
  subtotal:      z.coerce.number().nonnegative().optional(),
  discount:      z.coerce.number().nonnegative().optional(),
  total:         z.coerce.number().nonnegative().optional(),
  customerName:  z.string().max(120).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
  status:        z.string().optional(),
  // Idempotencia DB-level para replays de la cola offline del TPV.
  // El cliente genera el id antes de mandar (uuid/txId del outbox).
  clientOrderId: z.string().min(1).max(120).optional().nullable(),
}).passthrough();

const addItemsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Sin productos'),
}).passthrough();

// Status update — flexible por nombres legacy. Lista canónica documentada.
const updateStatusSchema = z.object({
  status: z.enum([
    'OPEN', 'PENDING', 'PREPARING', 'CONFIRMED', 'READY', 'PACKING',
    // ON_THE_WAY es el valor real del enum OrderStatus; OUT_FOR_DELIVERY se
    // conserva por tolerancia a nombres legacy.
    'ON_THE_WAY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAID',
  ]),
}).passthrough();

// Cobro de una orden abierta. Acepta el método único (legacy) o el desglose
// de cobro mixto `payments[]` (+ propina opcional). Al menos uno es obligatorio.
const updatePaymentSchema = z.object({
  paymentMethod: z.string().min(1).optional(),
  payments:      z.array(paymentTenderSchema).min(1).optional(),
  tip:           z.coerce.number().nonnegative().optional(),
}).passthrough().refine(
  (d) => Boolean(d.paymentMethod) || (Array.isArray(d.payments) && d.payments.length > 0),
  { message: 'paymentMethod o payments requerido' },
);

const messageSchema = z.object({
  message:    z.string().min(1).max(2000),
  fromDriver: z.boolean().optional(),
}).passthrough();

// Reembolso de un ticket YA cobrado. `amount` es OPCIONAL: si no viene, el
// servidor reembolsa el saldo restante (total − ya reembolsado) = reembolso
// total. El monto NUNCA decide por sí solo cuánto devolver: el handler lo
// re-valida contra el total real de la orden (server-side). `reason` es
// obligatorio (auditoría). `refundMethod` por defecto sigue el método original;
// solo CASH afecta el cajón / la caja del repartidor. `restock` fuerza o evita
// la reposición de inventario (default: reponer solo en reembolso total).
const refundSchema = z.object({
  amount:       z.coerce.number().positive().optional(),
  reason:       z.string().trim().min(1, 'Motivo requerido').max(500),
  refundMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'OTHER']).optional(),
  restock:      z.boolean().optional(),
}).passthrough();

module.exports = {
  cartItemSchema,
  paymentTenderSchema,
  createOrderSchema,
  addItemsSchema,
  updateStatusSchema,
  updatePaymentSchema,
  messageSchema,
  refundSchema,
};
