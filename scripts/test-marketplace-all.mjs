#!/usr/bin/env node
'use strict';

/**
 * scripts/test-marketplace-all.mjs
 *
 * Suite maestra ejecutadora de todas las pruebas del marketplace piloto.
 * Ejecuta las suites de forma secuencial, valida schemas y verifica TODOs.
 *
 * Uso: node scripts/test-marketplace-all.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ============================================================================
// CONFIGURACIÓN DE LAS SUITES DE PRUEBA
// ============================================================================

const TESTS = [
  // ── CLIENT (Tienda Online / Marketplace PWA) ──
  { path: 'apps/client/scripts/marketplace.test.mjs', name: 'Client: Catálogo Multi-Giro & Filtros' },
  { path: 'apps/client/scripts/marketplace-checkout.test.mjs', name: 'Client: Checkout Dividido & Escrow' },
  { path: 'apps/client/scripts/order-tracking.test.mjs', name: 'Client: Rastreo en Vivo & Doble PIN' },

  // ── DELIVERY (App de Repartidores) ──
  { path: 'apps/delivery/scripts/delivery-dispatch.test.mjs', name: 'Delivery: Despacho & Flujo de Orden' },
  { path: 'apps/delivery/scripts/delivery-evidence.test.mjs', name: 'Delivery: Evidencia (Foto + Firma Digital)' },
  { path: 'apps/delivery/scripts/driver-balance.test.mjs', name: 'Delivery: Saldo, Ganancias & Propinas' },
  { path: 'apps/delivery/scripts/driver-payouts.test.mjs', name: 'Delivery: Solicitud de Retiros por CLABE' },

  // ── TPV (Punto de Venta) ──
  { path: 'apps/tpv/scripts/tpv-setup-auth.test.mjs', name: 'TPV: Autenticación, Sucursal & PIN' },

  // ── ADMIN (Panel Restaurante / Negocio) ──
  { path: 'apps/admin/scripts/promociones-location.test.mjs', name: 'Admin: Promociones Automáticas por Sucursal' },
  { path: 'apps/admin/scripts/admin-pedidos-evidence.test.mjs', name: 'Admin: Visualización Evidencias & PIN' },
  { path: 'apps/admin/scripts/marketplace-delivery-policy.test.mjs', name: 'Admin: Politica de Despacho Hibrido Marketplace' },

  // ── SAAS (SuperAdmin Global) ──
  { path: 'apps/saas/scripts/saas-marketplace.test.mjs', name: 'SaaS: Panel de Control & Auditoría Marketplace' },

  // ── BACKEND: Core & Finanzas ──
  { path: 'apps/backend/scripts/saas-marketplace.test.cjs', name: 'Backend: Métricas y Auditoría SuperAdmin' },
  { path: 'apps/backend/scripts/delivery-incidents.test.cjs', name: 'Backend: Incidencias en Ruta & Evidencias' },
  { path: 'apps/backend/scripts/driver-payouts.test.cjs', name: 'Backend: Motor de Retiros & Doble Partida' },
  { path: 'apps/backend/scripts/admin-caja-payouts.test.mjs', name: 'Backend: Aprobación y Liquidación en Caja' },
  { path: 'apps/backend/scripts/promo-engine.test.cjs', name: 'Backend: Motor de Promociones con IA' },
  { path: 'apps/backend/scripts/promo-adapter.test.cjs', name: 'Backend: Adaptador de Promociones' },
  { path: 'apps/backend/scripts/location-promos-job.test.cjs', name: 'Backend: Job Semanal de Promociones' },
  { path: 'apps/backend/scripts/marketplace-orders.test.cjs', name: 'Backend: Pipeline de Órdenes & Transacciones' },
  { path: 'apps/backend/scripts/marketplace-order-orchestrator.test.cjs', name: 'Backend: Orquestador de Órdenes v1 & Snapshots' },
  { path: 'apps/backend/scripts/driver-balance.test.cjs', name: 'Backend: Balance de Repartidor & Retenciones' },
  { path: 'apps/backend/scripts/marketplace-ledger.test.cjs', name: 'Backend: Ledger Contable Inmutable' },
  { path: 'apps/backend/scripts/marketplace-payments.test.cjs', name: 'Backend: Pasarela MercadoPago & Webhooks' },
  { path: 'apps/backend/scripts/marketplace-catalog.test.cjs', name: 'Backend: Catálogo Multi-Giro & Disponibilidad' },
  { path: 'apps/backend/scripts/marketplace-merchants-v1.test.cjs', name: 'Backend: Descubrimiento & Catálogo v1' },
  { path: 'apps/backend/scripts/marketplace-quote.test.cjs', name: 'Backend: Cotización Formal & Snapshot TTL' },
  { path: 'apps/backend/scripts/marketplace-dispatch.test.cjs', name: 'Backend: Motor de Asignación y Despacho' },
  { path: 'apps/backend/scripts/marketplace-hybrid-policy.test.cjs', name: 'Backend: Políticas de Despacho Híbrido & Fallback' },
  { path: 'apps/backend/scripts/marketplace-couriers-v1.test.cjs', name: 'Backend: Repartidores Globales & Afiliaciones v1' },
  { path: 'apps/backend/scripts/marketplace-tracking-v1.test.cjs', name: 'Backend: Rastreo Geolocalizado & Privacidad GPS v1' },
  { path: 'apps/backend/scripts/marketplace-webhooks-v1.test.cjs', name: 'Backend: Webhook Durable de Mercado Pago v1' },
  { path: 'apps/backend/scripts/marketplace-ops-dispatch-v1.test.cjs', name: 'Backend: Panel Ops de Despacho & Reasignación v1' },
  { path: 'apps/backend/scripts/marketplace-settlements-v1.test.cjs', name: 'Backend: Liquidaciones & Reembolsos en Partida Doble v1' },
  { path: 'apps/backend/scripts/marketplace-staff-identity.test.cjs', name: 'Backend: Identidad Staff & JWT HS256' },
  { path: 'apps/backend/scripts/runtime-policy.test.cjs', name: 'Backend: Runtime Policy & Tenant Guard' },

  // ── INTEGRACIÓN MAESTRA & AISLAMIENTO ──
  { path: 'apps/backend/scripts/marketplace-pilot-e2e.test.mjs', name: 'Backend: Suite E2E Maestra del Piloto' },
  { path: 'tests/marketplace/api-url-isolation.test.mjs', name: 'Infra: Aislamiento Local & Loopback URL' },

  // Integraciones incorporadas después del piloto inicial. Solo fixtures/mocks.
  { path: 'apps/client/scripts/marketplace-first-order.test.mjs', name: 'Client: Pedido de demostración' },
  { path: 'apps/client/scripts/marketplace-multi-order.test.mjs', name: 'Client: Carrito multitienda de demostración' },
  { path: 'apps/client/scripts/marketplace-registration.test.mjs', name: 'Client: Registro de perfiles' },
  { path: 'apps/delivery/scripts/store-delivery-pin.test.mjs', name: 'Delivery: PIN y cobro de reparto propio' },
  { path: 'apps/backend/scripts/marketplace-identity.test.cjs', name: 'Backend: Identidad de compradores y couriers' },
  { path: 'apps/backend/scripts/marketplace-multistop.test.cjs', name: 'Backend: Rutas multitienda de staging' },
  { path: 'apps/backend/scripts/marketplace-merchant-membership.test.cjs', name: 'Backend: Aprobación de comercios' },
  { path: 'apps/backend/scripts/marketplace-v1-prisma.test.cjs', name: 'Backend: Adaptadores Prisma v1 con fixtures' },
  { path: 'apps/backend/scripts/marketplace-v1-payments.test.cjs', name: 'Backend: Pagos v1 con pasarela simulada' },
  { path: 'apps/backend/scripts/marketplace-buyer-addresses.test.cjs', name: 'Backend: Direcciones del comprador' },
  { path: 'apps/backend/scripts/store-delivery-pin.test.cjs', name: 'Backend: PIN de entrega propia' },
  ...[
    'delivery-marketplace-store.routes.test.js',
    'delivery-pin.routes.test.js',
    'delivery-pin.whatsapp.test.js',
    'marketplace-membership.routes.test.js',
    'marketplace-v1-tracking.routes.test.js',
    'orders.marketplace-acceptance.test.js',
  ].map(file => ({ path: `apps/backend/__tests__/${file}`, name: `Jest: ${file}`, runner: 'jest' })),
];

const SCHEMA_PATHS = [
  'packages/database/prisma/schema.prisma',
  'apps/backend/prisma/schema.prisma'
];

function fileHash(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return null;
  return createHash('sha256').update(readFileSync(full)).digest('hex');
}

function runSuite(suite) {
  const full = resolve(ROOT, suite.path);
  try {
    const args = suite.runner === 'jest'
      ? [resolve(ROOT, 'apps/backend/node_modules/jest/bin/jest.js'), '--runInBand', '--no-cache', '--json', '--runTestsByPath', full]
      : [full];
    const stdout = execFileSync(process.execPath, args, {
      cwd: suite.runner === 'jest' ? resolve(ROOT, 'apps/backend') : ROOT,
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    });
    // No inventar una prueba cuando un script no publica un recuento.
    const passMatch = stdout.match(/(?:ℹ|#) pass (\d+)/);
    const count = suite.runner === 'jest'
      ? JSON.parse(stdout).numPassedTests
      : passMatch ? Number(passMatch[1]) : null;
    return { success: true, count, output: stdout };
  } catch (err) {
    return { success: false, count: 0, error: err.message, output: (err.stdout || '') + (err.stderr || '') };
  }
}

function countTODOs(relPath) {
  try {
    const full = resolve(ROOT, relPath);
    const content = readFileSync(full, 'utf8');
    const matches = content.match(/\/\/\s*TODO(?::|\s)/gi) || [];
    return matches.length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('  MRTPVREST MARKETPLACE - VERIFICADOR MAESTRO DE PRUEBAS Y ARQUITECTURA');
  console.log('='.repeat(80));

  // ── FASE 1: Verificación de Schemas Prisma ──
  console.log('\n[1/4] Verificando sincronización de esquemas Prisma...');
  const hDb = fileHash(SCHEMA_PATHS[0]);
  const hBe = fileHash(SCHEMA_PATHS[1]);
  console.log(`  - ${SCHEMA_PATHS[0]}: ${hDb}`);
  console.log(`  - ${SCHEMA_PATHS[1]}: ${hBe}`);

  if (!hDb || !hBe || hDb !== hBe) {
    console.error('\n❌ ERROR: Los schemas de Prisma NO coinciden byte a byte.');
    process.exit(1);
  }
  console.log('  ✔ Schemas idénticos byte a byte (SHA-256 verificado)');

  // ── FASE 2: Detección de TODOs en suites ──
  console.log('\n[2/4] Verificando ausencia de TODOs o marcadores incompletos...');
  let totalTodos = 0;
  for (const t of TESTS) {
    const c = countTODOs(t.path);
    if (c > 0) {
      console.warn(`  ⚠ ${t.path} contiene ${c} TODO(s)`);
      totalTodos += c;
    }
  }
  if (totalTodos === 0) {
    console.log('  ✔ Cero TODOs encontrados en las suites de prueba.');
  }

  // ── FASE 3: Ejecución de las Suites ──
  console.log(`\n[3/4] Ejecutando ${TESTS.length} suites locales con fixtures/mocks...\n`);
  let passedSuites = 0;
  let failedSuites = 0;
  let totalTests = 0;
  let uncountedSuites = 0;
  const startTime = Date.now();

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    const prefix = `[${String(i + 1).padStart(2, '0')}/${TESTS.length}]`;
    const tStart = Date.now();
    const result = runSuite(t);
    const duration = Date.now() - tStart;

    if (result.success) {
      passedSuites++;
      if (result.count === null) uncountedSuites++;
      else totalTests += result.count;
      console.log(`  ✔ ${prefix} ${t.name.padEnd(52)} (${result.count === null ? 'sin recuento' : result.count + ' tests'}) [${duration}ms]`);
    } else {
      failedSuites++;
      console.error(`  ✖ ${prefix} ${t.name.padEnd(52)} FALLÓ [${duration}ms]`);
      console.error(`     ${result.error?.split('\n')[0]}`);
      console.error(result.output.slice(-6000));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // ── FASE 4: Resumen y Scorecard ──
  console.log('\n' + '='.repeat(80));
  console.log('  SCORECARD FINAL DE CALIDAD Y REGRESIÓN');
  console.log('='.repeat(80));
  console.log(`  Total Suites Ejecutadas: ${TESTS.length}`);
  console.log(`  Suites Aprobadas:        ${passedSuites} / ${TESTS.length}`);
  console.log(`  Tests con recuento:      ${totalTests}`);
  console.log(`  Suites sin recuento:     ${uncountedSuites}`);
  console.log(`  Suites Fallidas:         ${failedSuites}`);
  console.log(`  Tiempo Total:            ${elapsed}s`);
  console.log(`  Estado de Schemas:       BYTE-IDENTICAL (SHA-256 verificado)`);
  console.log(`  Alcance:                fixtures/mocks; no certifica aislamiento de red ni producción`);
  console.log('='.repeat(80));

  if (failedSuites > 0) {
    console.error('\n❌ RECHAZADO: Existen pruebas fallidas.');
    process.exit(1);
  }

  console.log('\nVALIDACIÓN LOCAL EXITOSA: Pasan las suites incluidas. No certifica operación real, despliegue ni pruebas de navegador.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
