# Bitácora del plan Codex

## T2 — EN CURSO — 2026-10-29

- Rama: `codex/reassign-table`; PR #161.
- Base actualizada: `origin/master` (`e1f466e1`). Se conserva el gate de identidad marketplace y la integración PostgreSQL al resolver el conflicto del workflow.
- Alcance: pedidos retenidos, disponibilidad del destino y liberación del origen; conservación de rondas, KDS e impresión.
- Evidencia pendiente: Jest con mocks y PostgreSQL 16 desechable en 127.0.0.1:55449. Producción: sin pruebas ni cambios.
- T3 pendiente de que el usuario fusione T2, como exige PLAN-CODEX.md. Publicación de cambios pendiente de autorización explícita de push.

## T2 — HECHO local; pendiente publicar y CI — 2026-10-29

- Implementación: rechazo 409 TABLE_CONFIRMATION_PENDING antes de cualquier reserva; el destino con QR retenido sigue bloqueado por la búsqueda de cuentas activas; el origen solo permanece ocupado por cuentas confirmadas.
- Rutas: apps/backend/src/routes/orders.routes.js, apps/backend/__tests__/orders.reassign-table.test.js, tests/integration/table-reassignment.test.js y .github/workflows/ci-backend.yml.
- Mocks: 92 suites, 771 pruebas Jest aprobadas. PostgreSQL desechable: 8 pruebas aprobadas en PostgreSQL 16.15, puerto 55449, base reassignment_test, esquema aplicado con db push; no es un ensayo de migraciones.
- Las rondas y líneas se comparan antes/después; el traslado solo actualiza tableId/tableNumber y emite order:updated. Navegador, impresión física y producción: no probados.
- Commit: el commit que incorpora esta entrada. Merge previo: 56a19549. No se ha publicado ni verificado CI del nuevo código; PR permanece borrador.

## T1 — EN CURSO — 2026-10-29
Rama codex/menu-mesas-practico; merge de master y pruebas de espera/rechazo, NO_ACTIVE_SHIFT y rondas. T2: commit 8bdad075.

## T1 — HECHO local; pendiente publicar y CI — 2026-10-29

- Rama codex/menu-mesas-practico; implementación dea58410 y mensaje real de caja cerrada 7817e1da; merge 3cfe671d con master e1f466e1.
- Rutas: StoreCheckout.tsx, tests/client/mesa-menu.spec.ts y tests/client/playwright.config.ts. Conflictos resueltos conservando useRef, notas y restricciones de lealtad del marketplace junto a los desplegables QR.
- Navegador con API simulada: 16 pruebas Playwright aprobadas en Chrome local (móvil/escritorio), incluyendo espera → rechazo, NO_ACTIVE_SHIFT y ronda sin espera. No es integración con el backend real.
- Tipos: TypeScript aprobado. Lint: 0 errores, 163 avisos. Build: aprobado con Next 16.4.3 y Webpack en copia aislada con frozen-lockfile; sin cambiar las dependencias del checkout existente.
- Primer intento con dependencias anteriores: faltó parser de ESLint y Chromium administrado por Playwright; se resolvió usando copia aislada y Chrome instalado.
- PostgreSQL y producción: no utilizados para T1. CI remoto pendiente de publicación; PR permanece borrador.
- T4 quedó en codex/triage-prs-2026-10, commit 55892d55. T3 sigue pendiente de la fusión de T2 por el usuario.
