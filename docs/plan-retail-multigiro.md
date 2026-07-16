# Plan — Retail multigiro (MODA+ → Retail+): refaccionaria y ferretería

> Objetivo: reutilizar la app `@mrtpvrest/moda` (TPV de ropa) para otros giros de
> retail — arrancando con **ferretería** y **refaccionaria** — **sin forkear** una
> app por giro. La estrategia es *generalizar + extender*, no reescribir.

## Diagnóstico (por qué es viable)

El "core" retail ya es agnóstico al giro y está construido:

- **Datos:** `RetailProduct` / `RetailSku` (`sku` + `barcode` + `price`/`cost` +
  atributos `size/color/material/style` **todos nullable**), `RetailStockByLocation`,
  `RetailStockMovement`, `RetailSale`/`RetailSaleLine`, `RetailTransfer`,
  `RetailCashShift`. Cantidades en **`Decimal(12,3)`** → ya soporta venta a granel /
  fracciones (cable por metro, tornillos por kilo).
- **Backend:** `apps/backend/src/routes/retail.routes.js` (`/api/retail/v1`) con
  catálogo, ventas, traspasos, conteos, caja/turnos, sync outbox, devoluciones.
- **App:** login por PIN, override de supervisor, pago mixto, impresión ESC/POS
  (recibo + etiqueta), empaquetado Capacitor/Tauri.

> ⚠️ **El código de barras está en la BD pero NO llega al POS.** `RetailSku.barcode`
> existe y el admin lo captura (`catalogo/page.tsx`), pero `mapCatalogToProducts`
> (`retail.ts`) **descarta el campo**: el tipo `UiProduct` ni siquiera lo declara. Y
> `doScan` (`page.jsx`) sólo compara contra `sku` exacto y contra `sku + " " + name`
> por substring — nunca contra `barcode`. Efecto colateral: `LabelModal` hace
> `sku.barcode || sku.sku` y **siempre** cae al fallback en productos live.
> Escanear es *el* flujo principal de ferretería/refaccionaria ⇒ cablearlo es
> **prerequisito de la Fase 2**, no un "ya está". Ver Fase 2.0.

Lo específico de "ropa" está **concentrado en la UI**:

- `apps/moda/src/lib/retail.ts` — `SIZES = ["XS","S","M","L","XL"]` hardcodeado, mapa
  `TONE` de colores, y la **matriz talla×color** (`matrix`, `skuByVariant`).
- `apps/moda/src/app/page.jsx` — **segunda copia** de `SIZES` (línea 68) y de la paleta
  de colores (`swatch`, línea 69), usadas en 7 puntos del POS. Pinta selector
  talla×color, swatches y "Stock por talla". **Ojo:** hay que des-modizar *las dos*
  copias; tocar sólo `retail.ts` deja el POS pintando tallas de ropa.
- `apps/moda/src/app/admin/(panel)/catalogo/page.tsx` — campos "Talla / Color / Material",
  ícono `Shirt`, placeholders "Camisa Oxford Slim".
- `RetailProduct.gender` / `season` — campos de moda (nullable, inofensivos).

**Deuda estructural a considerar:** `UiProduct` es producto-céntrico — colapsa cada
producto al precio del **primer SKU** (`first.price`) y construye `matrix`. En
ferretería/refaccionaria el SKU *es* la unidad vendible con precio propio, así que la
"lista plana de SKUs" de la Fase 0 no es un simple condicional: reforma el tipo central
que consume toda la UI. Por eso la Fase 0 es **M**, no S.

## Estrategia: "giro" como configuración

En vez de forkear, el **giro** dirige un **esquema de atributos** por tenant:

- Ropa → atributos `Talla` (XS…XXL), `Color`.
- Ferretería → `Medida`, `Rosca`, `Material`, `Presentación` (pza/caja).
- Refaccionaria → `Lado`, `Posición`, `OEM/Genérico`.

