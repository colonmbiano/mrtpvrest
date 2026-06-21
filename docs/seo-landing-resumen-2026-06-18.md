# Resumen SEO — Landing mrtpvrest.com

> **Fecha:** 2026-06-18 · **App:** `apps/landing` (Next.js 16 App Router) · **Deploy:** Vercel (push directo a `master`)
> **Resultado:** la landing pasó de **1 página indexable a ~28**, todo verificado y en producción.

---

## 1. Objetivo

Auditoría SEO completa de la landing `mrtpvrest.com` y ejecución del plan resultante.
Punto de partida: una sola página (`/`) más un `/demo` 3D sin valor SEO; sin sitemap, sin robots,
sin datos estructurados, imágenes sin optimizar y keyword principal ("punto de venta para
restaurantes") prácticamente ausente del copy (usaba "TPV"/"POS"/"Warm Tech").

---

## 2. Diagnóstico inicial (auditoría)

- **On-page:** base decente (un H1, jerarquía H2 limpia, alt text, OG/Twitter, `lang="es"`),
  pero el `<title>` gastaba espacio en "Warm Tech" en vez de la keyword real.
- **Técnico:** ❌ sin `sitemap.xml`, ❌ sin `robots.txt`, ⚠️ sin canonical, ❌ sin JSON-LD,
  ❌ todas las imágenes con `unoptimized` (ignoraba avif/webp → LCP alto), ⚠️ `loading="eager"`
  below-the-fold.
- **Contenido:** una sola página → cero captación de cola larga.
- **Competencia (MX):** Parrot Software, Soft Restaurant (NationalSoft), Loyverse, Poster, Wansoft.
  Todos con decenas de páginas, blog y schema.

---

## 3. Lo que se hizo, por fases

| Fase | Commit | Entregable |
|------|--------|------------|
| 1 — Quick wins técnicos | `39824be` | `sitemap.ts` + `robots.ts`, canonical, title/description/OG reposicionados a "punto de venta para restaurantes", JSON-LD `Organization`/`WebSite`/`SoftwareApplication`/`FAQPage`, imágenes `unoptimized`→avif/webp + `lazy`, keyword en eyebrow/H1/hero, `noindex` en `/demo` |
| 2 — Feature pages + comparativas | `f4a4808` | 6 feature pages `/funciones/[slug]` + índice `/funciones`; 3 comparativas `/comparativa/[slug]` (parrot, soft-restaurant, loyverse); chrome compartido (`SiteNav`/`SiteFooter`); enlazado interno |
| 3 — Landings por giro | `c053abb` | 6 giros `/punto-de-venta/[giro]` + hub `/punto-de-venta` |
| 4 — Blog TOFU | `cce3325` | `/blog` + 5 guías pillar `/blog/[slug]`; estilos de prosa en `globals.css` |
| 5 — Facturación + giros | `92a41ef` | Feature `/funciones/facturacion` (gap CFDI resuelto) + 2 giros (pollería, fonda) |

### Páginas resultantes

- **Feature pages (7):** punto-de-venta, kds-cocina, delivery, kiosko, app-cliente, administracion, **facturacion**
- **Comparativas (3):** parrot, soft-restaurant, loyverse
- **Giros (8):** taqueria, pizzeria, cafeteria, bar, comida-rapida, marisqueria, polleria-rosticeria, fonda-cocina-economica
- **Blog (1 índice + 5 posts):** como-elegir-punto-de-venta-para-restaurante, cuanto-cuesta-un-punto-de-venta-para-restaurante, que-es-un-kds-de-cocina, como-reducir-mermas-en-tu-restaurante, delivery-propio-vs-plataformas
- **Hubs:** `/funciones`, `/punto-de-venta`, `/blog`

---

## 4. Decisiones clave

- **Arquitectura data-driven:** todo el contenido vive en `app/_data/*` (`features.ts`,
  `comparisons.ts`, `verticals.ts`, `posts.ts`, `site.ts`). Las rutas dinámicas usan
  `generateStaticParams` (SSG) y el `sitemap.ts` mapea sobre esos arrays. **Sumar una página
  nueva = agregar un objeto a un array.**
- **Cero CSS nuevo (salvo prosa):** las páginas reutilizan las clases de `globals.css`
  (`.section`, `.pain-grid`, `.steps`, `.app-card`, `.faq-list`, `.final-cta`...). El blog
  sumó selectores nuevos (`.prose`, `.post-*`) sin tocar lo existente.
- **Anti-canibalización:** el hub `/punto-de-venta` apunta a "punto de venta por tipo de
  restaurante" para no competir con el home, que sigue siendo el primario de "punto de venta
  para restaurantes".
- **Comparativas honestas:** descripciones de competidores factuales y de alto nivel,
  diferenciación por fortalezas reales de MRTPVREST + criterios neutrales de evaluación.
  Sin matrices de ✗ que pudieran ser inexactas o difamatorias.
- **Copy de facturación honesto (hallazgo clave):** investigando el código se confirmó que el
  gap CFDI era de **mensaje, no de producto**. El TPV ya hace **autofactura por QR** (imprime
  RFC/giro + folio + QR al portal de facturación del restaurante: `showInvoiceQr`/`invoiceUrl`/
  `invoiceFolioPrefix` en `apps/tpv/src/lib/printer-tcp.ts`). **No timbra CFDI nativo** (sin
  PAC). El copy lo comunica tal cual, sin sobre-prometer timbrado.
- **SEO técnico por página:** cada página dinámica lleva `alternates.canonical`, OG propio y
  JSON-LD `BreadcrumbList` + `FAQPage` (los posts además `BlogPosting`).

---

## 5. Verificación

- Cada fase se verificó con `next build` **real** (compile + TypeScript + generación estática).
- Build final: **TypeScript OK**, todas las páginas prerenderizadas (SSG).
- Diffs limpios, acotados a `apps/landing` (revisados con `git diff --stat` antes de cada commit).

### Gotcha de verificación (importante para retomar)

El worktree **no tiene `node_modules`** (viven en el repo padre). Para un type-check real hay que
correr `pnpm install --frozen-lockfile` dentro del worktree (~50s). **Los junctions a los
`node_modules` del padre NO sirven**: Turbopack rechaza symlinks que apuntan fuera del root del
proyecto. Sin instalar deps, el build compila pero el type-check truena con un error ambiental
(`react/jsx-runtime not found`) que **no** es regresión.

---

## 6. Archivos tocados (apps/landing/app)

**Nuevos**
- `sitemap.ts`, `robots.ts`
- `_data/site.ts`, `_data/features.ts`, `_data/comparisons.ts`, `_data/verticals.ts`, `_data/posts.ts`
- `_components/SiteChrome.tsx`
- `funciones/page.tsx`, `funciones/[slug]/page.tsx`
- `comparativa/[slug]/page.tsx`
- `punto-de-venta/page.tsx`, `punto-de-venta/[giro]/page.tsx`
- `blog/page.tsx`, `blog/[slug]/page.tsx`

**Modificados**
- `layout.tsx` (metadata/canonical/keywords)
- `page.tsx` (keyword en hero, JSON-LD, imágenes optimizadas + lazy, enlazado interno nav/footer)
- `demo/layout.tsx` (`noindex`)
- `globals.css` (estilos de prosa del blog)

---

## 7. Pendiente (NO es código)

- **Link-building externo:** directorios POS, reviews, comparadores MX. Trabajo de difusión.
- **Conectar Google Search Console** (+ MCP Ahrefs/Semrush para volúmenes/posiciones reales).
- **Más giros/posts:** posible, pero con retorno marginal hasta tener datos de qué rankea.

### Recomendación

Esperar **2-4 semanas** a que Google indexe las ~28 páginas, conectar GSC y volver a correr
`/seo-audit` con datos reales para iterar con evidencia en vez de a ciegas.

---

## 8. Keywords objetivo (sin datos de volumen aún)

| Página | Keyword |
|--------|---------|
| `/` (home) | punto de venta para restaurantes |
| `/funciones/kds-cocina` | KDS / pantalla de cocina / sistema de comandas |
| `/funciones/facturacion` | punto de venta con facturación (autofactura) |
| `/punto-de-venta/taqueria` | punto de venta para taquería |
| `/punto-de-venta/fonda-cocina-economica` | punto de venta para fonda / cocina económica |
| `/comparativa/parrot` | alternativa a Parrot Software |
| `/blog/que-es-un-kds-de-cocina` | qué es un KDS |
| `/blog/cuanto-cuesta-un-punto-de-venta-para-restaurante` | cuánto cuesta un punto de venta |

(Lista completa de 15-25 keywords en la auditoría de la sesión.)
