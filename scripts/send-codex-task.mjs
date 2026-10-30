import { sendToTerminal } from './orca-dispatch.mjs';

const codexTerminal = 'term_ff82e0bf-4c4e-4fe5-bf61-7c83dfe6a749';

const message = `Tarea MKT-SAAS-DISPATCH-OPS:
1. En apps/saas/app/(dashboard)/marketplace:
   - Integrar una seccion o pestaña de auditoria de operaciones de despacho conectada a GET /api/marketplace/v1/ops/dispatch.
   - Mostrar tareas activas con taskId, dispatchMode OWN vs SHARED, taskStatus (WAITING_READY, OFFERING, ASSIGNED, PICKED_UP, DELIVERED, REASSIGNING, FAILED), intentos de asignacion y alerta visual si esta en REASSIGNING o attempts >= 2.
2. En apps/saas/scripts/saas-marketplace.test.mjs:
   - Agregar pruebas unitarias offline para la logica de clasificacion, filtrado por estado y conteo de tareas de despacho.
3. Ejecutar node apps/saas/scripts/saas-marketplace.test.mjs y reportar sin git push.`;

sendToTerminal(codexTerminal, message);