`RetailSku` **ya tiene** `size/color/material/style` genéricos; los reetiquetamos por
giro en la UI (attr1..attr4) sin migración destructiva. Solo agregamos campos nuevos
donde el modelo actual no alcanza (unidad de medida, ubicación, proveedor, compat.).

### Dónde vive el giro (decisión)

Hay tres campos `businessType` en juego y **no son intercambiables**. Conviene fijarlo
porque el plan original mezclaba dos:

| Campo | Tipo | Sirve para el giro |
|---|---|---|
| `Location.businessType` | **enum** `BusinessType {RESTAURANT, RETAIL, BAR, CAFE, FAST_FOOD}` | **No.** No puede expresar `FERRETERIA`; extender el enum es migración. Su semántica es el *preset operativo* del TPV (`BUSINESS_TYPE_PRESETS` en `locations.routes.js`: RETAIL ⇒ venta de mostrador). El endpoint sólo acepta `RESTAURANT\|RETAIL\|BAR\|CAFE`. |
| `Restaurant.businessType` | `String @default("RESTAURANT")` | Podría (es texto libre), pero su set documentado es `RESTAURANT\|RETAIL\|GROCERY` y es lo que `/api/workspaces/me` expone como `Workspace.businessType`. Usarlo para el giro **pierde el marcador "esto es retail"**. |
| `RestaurantConfig.retailGiro` | `String @default("ROPA")` **(nuevo, Fase 1)** | **Sí.** Ortogonal al preset y sin colisión semántica. Vive junto a `countryCode`/`storefrontTheme`, que ya siguen ese patrón de "config fina por tenant". |

**Decisión: `RestaurantConfig.retailGiro`.** El giro es *ortogonal* al preset operativo:
`Location.businessType = RETAIL` dice "es mostrador"; `retailGiro = FERRETERIA` dice
*cuál* vertical. Cuesta una migración aditiva trivial (Fase 1) y no rompe nada.
`Workspace.businessType` (el interface de `retail.ts:156`, alimentado desde
`Restaurant.businessType`) **se mantiene como está** — sigue diciendo `RETAIL`.

### Atributos: código, no `VariantTemplate`

El plan original proponía reutilizar `VariantTemplate` / `VariantTemplateOption` como
diccionario de atributos por giro. **Descartado**, por tres razones:

1. `VariantTemplateOption.price` es `Float` — el CLAUDE.md prohíbe arrastrar `Float`
   nuevos en dinero, y ese modelo es de dominio *menú* (restaurante), no retail.
2. El diccionario de atributos por giro es **estático y conocido en build time**: no
   necesita tabla ni CRUD. Ponerlo en BD agrega migración, endpoints y UI de
   administración a cambio de nada.
3. Meter atributos de retail en un modelo del menú acopla dos dominios que hoy no se
   tocan.

⇒ Los atributos viven en `apps/moda/src/lib/giro.ts` (Fase 0), como constante tipada.

---

## Fase 0 — Base multigiro (transversal)

**Meta:** que la app sepa "qué giro soy" y adapte labels/íconos sin tocar la lógica.

- `apps/moda/src/lib/giro.ts` **(nuevo)** — define el catálogo de giros y su config:
  ```ts
  export type Giro = "ROPA" | "FERRETERIA" | "REFACCIONARIA";
  export interface GiroConfig {
    id: Giro; label: string; icon: string;            // lucide name
    attrs: { key: "size"|"color"|"material"|"style"; label: string; suggest?: string[] }[];
    useVariantMatrix: boolean;                          // ropa=true; resto=false
    unitOfMeasure: boolean; wholesale: boolean;         // ferretería
    fitment: boolean; crossRef: boolean;                // refaccionaria
    productPlaceholder: string; skuPlaceholder: string;
  }
  export const GIROS: Record<Giro, GiroConfig> = { /* … */ };
  export function getGiro(): Giro // lee de tenant/localStorage, default ROPA
  ```
