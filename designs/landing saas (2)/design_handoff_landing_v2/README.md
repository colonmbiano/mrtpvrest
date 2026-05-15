# Handoff: MRTPVREST Landing v2 — Página Pública

> **Para el desarrollador:** Los archivos en esta carpeta son **prototipos de diseño de alta fidelidad** — referencias visuales y de comportamiento, no código de producción. La tarea es recrear estos diseños en el codebase Next.js existente (`landing/`) usando sus patrones y convenciones. El archivo `MRTPVREST Landing v2.html` es la fuente de verdad visual.

---

## Overview

Landing pública de conversión para `mrtpvrest.com`. Orientada a dueños de restaurantes pequeños/medianos en LATAM. Enfoque: pain-first copy, social proof temprano, demo video, pricing con equivalentes en moneda local.

**Stack:** Next.js 14 · TypeScript · App Router (`landing/app/page.tsx`) · CSS Modules o Tailwind

**Fidelidad:** Alta fidelidad (hifi) — pixel-perfect.

---

## Design Tokens

Mismos tokens del Halo Design System (ver README del SaaS Admin). La landing usa el mismo sistema de colores/fuentes pero solo en dark mode (sin toggle).

```css
/* Variables raíz — dark mode fijo */
--bg:     #08080f
--surf-1: #0f0f1c
--surf-2: #15152a
--surf-3: #1c1c38
--bd-1:   rgba(255,255,255,.08)
--bd-2:   rgba(255,255,255,.14)
--tx:     #f4f4fb
--tx-hi:  #ffffff
--tx-mid: #c4c4de
--tx-mut: #9494b8
--tx-dim: #6e6e92

--iris-400: #9472ff
--iris-500: #7c3aed
--iris-soft: rgba(124,58,237,.14)
--iris-glow: rgba(124,58,237,.35)
```

---

## Secciones (orden en página)

### 1. Nav (sticky)

- `height: 60px`, `backdrop-filter: blur(16px)`, `background: rgba(8,8,15,.9)`
- Logo + nombre (Syne 800 15px) + links nav (DM Sans 500 13px) + "Iniciar sesión" (ghost) + "Empezar gratis →" (iris CTA)
- Sin selector de idioma en v2 (simplificado)

### 2. Hero

**Copy:**
- Eyebrow: `"AHORA EN LATAM · MRTPVREST.COM"` en DM Mono + dot verde pulsando
- H1 línea 1: `"¿Cuánto ganaste ayer"` — gradiente blanco→tx-mid
- H1 línea 2: `"en tu restaurante?"` — gradiente iris-300 → pink → iris-400
- Sub: `"Si no lo sabes en 5 segundos, tienes un problema..."` — 17px tx-mut
- Font-size H1: `clamp(36px, 5.5vw, 72px)`, weight 800, letter-spacing -0.04em

**Social proof inline** (encima de CTAs):
- 5 avatares de emoji apilados (overlap -8px, border `2px solid --bg`)
- Texto: `"★★★★★ +180 restaurantes en LATAM ya digitalizados"`

**CTAs:**
- Primary: `"🚀 Crear mi restaurante gratis"` — iris bg, padding 14px 28px, radius 11px
- Secondary: `"▶ Ver demo en 60 segundos"` — surf-1 bg + play circle iris

**Trust strip** (debajo de CTAs):
```
✓ Sin tarjeta de crédito  ✓ 14 días gratis  ✓ Soporte en español  ✓ Onboarding por IA en 10 min
```
DM Mono 10.5px, tx-dim, separados por 20px gap

**Orbs de fondo:**
- Orb 1: `700×500px`, radial iris 0.18, `top:-100px center`, `filter: blur(80px)`
- Orb 2: `300×300px`, radial pink 0.08, `bottom:0 right:0`

### 3. Video placeholder

**Aspect ratio:** 16:9, max-width 900px, centrado
**Fondo:** `linear-gradient(135deg, #0c0c20, #1a1535)`
**Thumbnail image:** usar screenshot real del admin o TPV como fondo con `opacity: 0.55`
**Play button:** 72px círculo iris, `box-shadow: 0 8px 32px var(--iris-glow), 0 0 0 12px rgba(124,58,237,.12)`
**Tag:** `"DEMO EN VIVO · 60 SEGUNDOS"` en DM Mono, pill con blur
**Footer bar:** dot verde pulsando + `"Onboarding completo grabado en producción real"` + nombre de restaurante

