// Zod schemas para POST/PUT de /api/orders.
// Diseñados conservadores: campos opcionales preservados como en el handler
// original, pero los tipos sí se validan. Mejor 400 limpio que 500 opaco al
// hacer Number(undefined).

const { z } = require('zod');

const cartItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity:   z.coerce.number().int().positive(),
  // El TPV envía price y modifiers; toleramos ambos extra fields.
  price:      z.coerce.number().nonnegative().optional(),
  notes:      z.string().max(500).optional(),
  // Comensal al que pertenece el item (1..N). null/undefined = compartido.
  seatNumber: z.coerce.number().int().positive().max(50).optional().nullable(),
}).passthrough();

const orderTypeSchema = z.enum(['DINE_IN', 'TAKEOUT', 'DELIVERY']);

const createOrderSchema = z.object({
  items:         z.array(cartItemSchema).min(1, 'Sin productos'),
  orderType:     orderTypeSchema.optional(),
  tableNumber:   z.union([z.string(), z.number()]).optional(),
  tableId:       z.string().optional().nullable(),
  // Cuántos comensales se sentaron al iniciar la cuenta DINE_IN.
  numberOfGuests: z.coerce.number().int().positive().max(50).optional().nullable(),
  paymentMethod: z.string().optional(),
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
    'OPEN', 'PENDING', 'PREPARING', 'CONFIRMED', 'READY',
    // ON_THE_WAY es el valor real del enum OrderStatus; OUT_FOR_DELIVERY se
    // conserva por tolerancia a nombres legacy.
    'ON_THE_WAY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAID',
  ]),
}).passthrough();

const updatePaymentSchema = z.object({
  paymentMethod: z.string().min(1),
}).passthrough();

const messageSchema = z.object({
  message:    z.string().min(1).max(2000),
  fromDriver: z.boolean().optional(),
}).passthrough();

module.exports = {
  cartItemSchema,
  createOrderSchema,
  addItemsSchema,
  updateStatusSchema,
  updatePaymentSchema,
  messageSchema,
};