- `apps/moda/src/lib/tenant.ts` — persistir `giro` junto a `restaurantId/locationId`.
  Fuente: `RestaurantConfig.retailGiro`, expuesto en la respuesta de
  `GET /api/retail/v1/catalog` (Fase 1). **No** viene de `Workspace.businessType`: ese
  campo (interface en `retail.ts:156`, alimentado desde `Restaurant.businessType` vía
  `/api/workspaces/me`) sigue diciendo `RETAIL` y no se toca — ver la tabla de arriba.
- `apps/moda/src/lib/retail.ts` — `SIZES` deja de ser constante global: se deriva de
  `getGiro()`; `mapCatalogToProducts` construye `matrix` solo si `useVariantMatrix`,
  si no arma lista plana de SKUs (variante única).

**Sin migración** en esta fase (la columna `retailGiro` llega en Fase 1; hasta entonces
`getGiro()` cae al default `ROPA`). Compatibilidad total con ropa.

**Esfuerzo real: M, no S.** `mapCatalogToProducts` devuelve un `UiProduct` por *producto*
(precio = `first.price`, `matrix`, `skuByVariant`). La rama sin matriz necesita un
`UiProduct` por *SKU* con su propio precio, lo que cambia la forma que consumen
`SaleScreen`, `CatalogScreen`, `ProductDetailPanel` y `addProduct`. No es un `if`.

---

## Fase 1 — Backend: campos genéricos de inventario

**Migración** `packages/database/prisma/migrations/<ts>_retail_generic_fields/migration.sql`:

```sql
-- Unidad de medida y presentación (ferretería / granel)
ALTER TABLE "retail_skus" ADD COLUMN "unitOfMeasure" TEXT NOT NULL DEFAULT 'PZA'; -- PZA|MTS|KG|LTS|CAJA
ALTER TABLE "retail_skus" ADD COLUMN "unitsPerPackage" DECIMAL(12,3);              -- caja↔pza
-- Ubicación física en almacén (pasillo/anaquel/bin)
ALTER TABLE "retail_skus" ADD COLUMN "binLocation" TEXT;
-- Proveedor por SKU (opcional; FK suave a suppliers si aplica)
ALTER TABLE "retail_skus" ADD COLUMN "supplierRef" TEXT;
-- Giro del tenant (ver "Dónde vive el giro"). Default ROPA ⇒ no rompe MODA+.
ALTER TABLE "restaurant_config" ADD COLUMN "retailGiro" TEXT NOT NULL DEFAULT 'ROPA';
```

- `packages/database/prisma/schema.prisma` — agregar los 4 campos a `model RetailSku`
  (todos opcionales / con default) y `retailGiro` a `model RestaurantConfig`.
  **NO** usar `@db.Money`; `Decimal` para `unitsPerPackage`.
- **`packages/database/tenant-guard.js`** — `RetailSku` ya está en `SCOPED_MODELS`
  (líneas 85–93). No se agrega modelo nuevo en esta fase ⇒ `tenant-guard.test.js` no rompe.
- `apps/backend/src/routes/retail.routes.js`:
  - `skuSchema` (161–171) / `skuUpdateSchema` (174–184): agregar
    `unitOfMeasure: z.enum([...]).optional()`, `unitsPerPackage`, `binLocation`,
    `supplierRef`.
  - `POST /catalog/skus` (560) y `PUT /catalog/skus/:id` (596): **este archivo no usa
    `pick(...)` de `lib/validate.js`** — valida con zod y construye el `data`/`patch`
    campo por campo, que es *más* estricto que `pick` (zod además castea y rechaza tipos).
    Seguir el patrón local: extender el schema zod y el loop de `patch`. Meter `pick`
    aquí introduciría un mecanismo ajeno al archivo sin ganancia de seguridad.
  - `GET /catalog` (510): **no hay `select` que actualizar.** Usa
    `include: { skus: { where, orderBy, include? } }` sin selección de escalares ⇒ las
    columnas nuevas salen solas. Sí hay que **agregar `retailGiro`** a la respuesta
    (leyéndolo de `RestaurantConfig`) para que la Fase 0 lo consuma.

