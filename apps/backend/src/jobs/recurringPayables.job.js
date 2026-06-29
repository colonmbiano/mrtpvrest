'use strict';

// Cron diario: materializa los gastos recurrentes vencidos (renta, luz,
// sueldos) en cuentas por pagar (OperatingExpense PENDING) para TODOS los
// tenants. La logica vive en services/recurring-expenses.service (misma que usa
// el disparo manual desde el admin). El job corre sin contexto de tenant; el
// tenant-guard hace passthrough para jobs/seeds (ver tenant-guard.js).

const cron = require('node-cron');
const { generateDueRecurring } = require('../services/recurring-expenses.service');

async function runRecurringPayables() {
  console.log('🧾 [Cron] Generando cuentas por pagar recurrentes...');
  try {
    const { generated, scanned } = await generateDueRecurring(); // todos los tenants
    console.log(`🧾 [Cron] Recurrentes: ${generated} generada(s) de ${scanned} vencida(s).`);
    return { generated, scanned };
  } catch (e) {
    console.error('🧾 [Cron] Error generando recurrentes:', e);
    return { generated: 0, scanned: 0 };
  }
}

function startRecurringPayablesJob() {
  // Diario a la 1:15 AM hora MX (despues de medianoche; los vencimientos son a
  // nivel de fecha, asi una corrida diaria captura lo del dia).
  cron.schedule('15 1 * * *', async () => {
    await runRecurringPayables();
  }, {
    scheduled: true,
    timezone: 'America/Mexico_City',
  });
  console.log('🕒 Job Registrado: Gastos recurrentes → cuentas por pagar (diario 1:15 AM)');
}

module.exports = { startRecurringPayablesJob, runRecurringPayables };
