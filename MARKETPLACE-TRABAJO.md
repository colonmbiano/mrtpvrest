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

## T4 — EN CURSO — 2026-10-29
Revisión de PR frente a master e1f466e1, pruebas #119 y auditoría de dependencias sin instalación en el checkout del usuario.

## T4 — HECHO — 2026-10-29

- Rama: codex/triage-prs-2026-10. Informe: docs/triage-prs-2026-10.md. Commit: el que incorpora esta entrada.
- Evidencia: comparación con master e1f466e1 y metadatos GitHub; pnpm audit sin cambios de dependencias; #119 ejecutado con mocks sobre código de master, 6 pasan y 2 fallan (los nuevos casos).
- PostgreSQL, navegador y producción: no usados para T4. PDF pendiente de inspección visual explícitamente indicada.
- No se cerró ni fusionó ningún PR. Publicación y nuevo PR del informe pendientes de autorización de push.