**Flujo de migración (CLAUDE.md):** `prisma migrate dev` local → `prisma migrate deploy`
**manual** contra prod coordinado con el deploy del backend. Prohibido `prisma db push`.

---

## Fase 2 — Des-modizar la UI (transversal)

**Meta:** catálogo y POS dejan de asumir talla/color; consumen `GiroConfig`.

### Fase 2.0 — Cablear el código de barras (prerequisito, bloquea el MVP)

Sin esto una ferretería no puede operar. No es opcional ni "nice to have":

- `retail.ts` — agregar `barcode` a `UiProduct` y propagarlo en `mapCatalogToProducts`
  (hoy se pierde en el `.map()`); en la rama plana, un `UiProduct` por SKU lleva **su**
  `barcode`. En la rama con matriz, exponer `barcodeByVariant` (o resolver el SKU antes
  de leer el código) — si no, la etiqueta imprime el barcode del primer SKU para todas
  las tallas, que es un bug de etiquetado real.
- `page.jsx` `doScan` (471) — matchear **`barcode` exacto primero** (es lo que manda la
  pistola), luego `sku` exacto, y sólo al final el substring de nombre. El orden importa:
  un barcode que colisione con un substring de nombre agregaría el producto equivocado.
- `page.jsx` `LabelModal` (428) — `sku.barcode || sku.sku` empieza a ser cierto.

### Fase 2.1 — Labels e íconos por giro

- `apps/moda/src/app/admin/(panel)/catalogo/page.tsx`:
  - Reemplazar labels fijos "Talla/Color/Material" por `giro.attrs[].label` (map sobre
    `size/color/material/style`).
  - Ícono `Shirt` → `giro.icon`. Placeholders desde `giro.productPlaceholder`/`skuPlaceholder`.
  - Cuando `!useVariantMatrix`: ocultar swatch de color, mostrar tabla plana con columnas
    `SKU · Descripción · Unidad · Precio · Stock · Ubicación`.
  - Agregar campos nuevos (Fase 1): Unidad de medida (select), Piezas por caja, Ubicación.
- `apps/moda/src/app/page.jsx` (POS):
  - **Eliminar la copia local de `SIZES` (línea 68) y de `swatch` (línea 69)** — son un
    segundo hardcode independiente del de `retail.ts`, usado en 7 puntos (444, 470, 547,
    549, 576, 584, 763, 768). Pasan a derivarse de `giro.ts`.
  - `ProductDetailPanel` (línea **545** — el plan original lo llamaba `VariantModal`, que
    **no existe** en el archivo): si `useVariantMatrix` → grid talla×color actual; si no →
    agregar directo (variante única) o selector genérico de atributo.
  - Renglón del carrito (encabezado en línea **490**): columnas dinámicas; "Talla/Color" →
    atributos del giro o descripción del SKU.
  - Búsqueda/escaneo `doScan` (471): ver Fase 2.0 — hoy **no** matchea `barcode`. Una vez
    cableado, ampliar a `binLocation` y (Fase 4) equivalencias.
  - `PRODUCTS` (71) y `CLIENTS` (119) son datos demo hardcodeados que conviven con el
    catálogo live; al des-modizar, decidir si se borran o se mueven tras el flag de demo.
- `apps/moda/src/lib/printer.ts` (`buildLabel`, línea 130): etiqueta genérica (descripción
  + código + precio + unidad) en vez de color/talla fijos.

**Sin migración.** Aquí vive el grueso del rework de front. "Acotado a 3–4 archivos" es
engañoso: `page.jsx` son 1694 líneas con ~15 componentes que comparten el shape de
`UiProduct`, así que el cambio de forma de la Fase 0 se propaga por todo el archivo.

---

## Fase 3 — Ferretería (unidad de medida, granel, mayoreo)

- **Unidad de medida + granel:** ya soportado en datos (`Decimal(12,3)` + Fase 1). UI:
  - POS permite cantidad decimal cuando `unitOfMeasure ∈ {MTS,KG,LTS}`.
  - Conversión caja↔pza usando `unitsPerPackage` al vender/recibir.