**Para implementar:** cuando tengas el video, reemplazar el div por un `<video>` o iframe de Loom/YouTube con el mismo aspect-ratio y estilos.

### 4. Pain → Solución (3 cards)

Grid 3 columnas, gap 16px

Cada card (`--surf-1` bg, `border-radius: 16px`, `padding: 24px`):
- Top border de 2px en `--err` con `opacity: 0.4`
- Sección mala: label `"❌ SIN SOLUCIÓN"` en rojo DM Mono 13px + descripción en tx-mut
- Divider dashed
- Sección buena: label `"✓ CON MRTPVREST"` en verde DM Mono 13px + descripción en tx-mid

**3 problemas documentados:**
1. Cuentas en cuaderno → Dashboard en tiempo real
2. Pedidos perdidos → KDS conectado
3. Empleados sin control → Turnos + permisos por rol

### 5. Las 6 Apps (grid de banners)

Grid 2 columnas, gap 14px

Cada card:
- `border-radius: 16px`, `border: 1px solid --bd-1`
- Imagen con `object-fit: cover`
- Hover: `translateY(-4px)` + box-shadow de color según app (ok/iris/amber/err/info/purple)
- Label flotante: aparece en hover, `backdrop-filter: blur(8px)`, bottom-left

**Imágenes (en `landing/public/showcase/`):**
```
app-cliente.png → glow verde
kiosko.png      → glow iris
tpv.png         → glow amber
kds.png         → glow rojo
delivery.jpg    → glow azul
admin.jpg       → glow púrpura
```

### 6. Cómo funciona (3 pasos)

Grid 3 columnas centrado, max-width 900px

Línea conectora entre steps: `height:1px`, gradiente `iris-soft → iris-400 → iris-soft`, `top: 28px`

Cada step:
- Número en roundel: 56px, `border-radius:16px`, `--iris-soft` bg, Syne 800 20px iris-400
- Título Syne 700 15px
- Descripción 13px tx-mut

**Copy:**
1. "Chatea con la IA" — configura módulos por chat en 8 min
2. "Instala el TPV" — tablet Android, impresora, pantalla cocina
3. "Cobra tu primera orden" — pagos, delivery, QR desde día 1

### 7. Sección "En el restaurante" (image slots)

Grid `2fr 1fr`, gap 14px:
- **Slot principal** (`aspect-ratio: 16/10`): foto real del equipo/dueño con tablet → **usar `hero-person.png` como default**
- **Slot KDS** (flex 1, min-height 140px): cocina con KDS
- **Slot equipo** (flex 1, min-height 140px): ambiente del local

**Para implementar en Next.js:** reemplazar los `image-slot` web components con `<Image>` de Next.js usando `fill` + `object-fit: cover`. Las imágenes deben venir del CMS o de `public/`.

**Overlay badge** en slot principal:
```
● dot verde pulsando  |  "SISTEMA EN OPERACIÓN REAL"  |  DM Mono 10.5px
background: rgba(8,8,15,.8) + backdrop-filter:blur(8px)
```

### 8. Testimonios (3 cards)

Grid 3 columnas, gap 16px

Cada card:
- Stars: `★★★★★` en `#f59e0b`
- Quote: 14px tx-mid, italic, con pseudo `::before` de `"` en Syne 28px iris-400
- Autor: avatar circular 44px + nombre (600 13px) + negocio (DM Mono 10px tx-dim)

**Avatares:** imágenes reales en slots — ver sección de imagen slots en el HTML

**3 testimonios:**
1. María García · Tacos El Güero · CDMX
2. Carlos Mendoza · Pollos Don Carlos · Monterrey
3. Valentina Ríos · Café Andino · Bogotá

### 9. Pricing

**Toggle Mensual/Anual** — pill "✓ Ahorras 2 meses" aparece en modo anual

