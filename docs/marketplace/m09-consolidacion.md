# M09: consolidación local del marketplace

**Fecha:** 22 de octubre de 2026
**Responsable:** Claude Code (Codex de Orca sin cuota y runtime Orca detenido; ver registro)
**Rama:** `feature/marketplace-hibrido` en `C:/Users/colon/AndroidStudioProjects/mrtpvrest-marketplace`
**Commits / push:** ninguno. Push bloqueado localmente (pushurl a loopback + pre-push).

La cola M01–M08 está entregada en código y documentos. Todo es **trabajo local sin
commit**, verificado solo con pruebas offline. No se instaló, compiló, migró ni
arrancó nada, y no se conectó ningún servicio.

## Qué hay

| Tarea | Entrega | Documento |
| --- | --- | --- |
| M01 | Auditoría backend | backend.md |
| M02 | Auditoría del recorrido de compradores | frontend.md |
| M03 | Contrato de catálogo (stores/products) | contrato-catalogo.md |
| M04 | `runtime-policy.js`: jobs, bind loopback, CORS exacto y sockets en modo aislado | backend.md |
| M06 | `GET /api/marketplace/stores` y `/products` con allowlist server-side | m06-resultado.md |
| M08 | Revisión independiente de M03/M04/M06 | revision-claude.md |
| M05 | Portada de catálogo en apps/client | m05-m07-resultado.md |
| M07 (código) | Enlace de carrito en `/<slug>`, middleware sin reescritura en modo aislado | m05-m07-resultado.md |

Archivos de código: backend `src/index.js` (modificado), `src/lib/runtime-policy.js`,
`src/lib/marketplace-catalog.js`, `src/routes/marketplace.routes.js` y dos pruebas en
`scripts/`. Cliente: `next.config.mjs`, `src/middleware.ts`, `src/lib/config.ts`,
`src/lib/cartLink.ts`, `src/app/page.tsx`, `src/app/[slug]/{page,error,not-found}.tsx`
(modificados), y los nuevos `src/lib/marketplace.ts`,
`src/components/MarketplaceCatalog.tsx`, `src/app/{loading,error}.tsx` y
`scripts/marketplace.test.mjs`.

## Evidencia reproducible (sin dependencias)

```bash
node --test apps/backend/scripts/runtime-policy.test.cjs        # 9/9
node --test apps/backend/scripts/marketplace-catalog.test.cjs   # 21/21
node --test apps/client/scripts/marketplace.test.mjs            # 23/23 (Node >= 22.18)
node --test tests/marketplace/api-url-isolation.test.mjs        # 4/4: 8 apps, sin axios instalado
git diff --check
python -I .marketplace-local/verify.py   # falla esperada: código versionado modificado;
                                          # confirma original e índice preservados
```

**Con dependencias instaladas** (22/oct, autorizado por el usuario; `pnpm install
--frozen-lockfile --ignore-scripts` + `prisma generate`, sin cambios en el lockfile):
jest del backend 635/635 y 76/76 suites (una ejecución previa tuvo una falla
intermitente en `voice-agent.test.js` que pasa aislada y en la siguiente corrida);
`tsc --noEmit` sin errores en client, TPV, Moda, Meseros Lite, Kiosk y SaaS. En Tokki y
KDS hay 2 errores cada uno, ya existentes y en archivos no tocados
(`ProductOptionsModal.tsx`, `consolidado/page.tsx`, un test). Arranque en loopback y
verificación en navegador: ver m05-m07-resultado.md. El backend solo escucha en
127.0.0.1 (no responde desde la IP LAN), CORS rechaza `https://mrtpvrest.com` con 403 y
las rutas de tienda chocan con la BD bloqueada en `127.0.0.1:1`.

## Bloqueos de staging (MARKETPLACE-STAGING.md)

