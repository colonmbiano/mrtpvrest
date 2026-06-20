# MODA+ Retail (`@mrtpvrest/moda`)

TPV para tiendas de ropa (SKU, talla/color, etiquetas), **separado** del TPV de
restaurante. Diseño "Smart Retail Flow" (blanco premium, acento verde). Next 16 +
React 19 + Tailwind 3. Mismo backend del monorepo vía `/api/retail/v1`.

Una sucursal con `businessType = RETAIL` se **redirige automáticamente** a esta app
desde el hub del TPV (ver Fase 3).

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | App Next real con el diseño MODA+ (11 pantallas, RBAC demo, modo oscuro, pago mixto, escaneo, F-keys) | ✅ verificado |
| 2 | Backend real: login por PIN, catálogo en vivo, venta a `/sales`, caja | ✅ verificado (con fallback demo) |
| 3 | Redirect de setup `businessType=RETAIL → MODA+` (handoff por query) | ✅ verificado (MODA+); cableado en hub TPV |
| 4 | APK Android (Capacitor) | 🟡 scaffold listo — falta `cap:add` + build/firma |
| 5 | Windows (Tauri) | 🟡 scaffold listo — falta toolchain Rust + icons + build |
| 6 | Deploy (Vercel) + distribución de binarios | ⏳ pendiente (pasos abajo) |

## Capa de datos (`src/lib/`)

- `config.ts` — URL del backend (`NEXT_PUBLIC_API_URL` / override en localStorage; https-only salvo hosts privados).
- `tenant.ts` — `restaurantId` / `locationId` / `deviceKey`.
- `token-vault.ts` — JWT del empleado (memoria + localStorage).
- `api.ts` — fetch con `Authorization` + cabeceras de tenant + manejo de errores.
- `retail.ts` — `loginPin`, `fetchCatalog` (+ mapeo a la forma de la UI), `createSale`, `openShift`/`closeShift`, mapeo de método de pago.

**Modo demo / online:** si no hay sesión o el catálogo retail está vacío, la UI cae a
datos demo (`PRODUCTS`) y los cobros se completan localmente con folio temporal. Solo
se postea una venta real cuando hay sesión online **y** todas las líneas resuelven un
`skuId` del catálogo en vivo.

## Desarrollo

```bash
pnpm install                      # desde la raíz del monorepo
pnpm --filter @mrtpvrest/moda dev # http://localhost:3012
```

Variables (`.env.local`):

```
NEXT_PUBLIC_API_URL=https://api.mrtpvrest.com   # backend
NEXT_PUBLIC_MODA_URL=...   # (lo lee el TPV, no esta app) URL pública de MODA+
```

Login: PIN del empleado + `locationId` de la sucursal (configurable en la propia
pantalla de login → "Configurar conexión"). El backend autentica vía
`POST /api/employees/login` (header `x-location-id`).

## Fase 3 — Redirect por giro

- `apps/admin/.../configurar-negocio` ya permite elegir **RETAIL** (`PUT /api/locations/:id/business-type`).
- El **hub del TPV** (`apps/tpv/src/app/hub/page.tsx`) redirige a MODA+ cuando la
  sucursal es RETAIL, pasando `?api=...&restaurantId=...&locationId=...`. MODA+ lee
  esos params al arrancar, los persiste y limpia la URL. Inerte para RESTAURANT.
- Configurable con `NEXT_PUBLIC_MODA_URL` en el TPV (default `https://moda.mrtpvrest.com`).

## Fase 4 — APK Android (Capacitor)

Scaffold: `capacitor.config.ts` (`appId com.mrtpvrest.moda`) + scripts. Pasos:

```bash
pnpm --filter @mrtpvrest/moda cap:add      # genera android/ (una vez)
pnpm --filter @mrtpvrest/moda build:apk    # next export + cap sync
pnpm --filter @mrtpvrest/moda apk:debug    # APK debug (gradlew.bat assembleDebug)
```

Build release/firma: mismo flujo que `apps/tpv` (keystore en GitHub Secrets `KEYSTORE_*`
y respaldo local `C:\Users\colon\mrtpvrest-keystore\`). Para apuntar el debug a un
backend http local, el overlay `android/app/src/debug/AndroidManifest.xml` re-habilita
cleartext (ver TPV).

## Fase 5 — Windows (Tauri)

Scaffold en `src-tauri/` (carga el export estático de Next). Requisitos: Rust + toolchain
MSVC. Pasos:

```bash
pnpm --filter @mrtpvrest/moda exec tauri icon ./public/logo.png   # genera src-tauri/icons
pnpm --filter @mrtpvrest/moda tauri:dev      # ventana de escritorio (devUrl :3012)
pnpm --filter @mrtpvrest/moda tauri:build    # instalador .exe (nsis/msi) en src-tauri/target/release/bundle
```

**Pendiente:** impresión nativa ESC/POS (recibo + etiqueta de SKU) — cablear el comando
`print_receipt` en `src-tauri/src/lib.rs` (TCP puerto 9100 o USB) e invocarlo desde el
front con `@tauri-apps/api`.

## Fase 6 — Deploy (Vercel)

Mismo patrón que `apps/tpv` / `apps/delivery`:
1. Proyecto Vercel nuevo git-conectado, `rootDirectory = apps/moda`, "include files outside root" ON.
2. Env `NEXT_PUBLIC_API_URL` = `https://api.mrtpvrest.com`.
3. Dominio `moda.mrtpvrest.com` → este proyecto; setear `NEXT_PUBLIC_MODA_URL` con ese
   dominio en el **proyecto del TPV** para activar el redirect.