- **Precio por mayoreo/volumen** — **migración** `<ts>_retail_price_tiers`:
  ```sql
  CREATE TABLE "retail_price_tiers" (
    "id" TEXT PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "minQty" DECIMAL(12,3) NOT NULL,
    "price"  DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "retail_price_tiers_restaurant_fk" FOREIGN KEY ("restaurantId")
      REFERENCES "restaurants"("id") ON DELETE CASCADE,
    CONSTRAINT "retail_price_tiers_sku_fk" FOREIGN KEY ("skuId")
      REFERENCES "retail_skus"("id") ON DELETE CASCADE
  );
  CREATE INDEX "retail_price_tiers_sku_idx" ON "retail_price_tiers"("skuId", "minQty");
  CREATE INDEX "retail_price_tiers_restaurant_idx" ON "retail_price_tiers"("restaurantId");
  ```
  > **FK de `restaurantId` obligatoria.** *Todos* los modelos `Retail*` existentes
  > declaran `restaurant Restaurant @relation(..., onDelete: Cascade)`. Si el
  > `schema.prisma` declara la relación y la migración no crea la FK, `prisma migrate`
  > detecta **drift** — justo lo que causó el incidente de `db push` que reconcilió
  > `20260612210000_reconcile_db_push_drift`.
  - `schema.prisma`: `model RetailPriceTier` con relación a `Restaurant` **y** a `RetailSku`.
  - **`tenant-guard.js`:** agregar `'RetailPriceTier'` a `SCOPED_MODELS` (o acceder solo
    vía su padre `RetailSku` y documentarlo). Correr `tenant-guard.test.js` — **falla si
    se olvida**, no ignorarlo (regla CLAUDE.md).
  - Backend: al armar la línea de venta, resolver el tier aplicable por cantidad
    (server-side, junto al cálculo de totales — nunca confiar en precio del cliente).

---

## Fase 4 — Refaccionaria (compatibilidad / equivalencias)

- **Compatibilidad (fitment marca-modelo-año)** — **migración** `<ts>_retail_fitment`:
  ```sql
  CREATE TABLE "retail_fitments" (
    "id" TEXT PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "make"  TEXT NOT NULL, "model" TEXT, "yearFrom" INT, "yearTo" INT, "engine" TEXT,
    CONSTRAINT "retail_fitments_restaurant_fk" FOREIGN KEY ("restaurantId")
      REFERENCES "restaurants"("id") ON DELETE CASCADE,
    CONSTRAINT "retail_fitments_product_fk" FOREIGN KEY ("productId")
      REFERENCES "retail_products"("id") ON DELETE CASCADE
  );
  CREATE INDEX "retail_fitments_lookup_idx" ON "retail_fitments"("restaurantId","make","model");
  ```
- **Equivalencias / cross-reference de núm. de parte** — **migración** `<ts>_retail_crossref`:
  ```sql
  CREATE TABLE "retail_cross_refs" (
    "id" TEXT PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "brand" TEXT, "partNumber" TEXT NOT NULL,
    CONSTRAINT "retail_cross_refs_restaurant_fk" FOREIGN KEY ("restaurantId")
      REFERENCES "restaurants"("id") ON DELETE CASCADE,
    CONSTRAINT "retail_cross_refs_sku_fk" FOREIGN KEY ("skuId")
      REFERENCES "retail_skus"("id") ON DELETE CASCADE
  );
  CREATE INDEX "retail_cross_refs_pn_idx" ON "retail_cross_refs"("restaurantId","partNumber");
  ```
- `schema.prisma`: `model RetailFitment`, `model RetailCrossRef` (ambos con `restaurantId`).
- **`tenant-guard.js`:** agregar ambos a `SCOPED_MODELS` + actualizar `tenant-guard.test.js`.
- Backend: nuevos endpoints `GET /api/retail/v1/catalog/search?fitment=…` y
  `?partNumber=…`; el escaneo/búsqueda del POS resuelve por equivalencia.
