# M05 y M07 (código): portada de catálogo e integración del cliente

**Fecha:** 22 de octubre de 2026
**Responsable:** Claude Code (sesión de escritorio), reasignado según el registro de MARKETPLACE-TRABAJO.md
**Rama:** `feature/marketplace-hibrido`, sin commits
**Estado:** implementado y verificado offline. Verificación en navegador, build y
type-check real **pendientes** por las restricciones de aislamiento (no se instaló,
compiló ni arrancó nada).

## Activación

Todo queda detrás de banderas. Sin ellas el cliente se comporta igual que en
producción (la raíz redirige a mrtpvrest.com y `getApiUrl` conserva su fallback).

| Variable (apps/client) | Efecto |
| --- | --- |
| `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true` | Copia local: catálogo en `/`, API solo loopback, sin PWA, sin reescritura por host, `noindex`. |
| `NEXT_PUBLIC_MARKETPLACE_CATALOG=true` | Catálogo en `/` fuera del modo aislado (futuro staging); exige API https explícita. |
| `NEXT_PUBLIC_API_URL` | Origen exacto de la API. En modo aislado solo `http(s)://127.0.0.1|localhost|[::1]:puerto`. |
| `NEXT_PUBLIC_SITE_URL` | Opcional. Origen público para metadata/OG y enlaces de carrito server-side. |

Para la copia local: `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true` y
`NEXT_PUBLIC_API_URL=http://127.0.0.1:4100`, junto con `MARKETPLACE_ISOLATED=true`
en el backend. **No se editaron los `.env` locales**: añadir la bandera es un paso
manual del usuario.

## Cambios

- `src/lib/config.ts`: `isMarketplaceIsolated`, `isMarketplaceCatalogEnabled`,
  `parseOrigin`, `getMarketplaceApiUrl` (nunca usa el default productivo) y
  `getStorePublicUrl`. En modo aislado `getApiUrl` devuelve la URL loopback validada
  o `http://127.0.0.1:9` (destino bloqueado): las llamadas fallan de forma visible
  en vez de ir a producción.
- `src/lib/marketplace.ts` (nuevo, sin imports): lectura de parámetros de URL,
  construcción de enlaces, validación estricta del envelope y de cada item del
  contrato, fetch por sección con `cache: 'no-store'` y timeout de 8 s.
- `src/components/MarketplaceCatalog.tsx` (nuevo, server component): buscador
  `role="search"` con etiquetas, filtro de tipo de negocio ("solo filtra tiendas"),
  filtro de tienda como aviso con enlace para quitarlo ("solo productos"),
  secciones Tiendas/Productos con paginación independiente, estados vacío
  (sin publicaciones / sin coincidencias / página fuera de rango) y error
  (`role="alert"`, reintento que conserva filtros y páginas). El reintento es un
  formulario GET: un enlace a la misma URL con otro `#hash` no recargaría los datos. Enlace "Saltar al contenido",
  foco visible y colores con contraste AA (#c2410c/#9a3412 sobre blanco).
- `src/app/page.tsx`: catálogo si está habilitado; si no, la redirección histórica.
  `force-dynamic` y `noindex` en modo aislado.
- `src/app/loading.tsx` y `src/app/error.tsx` (nuevos): genéricos, porque también
  cubren `/[slug]`.
- `src/app/[slug]/page.tsx`: barra estática "Volver al catálogo" (los headers de tema
  son sticky y quedan debajo) y enlace en tienda cerrada; metadata con
  `getStorePublicUrl` y canonical absoluto (un `/` relativo apuntaría a la raíz).
- `src/app/[slug]/error.tsx` y `not-found.tsx`: enlace de regreso al catálogo.
- `next.config.mjs`: PWA desactivada en modo aislado.
- M07 `src/lib/cartLink.ts`: **defecto corregido**. Con el catálogo, el enlace
  compartido de carrito se construía como `origin/?cart=…`, que abre el catálogo y
  pierde el carrito. Ahora apunta a `origin/<slug>?cart=…`, y en server-side nunca
  al subdominio productivo.
- M07 `src/middleware.ts`: en modo aislado no reescribe por host. Antes `[::1]:4103`
  no empezaba con `127` y se reescribía a una ruta de tienda inexistente.

Todos los enlaces a tiendas son `<a>` de documento completo (no `next/link`):
`cartStore` es un singleton en memoria sin slug y no debe viajar entre tiendas.

## Evidencia

```bash
node --test apps/client/scripts/marketplace.test.mjs   # 23/23 PASS (Node 22.18)
node --test apps/backend/scripts/runtime-policy.test.cjs        # 9/9 PASS
node --test apps/backend/scripts/marketplace-catalog.test.cjs   # 21/21 PASS
git diff --check                                                # OK
```

- La prueba del cliente usa el soporte de tipos de Node y un hook inline de
  resolución; no requiere `node_modules`. Cubre parámetros (arrays, páginas
  inválidas sin clamp, q de más de 80 sin truncar), ida y vuelta de URL, slugs
  inseguros, validación de envelope/items, URL y caché del fetch, 400/503/red/JSON
  roto/timeout, independencia de secciones, filtros por sección, configuración
  aislada sin producción y enlaces de carrito.
- Sintaxis de los 13 archivos modificados/nuevos del cliente: TypeScript 5.9.2
  incluido en Cursor (`transpileModule`), sin errores.
- Type-check estricto de `marketplace.ts`, `config.ts`, `MarketplaceCatalog.tsx`,
  `page.tsx`, `loading.tsx` y `error.tsx` contra stubs mínimos de React/Next/Lucide
  (fuera del repo): sin errores. **No sustituye** `pnpm --dir apps/client type-check`.
- `Verificar-Marketplace.ps1` / `verify.py`: "original, sus tres cambios locales y su
  índice preservados" OK; falla por archivos versionados modificados, como se
  esperaba. No se debilitó el comprobador.

## Pendiente y riesgos conocidos

- **Sin verificación visual ni de red.** Falta abrir `/` en móvil y escritorio,
  teclado, zoom al 200 %, lector de pantalla, y confirmar en la pestaña de red que
  API, fuentes e imágenes no salen a producción.
- `src/app/layout.tsx` sigue usando `next/font/google` (descarga en build) y
  preconnect a Cloudinary; no se tocó. Las imágenes permiten cualquier host HTTPS y
  la CSP es Report-Only. Decidir antes del primer arranque.
- `src/app/[slug]/manifest.ts` lee `params.slug` de forma síncrona; en Next 16
  `params` es una Promise. Es comportamiento productivo previo y no se cambió. Con la
  PWA desactivada en modo aislado no afecta la copia local, pero conviene revisarlo.
- El aviso del filtro de tienda muestra el slug, no el nombre: el contrato de
  productos no devuelve el nombre de la tienda cuando no hay resultados.
- M05/M07 no tienen revisión independiente: las implementó el mismo agente que
  escribe este informe.
