// Zod schemas para /api/tasks/*
const { z } = require('zod');

const logTaskSchema = z.object({
  taskId:     z.string().min(1),
  employeeId: z.string().min(1).optional(), // si no viene, se resuelve por PIN
  pin:        z.string().regex(/^\d{4,6}$/).optional(),
  notes:      z.string().max(2000).optional().nullable(),
  // Sello cliente para deduplicar al sincronizar de offline → server.
  clientId:   z.string().max(64).optional(),
});

module.exports = { logTaskSchema };