- UI: pestaña "Compatibilidad" y "Equivalencias" en el detalle de producto del catálogo.

---

## Fase 5 — Branding y onboarding por giro

- `apps/moda/src/app/admin/login/page.tsx` y `registerTenant` (`retail.ts`): al registrar,
  elegir giro y marcarlo (`PUT /api/locations/:id/business-type` — ya existe RETAIL; si se
  quiere granularidad, extender el enum `BusinessType` o guardar el giro fino en config).
- Copys/íconos/tema por giro desde `giro.ts` (título "Ferretería", "Refaccionaria").
- Landing: **el patrón ya está construido**, no hay que inventarlo. Existen
  `apps/landing/app/moda/[giro]/page.tsx` (ruta dinámica con `generateStaticParams` +
  `generateMetadata` + JSON-LD de `BreadcrumbList`/`FAQPage`) y `apps/landing/app/moda/giros/`,
  alimentadas por el catálogo `modaVerticals` / `getModaVertical` en
  `apps/landing/app/_data/moda-verticals.ts`. Agregar ferretería/refaccionaria es
  **agregar entradas a ese data module**, no crear páginas.
- **Decisión de branding pendiente:** ¿una sola app "Retail+" multigiro (recomendado) o
  dominios/APK separados por giro (`ferreteria.mrtpvrest.com`)? El código es el mismo; solo
  cambia el `giro` inicial y el branding.

---

## Orden sugerido y esfuerzo

| Fase | Alcance | Migración | Esfuerzo |
|---|---|---|---|
| 0 | Base multigiro (`giro.ts`, tenant, retail.ts) | — | **M** (reforma `UiProduct`) |
| 1 | Campos genéricos SKU + `retailGiro` | Sí (aditiva) | S |
| 2.0 | **Cablear barcode en el POS** (prerequisito) | — | S |
| 2.1 | Des-modizar UI (catálogo + POS + etiqueta) | — | **M–L** |
| 3 | Ferretería (granel + mayoreo) | Sí (tabla tiers) | M |
| 4 | Refaccionaria (fitment + equivalencias) | Sí (2 tablas) | M |
| 5 | Branding/onboarding por giro | — | S |

**MVP recomendado para validar un giro:** Fases 0 + 1 + 2 + (3 **o** 4 según el giro).
Con eso una ferretería ya opera (inventario, granel, caja, ticket) o una refaccionaria
busca por equivalencia/compatibilidad.

> **Corrección de estimación.** El plan original ponía Fase 0 en S y describía el MVP
> como si el escaneo por código de barras ya funcionara. Ninguna de las dos cosas era
> cierta: Fase 0 reforma el tipo que consume toda la UI, y el barcode nunca llegó al POS
> (Fase 2.0). El MVP real es **0 + 1 + 2.0 + 2.1 + (3 ó 4)**.

## Guardas / reglas del proyecto a respetar

- **Multi-tenant:** filtrar por `restaurantId`; todo modelo nuevo con `restaurantId` va a
  `SCOPED_MODELS` y `tenant-guard.test.js` (no ignorar el fallo del test).
- **Dinero server-side:** precios/tiers se resuelven en el backend; nunca `req.body.total`.
  Sin `.catch(() => null)` en operaciones de dinero.
- **Migraciones:** `prisma migrate dev` → `prisma migrate deploy` **manual** en prod.
  Prohibido `prisma db push`. Campos de dinero en `Decimal`, no `@db.Money`/`Float`.
- **Mass-assignment:** nunca `data: req.body`. La regla del CLAUDE.md nombra
  `pick(req.body, [...])` de `lib/validate.js`, pero **`retail.routes.js` no usa `pick`**:
  valida con zod y arma el `data`/`patch` campo por campo. Ambos cumplen la regla; en
  este módulo se sigue el patrón zod que ya está establecido.
- **Todo aditivo:** ninguna migración de este plan borra columnas ni rompe el giro `ROPA`.
