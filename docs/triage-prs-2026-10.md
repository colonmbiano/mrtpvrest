# Revisión de PR pendientes — 29 de octubre de 2026

Base inspeccionada: `origin/master` = `e1f466e1`. Consulta de metadatos en GitHub y comparación de ramas locales actualizadas. Solo informe: no se fusionó ni cerró ningún PR.

| PR | Qué sigue vigente y evidencia | Riesgo | Recomendación |
| --- | --- | --- | --- |
| [#158](https://github.com/colonmbiano/mrtpvrest/pull/158) | El grupo de 47 actualizaciones ya quedó parcialmente superado. Next, sharp y axios no aparecen en los avisos de la auditoría ejecutada. Quedan los paquetes con avisos que se detallan abajo. | Alto: actualización masiva y versiones propuestas que no resuelven todos los avisos actuales. | Rehacer únicamente actualizaciones de seguridad necesarias desde master. |
| [#112](https://github.com/colonmbiano/mrtpvrest/pull/112) | Es **pnpm/action-setup**, ahora propone 6.0.9. La mayoría de workflows ya usa 6.0.8. `moda-ota-release.yml` y `moda-windows-release.yml` conservan el SHA anterior y `version: 9.15.0`. | Medio: mantener `packageManager: pnpm@9.15.0`; no introducir una versión incompatible en `with.version`. | Rehacer un diff pequeño; conservar las correcciones que ya eliminaron el parámetro redundante en los demás workflows. |
| [#113](https://github.com/colonmbiano/mrtpvrest/pull/113) | **actions/setup-node 6.4.0** ya está fijado por SHA en casi todos los workflows. Los dos workflows de Moda citados aún usan el SHA anterior. | Medio: distinguir runtime de la acción y versión Node de la aplicación; validar runner y caché. | Rehacer solo los dos remanentes; el PR antiguo ya no representa el cambio necesario. |
| [#114](https://github.com/colonmbiano/mrtpvrest/pull/114) | Es **actions/cache**, actualmente propone 6.1.0. Master conserva v4 en CI y compilaciones Android. | Medio: v5 pasa a Node 24 y requiere runner >=2.327.1; v6 migra a ESM. Los inputs usados son path/key/restore-keys. | Rehacer sobre master con SHA fijo, comprobar restauración y guardado de caché en CI. |
| [#119](https://github.com/colonmbiano/mrtpvrest/pull/119) | Sigue faltando corregir el método de órdenes sin liquidar y rechazar canceladas. Master aún devuelve «Solo se corrige el método de una orden ya pagada». Sus 8 pruebas sobre rutas de master dan 6 aprobadas y 2 fallidas: precisamente los casos nuevos. | Alto por conciliación de dinero y saldo de repartidor. | Fusionar cuando su CI actualizado apruebe y el usuario lo decida; conservar pruebas de no mover caja y no cambiar paymentStatus. |
| [#116](https://github.com/colonmbiano/mrtpvrest/pull/116) | Siguen ausentes canonicalización de correo, limiter dedicado de login delivery, fail-closed de Turnstile sin clave en producción, limiters de clientes/pedidos de tienda y cuota IA por tenant. Ver detalle. | Alto, además de conflictos y propiedad compartida con Claude. | Rehacer después de integrar el trabajo de Claude, sin aplicar ahora su parche antiguo. |
| [#137](https://github.com/colonmbiano/mrtpvrest/pull/137) | El diff real incluye PDF, generador, workflow, package.json y lockfile (5 archivos), aunque la descripción dice solo PDF. El markdown coincide con master; master tiene actualización de checkout 1.0.7 (`d7c0251e`), mientras la descripción declara PDF 1.0.6. | Medio: vigencia del binario aún no verificada visualmente; cambios de lockfile y workflow que hace commit/push automático. | Rehacer generando y revisando el PDF desde la guía vigente, aislando los cambios de dependencias; no fusionar basándose solo en la descripción. |

## Seguridad pendiente dentro del grupo #158

Fuente: `pnpm audit --json`, ejecutado sin instalar ni corregir dependencias; lockfile de master, que T1 no modifica. La auditoría identifica paquetes vulnerables, no demuestra explotación. Se listan solo miembros del grupo con avisos pendientes; las dependencias transitivas adicionales quedan fuera de esta lista.

| Paquete | Evidencia de aviso | Propuesta del PR y acción |
| --- | --- | --- |
| postcss | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | 8.5.28 cubre estos rangos; revisar también el override raíz, fijado en 8.5.10, que puede impedir resolver una versión corregida. |
| morgan | [GHSA-jxfw-x594-9x9m](https://github.com/advisories/GHSA-jxfw-x594-9x9m), [GHSA-9f6g-j8ch-79g4](https://github.com/advisories/GHSA-9f6g-j8ch-79g4) | Actualizar a >=1.12.1 y comprobar el lockfile. |
| compression | [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) | Actualizar a >=1.8.2. |
| @capacitor/android | [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv) | La corrección empieza en 8.4.3; el PR propone 8.5.2. Validar aplicaciones Android. |
| @sentry/nextjs | [GHSA-mchm-gjx6-7h55](https://github.com/advisories/GHSA-mchm-gjx6-7h55) | La versión 10.75.0 propuesta NO basta: el aviso requiere >=10.75.2. |

## Evidencia de #116

- `email-domains.js` no contiene `normalizeEmail`; el parche añade normalización de alias Gmail y compatibilidad de login. Es necesario revisar colisiones de cuentas existentes antes de recuperarlo.
- `delivery.routes.js` conserva `router.post('/login', async ...)` sin el limiter dedicado del PR.
- `turnstile.js` devuelve `{ ok: true, skipped: true }` cuando falta la clave, sin condición de producción. Este informe no verifica la configuración desplegada.
- `rate-limiters.js` exporta `aiLimiter`, `refreshLimiter`, `resendVerifyLimiter` y `forgotPasswordLimiter`; no incluye los nuevos límites por tenant ni de tienda del PR. `ai.routes.js` usa el límite existente por IP.
- El diff de #116 toca `auth.routes.js` y `store.routes.js`, reservados a Claude por el plan. No se reimplementó ninguna de estas correcciones.

## Compatibilidad y alcance de la verificación

Documentación oficial: [actions/cache](https://github.com/actions/cache#whats-new), [actions/setup-node](https://github.com/actions/setup-node), [pnpm/action-setup](https://github.com/pnpm/action-setup#version). Los números correctos son #112 pnpm, #113 setup-node y #114 cache.

- Mocks: #119, 8 casos ejecutados contra código de master: 6 pasan y 2 fallan. Archivo de prueba temporal eliminado tras la ejecución.
- PostgreSQL desechable: no utilizado en este informe (la evidencia de T2 está en su propia entrada).
- Navegador/PDF: no inspección visual del PDF ni ejecución de workflows antiguos.
- Producción: ninguna prueba ni modificación. No se verificaron credenciales, secretos ni configuración de servicios.

La decisión de fusionar o cerrar corresponde al usuario. Las recomendaciones de rehacer no autorizan cambios en las áreas asignadas a Claude.