| # | Bloqueo | Estado |
| --- | --- | --- |
| 1 | URLs productivas por defecto | **Cerrado en código para tráfico de API.** Con `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true`, client, TPV, Tokki, Moda, Meseros Lite, KDS, Kiosk y SaaS solo usan la API loopback horneada o `http://127.0.0.1:9`. Admin y Delivery ya no tenían fallback de API. **Quedan** enlaces de UI (registro en admin, `MODA_URL` del hub TPV, enlaces de Admin a tiendas y SaaS) y los `updateUrl` OTA de `capacitor.config.ts` (solo builds nativos, prohibidos en esta fase). |
| 2 | Configuración en localStorage (TPV/Moda) | **Cerrado en código.** En modo aislado se ignoran el override `apiBaseUrl`/`moda-api-url` y el `apiUrl` de la config remota cacheada (TPV, Tokki, Moda, KDS). Se mantiene la recomendación de un perfil de navegador dedicado. |
| 3 | Jobs con efectos | **Cerrado en código** (M04), con revisión M08. Falta verlo en un arranque real. |
| 4 | `prisma migrate deploy` en el CMD del Dockerfile | **Cerrado en código.** Con `MARKETPLACE_ISOLATED=true` el CMD omite la migración; sin la bandera es idéntico al anterior (falla si la migración falla). Validado con stubs de `pnpm`/`node`. Sigue prohibido construir el contenedor. |
| 5 | Bind 0.0.0.0 y CORS amplio | **Cerrado en código** (M04): 127.0.0.1 y orígenes loopback exactos en modo aislado. |
| 6 | Secretos de tenants en BD | Abierto (operativo): solo BD nueva con datos sintéticos. Ver staging-externos.md. |
| 7 | Servicios opcionales (pagos, WhatsApp, correo, OTA…) | Abierto (operativo). Lista de variables y valor esperado por servicio en staging-externos.md. |
| 8 | Automatización remota (workflows, Railway, Vercel) | **Revisado en local** (staging-externos.md): un push de la rama no dispara workflows; un PR compila los APK de TPV, KDS y Meseros Lite. Los `vercel.json` no bloquean Preview deployments: hay que desactivarlos antes del primer push. Falta verificar los dashboards. |
| 9 | Alcance de secretos | Sin cambios; el escaneo previo sigue vigente. |

PWA del cliente: desactivada en modo aislado. Fuentes de Google en build, preconnect
a Cloudinary, `images.remotePatterns` con `**` y CSP Report-Only siguen igual
(ver m05-m07-resultado.md).

## Plan de prueba local (cuando el usuario lo autorice)

Cada paso necesita aprobación explícita: hoy están prohibidos por AGENTS.md.

1. **Instalar** en esta copia: `pnpm install --frozen-lockfile --ignore-scripts`.
   Revisar después qué scripts omitidos hacen falta (p. ej. `prisma generate`) y
   aprobarlos por separado.
2. **Comprobar sin arrancar:** `pnpm --dir apps/client type-check`,
   `pnpm --dir apps/client lint` y `npx jest` en apps/backend. Comparar con estos
   resultados offline.
3. **Entorno:** en `apps/client/.env.local` añadir `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true`
   (y opcionalmente `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4103`). En el backend,
   `MARKETPLACE_ISOLATED=true`, `MARKETPLACE_ALLOWED_ORIGINS=http://127.0.0.1:4103` y
   `MARKETPLACE_STORE_SLUGS` vacío al principio. Revisar que el shell no herede
   variables de producción.
4. **Catálogo vacío:** arrancar solo el backend (PORT=4100) y el cliente
   (`next dev --hostname 127.0.0.1 --port 4103 --webpack`). En `/` debe verse
   "Todavía no hay tiendas publicadas…" en ambas secciones, sin peticiones a hosts
   fuera de loopback.
5. **Error visible:** detener el backend y recargar. Cada sección debe mostrar su
   error con "Reintentar", nunca una lista vacía.
6. **Con datos:** solo tras resolver la BD nueva (pasos 2, 5 y 6 de "Siguientes pasos"
   de MARKETPLACE-STAGING.md): dos tenants sintéticos en `MARKETPLACE_STORE_SLUGS`.
   Verificar búsqueda, filtros por sección, paginación independiente, "atrás" del
   navegador, enlace a tienda, "Volver al catálogo" y que el carrito no pase de una
   tienda a otra.
7. **Accesibilidad:** teclado completo, foco visible, zoom al 200 %, lector de
   pantalla en los estados de error y móvil (375 px).

## Decisiones pendientes del usuario

- Pasos 1–5 del plan hechos el 22/oct (instalación, comprobaciones, banderas en los
  `.env`, catálogo vacío y error visible). Falta el paso 6 (BD de staging con datos
  sintéticos) y completar el 7 (zoom y lector de pantalla).
- Revisión independiente de M05/M07 (Antigravity cuando recupere cuota, o Codex).
- Revisar también los guards de API de TPV, Tokki, Moda, Meseros Lite, KDS, Kiosk y
  SaaS: esas apps se publican como APK/OTA, y aunque el cambio no altera nada sin
  la bandera, conviene que lo revise quien mantiene cada app antes de fusionar.
- Para la prueba local, además de la bandera del cliente, cada app que se arranque
  necesita `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true` y `NEXT_PUBLIC_API_URL=http://127.0.0.1:4100`.