| Plan | Mensual | Anual | MXN equiv. |
|------|---------|-------|------------|
| Básico | $29 | $24 | ~$580 MXN |
| Pro | $59 | $49 | ~$1,180 MXN |
| Unlimited | $99 | $82 | ~$1,980 MXN |

Card Pro (`featured`):
- `background: linear-gradient(180deg, rgba(124,58,237,.08), --surf-1 60%)`
- `border-color: rgba(124,58,237,.35)`
- `box-shadow: 0 8px 40px rgba(124,58,237,.1)`
- Badge "✦ MÁS ELEGIDO" flotante, iris bg

Cada card incluye:
- Precio en Syne 40px + `/mes` en DM Sans 13px tx-dim
- Equivalente MXN + COP en DM Mono 11px tx-dim
- Lista de features con `✓` verde / `–` dim
- Nota trial: `"✦ 14 días gratis incluidos · sin tarjeta"` en ok verde

### 10. FAQ (acordeón)

5 preguntas, max-width 680px, centrado

Cada item: `border-bottom: 1px solid --bd-1`
Header: H4 (14.5px 600) + botón `+` que rota 45° cuando abre
Body: max-height 0→200px transition + opacity 0→1

**Preguntas:**
1. ¿Necesito saber de tecnología?
2. ¿En cuánto tiempo puedo estar vendiendo?
3. ¿Qué pasa si ya tengo un POS?
4. ¿El precio es en dólares?
5. ¿Qué pasa cuando termina el trial?

### 11. CTA Final

`padding: 96px 32px`, `radial-gradient(ellipse 700px 350px at 50% 100%, rgba(124,58,237,.18), transparent 70%)`

H2: `"Tu restaurante merece"` + `"tecnología de verdad"` (em en gradiente iris→pink)

CTAs: mismo patrón que hero

### 12. Footer

Flex space-between, `border-top: 1px solid --bd-1`, `padding: 24px 32px`
Links en DM Mono 11px: Docs · Precios · Contacto · Privacidad · Términos

---

## Scroll Reveal

Todos los elementos con clase `.reveal` entran con:
```css
opacity: 0 → 1
transform: translateY(20px) → none
transition: 0.65s ease
```

Disparado por `IntersectionObserver` con `threshold: 0.1`. Delays escalonados:
`.rd1 { delay: 0.08s }`, `.rd2 { 0.16s }`, `.rd3 { 0.24s }`, `.rd4 { 0.32s }`

---

## Assets requeridos

```
landing/public/showcase/app-cliente.png   → ya existe
landing/public/showcase/kiosko.png        → ya existe
landing/public/showcase/tpv.png           → ya existe
landing/public/showcase/kds.png           → ya existe
landing/public/showcase/delivery.jpg      → ya existe
landing/public/showcase/admin.jpg         → ya existe

landing/public/people/hero-main.jpg       → crear: dueño con tablet (ver brief en chat)
landing/public/people/testimonio-maria.jpg → crear: retrato circular mujer CDMX
landing/public/people/testimonio-carlos.jpg → crear: retrato circular hombre MTY
landing/public/people/testimonio-valentina.jpg → crear: retrato circular mujer BOG
landing/public/people/kitchen-kds.jpg     → crear: cocinero con pantalla KDS
landing/public/people/restaurant-team.jpg → crear: equipo/ambiente del local
```

---

## Video demo (cuando esté listo)

Reemplazar el div `.video-thumb` con:
```tsx
// Opción A: video autoplay muted (demo silencioso)
<video autoPlay muted loop playsInline className="video-thumb-img">
  <source src="/demo.mp4" type="video/mp4"/>
</video>

// Opción B: embed de Loom/YouTube
<iframe src="https://loom.com/embed/[ID]" allowFullScreen className="w-full h-full"/>
```

---

## Responsive

| Breakpoint | Cambio |
|------------|--------|
| < 860px | Pain grid / testimonios / planes / apps: 1 columna |
| < 600px | Nav: ocultar links · Hero: CTAs en columna · H1 28px |

---

## Archivos incluidos

```
MRTPVREST Landing v2.html   → Prototipo completo (fuente de verdad visual)
landing-assets/             → 6 screenshots reales de los productos
```
