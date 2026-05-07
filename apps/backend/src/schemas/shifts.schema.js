// Zod schemas para /api/shifts/*

const { z } = require('zod');

const openShiftSchema = z.object({
  openingFloat: z.coerce.number().nonnegative().default(0),
  employeeId:   z.string().optional().nullable(),
  employeeName: z.string().max(120).optional().nullable(),
  blindClose:   z.boolean().optional(),
}).passthrough();

const closeShiftSchema = z.object({
  closingFloat: z.coerce.number().nonnegative(),
  notes:        z.string().max(2000).optional().nullable(),
}).passthrough();

module.exports = { openShiftSchema, closeShiftSchema };
