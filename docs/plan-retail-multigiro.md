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

Lo específico de "ropa" está **concentrado en la UI**:

- `apps/moda/src/lib/retail.ts` — `SIZES = ["XS","S","M","L","XL"]` hardcodeado, mapa
  `TONE` de colores, y la **matriz talla×color** (`matrix`, `skuByVariant`).
- `apps/moda/src/app/page.jsx` — el POS pinta selector talla×color, swatches, "Stock por talla".
- `apps/moda/src/app/admin/(panel)/catalogo/page.tsx` — campos "Talla / Color / Material",
  ícono `Shirt`, placeholders "Camisa Oxford".
- `RetailProduct.gender` / `season` — campos de moda (nullable, inofensivos).

## Estrategia: "giro" como configuración

En vez de forkear, el **giro** (`Location.businessType`) dirige un **esquema de atributos**
por tenant. Reutilizamos el modelo existente `VariantTemplate` / `VariantTemplateOption`
(hoy restaurant-scoped) como diccionario de atributos por giro, en lugar de la lista
`SIZES` fija:

- Ropa → atributos `Talla` (XS…XXL), `Color`.
- Ferretería → `Medida`, `Rosca`, `Material`, `Presentación` (pza/caja).
- Refaccionaria → `Lado`, `Posición`, `OEM/Genérico`.

`RetailSku` **ya tiene** `size/color/material/style` genéricos; los reetiquetamos por
giro en la UI (attr1..attr4) sin migración destructiva. Solo agregamos campos nuevos
donde el modelo actual no alcanza (unidad de medida, ubicación, proveedor, compat.).

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
- `apps/moda/src/lib/tenant.ts` — persistir `giro` junto a `restaurantId/locationId`
  (viene del handoff del hub TPV y de `Workspace.businessType`).
- `apps/moda/src/lib/retail.ts` — `SIZES` deja de ser constante global: se deriva de
  `getGiro()`; `mapCatalogToProducts` construye `matrix` solo si `useVariantMatrix`,
  si no arma lista plana de SKUs (variante única).

**Sin migración.** Riesgo bajo. Compatibilidad total con ropa (default `ROPA`).

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
```

- `packages/database/prisma/schema.prisma` — agregar los 4 campos a `model RetailSku`
  (todos opcionales / con default). **NO** usar `@db.Money`; `Decimal` para `unitsPerPackage`.
- **`packages/database/tenant-guard.js`** — `RetailSku` ya está en `SCOPED_MODELS`
  (líneas 85–93). No se agrega modelo nuevo en esta fase ⇒ `tenant-guard.test.js` no rompe.
- `apps/backend/src/routes/retail.routes.js`:
  - `skuSchema` / `skuUpdateSchema` (líneas 161–184): agregar
    `unitOfMeasure: z.enum([...]).optional()`, `unitsPerPackage`, `binLocation`,
    `supplierRef`.
  - `POST /catalog/skus` y `PUT /catalog/skus/:id`: pasar los campos vía el `pick(...)`
    de `lib/validate.js` (mass-assignment guard — regla de seguridad del CLAUDE.md).
  - `GET /catalog` (línea 510): incluir los campos nuevos en el `select`.

**Flujo de migración (CLAUDE.md):** `prisma migrate dev` local → `prisma migrate deploy`
**manual** contra prod coordinado con el deploy del backend. Prohibido `prisma db push`.

---

## Fase 2 — Des-modizar la UI (transversal)

**Meta:** catálogo y POS dejan de asumir talla/color; consumen `GiroConfig`.

- `apps/moda/src/app/admin/(panel)/catalogo/page.tsx`:
  - Reemplazar labels fijos "Talla/Color/Material" por `giro.attrs[].label` (map sobre
    `size/color/material/style`).
  - Ícono `Shirt` → `giro.icon`. Placeholders desde `giro.productPlaceholder`/`skuPlaceholder`.
  - Cuando `!useVariantMatrix`: ocultar swatch de color, mostrar tabla plana con columnas
    `SKU · Descripción · Unidad · Precio · Stock · Ubicación`.
  - Agregar campos nuevos (Fase 1): Unidad de medida (select), Piezas por caja, Ubicación.
- `apps/moda/src/app/page.jsx` (POS):
  - `VariantModal` (≈línea 546): si `useVariantMatrix` → grid talla×color actual;
    si no → agregar directo (variante única) o selector genérico de atributo.
  - Renglón del carrito (líneas 490–500): columnas dinámicas; "Talla/Color" → atributos
    del giro o descripción del SKU.
  - Búsqueda/escaneo `doScan` (línea 471): ya matchea `sku`/`barcode`/`name`; ampliar a
    `binLocation` y (Fase 4) equivalencias.
- `apps/moda/src/lib/printer.ts` (`buildLabel`): etiqueta genérica (descripción + código +
  precio + unidad) en vez de color/talla fijos.

**Sin migración.** Aquí vive el grueso del rework de front, pero acotado a 3–4 archivos.

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
    CONSTRAINT "retail_price_tiers_sku_fk" FOREIGN KEY ("skuId")
      REFERENCES "retail_skus"("id") ON DELETE CASCADE
  );
  CREATE INDEX "retail_price_tiers_sku_idx" ON "retail_price_tiers"("skuId", "minQty");
  ```
  - `schema.prisma`: `model RetailPriceTier` con `restaurantId` + relación a `RetailSku`.
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
- Landing: reutilizar el patrón de `apps/landing/app/moda/*` para páginas por vertical.
- **Decisión de branding pendiente:** ¿una sola app "Retail+" multigiro (recomendado) o
  dominios/APK separados por giro (`ferreteria.mrtpvrest.com`)? El código es el mismo; solo
  cambia el `giro` inicial y el branding.

---

## Orden sugerido y esfuerzo

| Fase | Alcance | Migración | Esfuerzo |
|---|---|---|---|
| 0 | Base multigiro (`giro.ts`, tenant, retail.ts) | — | S |
| 1 | Campos genéricos SKU (unidad, ubicación, proveedor) | Sí (aditiva) | S |
| 2 | Des-modizar UI (catálogo + POS + etiqueta) | — | **M** |
| 3 | Ferretería (granel + mayoreo) | Sí (tabla tiers) | M |
| 4 | Refaccionaria (fitment + equivalencias) | Sí (2 tablas) | M |
| 5 | Branding/onboarding por giro | — | S |

**MVP recomendado para validar un giro:** Fases 0 + 1 + 2 + (3 **o** 4 según el giro).
Con eso una ferretería ya opera (inventario, granel, caja, ticket) o una refaccionaria
busca por equivalencia/compatibilidad.

## Guardas / reglas del proyecto a respetar

- **Multi-tenant:** filtrar por `restaurantId`; todo modelo nuevo con `restaurantId` va a
  `SCOPED_MODELS` y `tenant-guard.test.js` (no ignorar el fallo del test).
- **Dinero server-side:** precios/tiers se resuelven en el backend; nunca `req.body.total`.
  Sin `.catch(() => null)` en operaciones de dinero.
- **Migraciones:** `prisma migrate dev` → `prisma migrate deploy` **manual** en prod.
  Prohibido `prisma db push`. Campos de dinero en `Decimal`, no `@db.Money`/`Float`.
- **Mass-assignment:** `pick(req.body, [...])` de `lib/validate.js`, nunca `data: req.body`.
- **Todo aditivo:** ninguna migración de este plan borra columnas ni rompe el giro `ROPA`.
