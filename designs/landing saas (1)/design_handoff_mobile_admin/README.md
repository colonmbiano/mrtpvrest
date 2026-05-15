# Handoff: MRTPVREST Mobile Admin

> **Para el desarrollador:** El archivo `MRTPVREST Mobile Admin.html` es un **prototipo de alta fidelidad** del admin mobile. La tarea es recrear esta experiencia como una **Progressive Web App (PWA)** o una vista responsive del admin Next.js existente (`saas/`), optimizada para móvil. No copiar el HTML directamente.

---

## Overview

Versión mobile del SaaS Admin de MRTPVREST. Orientada al Super Admin que necesita monitorear la plataforma desde el celular. 3 tabs principales + panel de IA como bottom sheet.

**Stack recomendado:** Next.js + Tailwind — ruta `/mobile` o adaptar el layout responsive del `saas/` existente con un mobile-first layout cuando el viewport es < 768px.

**Fidelidad:** Alta fidelidad (hifi).

---

## Design Tokens

Mismos tokens del Halo Design System (ver README del SaaS Admin). Mobile usa dark mode fijo.

**Touch targets mínimos:** 44px en todos los elementos interactivos (botones, tabs, chips, rows).

---

## Shell / Layout

```
┌─────────────────────────────────┐
│  TOP BAR (60px)                 │  sticky, blur backdrop
├─────────────────────────────────┤
│                                 │
│  SCREEN CONTENT                 │  flex:1, overflow-y:auto
│  padding: 16px 16px 120px      │  (120px para clearance del tabbar)
│                                 │
├─────────────────────────────────┤
│  BOTTOM TAB BAR (82px)         │  position:absolute bottom:0
└─────────────────────────────────┘
         [FAB]  ← position:absolute bottom:96px right:18px
```

---

## Top Bar

- Height: 60px
- Izquierda: Logo "MRTPVREST" (Syne 800 16px) con span iris
- Derecha: botón IA (34px roundel `--surf-2`) con dot iris pulsando + botón tenants

---

## Bottom Tab Bar

```css
height: 82px;
background: rgba(12,12,23,.9);
backdrop-filter: blur(16px);
border-top: 1px solid var(--border-1);
padding: 10px 0 0;
```

**3 tabs:**
| Tab | Ícono | Badge |
|-----|-------|-------|
| Inicio | home | — |
| Alertas | bell | count críticas (rojo) |
| Errores | x-circle | count CRITICAL+ERROR (rojo) |

**Tab activo:**
- Roundel de ícono: `background: --brand-soft`, color `--brand-hi`
- Label: `--brand-hi`, font-weight 600

**Tab inactivo:**
- Ícono color `--dim`
- Label `--dim`, font-weight 500

---

## FAB (Floating Action Button)

```css
width: 52px; height: 52px;
border-radius: 16px;
background: linear-gradient(135deg, var(--brand-hi), var(--brand));
box-shadow: 0 8px 24px var(--brand-glow), inset 0 0 0 1px rgba(255,255,255,.1);
position: absolute; bottom: 96px; right: 18px;
z-index: 25;
```

Dot verde (8px) en esquina superior-derecha con animación pulse.
Click → abre AI bottom sheet

---

## Tab 1: Inicio (Home)

**KPI grid 2×2:**
Mismo diseño que desktop pero adaptado:
- `grid-template-columns: 1fr 1fr`, gap 10px
- KPI val: Syne 24px (vs 28px desktop)
- Borde izquierdo 3px en accent color

KPIs: MRR · Activas · Conversión % · Trial count

**Strip de alertas críticas** (si las hay):
- Fondo rojo semitransparente + borde rojo
- Click navega al tab Alertas

**Activity feed (card):**
- 6 items, cada uno: icon roundel 32px + tenant + texto + tiempo
- `min-height: 44px` por row

**Revenue por plan:**
- 3 barras horizontales con label + valor alineado derecha
- Porcentaje de fill proporcional

---

## Tab 2: Alertas

**Header:** título + count pill + botón refresh

**Filter chips** (horizontal scroll):
- Todas · Críticas · Warnings
- Activo: `--brand-soft` bg, `--brand-hi` color

**Alert cards:**
- Cada card: roundel de emoji (🚨/⚠️) + título + pills (sev + ACK) + descripción
- Footer con botones "Marcar ACK" + "Investigar"
- ACK-eadas: opacidad 0.5

---

## Tab 3: Errores

**Filter chips** (horizontal scroll):
- Todos · CRITICAL · ERROR · WARN · INFO
- Activo: fondo del color del nivel (rojo/amber/azul)

**Error rows:**
- `border-left: 3px solid [lvl-color]`
- Expandibles al click → muestra stack trace en `--surf-2` bg, DM Mono 9.5px
- Botones en expand: Copiar · Analizar IA

**Polling:** 4s (con indicador de spinner cuando refreshing)

---

## AI Bottom Sheet

Activado por FAB o botón IA en top bar.

**Overlay:** `rgba(5,5,12,.6)` + `backdrop-filter: blur(4px)` → click cierra

**Sheet:**
```css
position: absolute; left:0; right:0; bottom:0;
height: 88%;
border-radius: 22px 22px 0 0;
background: var(--surf-1);
animation: slideUp 0.28s cubic-bezier(0.32,0.72,0,1);
```

**Handle:** `36×4px`, `border-radius:2px`, `--border-2` bg, centrado

**Header:** logo cónico iris (34px roundel) + "MRTPV Intelligence" + "Gemini" + botón X

**Chat:** mismo diseño que panel desktop adaptado al ancho móvil
- Bubbles user: iris bg, right-aligned, `border-radius: 16px 16px 4px 16px`
- Bubbles AI: `--surf-2` + border, left-aligned, `border-radius: 16px 16px 16px 4px`
- Data cards embebidos (mismo diseño desktop)

**Quick chips** (scroll horizontal):
- 🔴 Errores · 💰 Facturación · 🔥 Churn risk · 🚨 Alertas SLA

**Input:** textarea auto-resize + botón send iris (40px roundel)

---

## Gestos

| Gesto | Acción |
|-------|--------|
| Tap FAB | Abre AI sheet |
| Tap overlay del sheet | Cierra AI sheet |
| Swipe down en sheet | Cierra AI sheet (opcional) |
| Tap row de error | Expande/colapsa stack |
| Tap alert ACK | Marca como reconocida |
| Pull to refresh | Recarga datos de la tab activa |

---

## Toast notifications

```css
position: absolute; bottom: 96px; left: 50%;
transform: translateX(-50%);
background: var(--surf-1); border-radius: 12px;
padding: 9px 14px;
transition: opacity .25s, transform .25s;
```

Aparecen encima del tabbar, debajo del FAB.

---

## Live notification

6 segundos después de cargar, mostrar un toast simulando un evento:
`"💰 [Tenant] · [Evento]"`

En producción: conectar a un websocket o long-polling endpoint.

---

## PWA / Responsive

Para implementar como PWA en Next.js:

```json
// public/manifest.json
{
  "name": "MRTPVREST Admin",
  "short_name": "MRTPV Admin",
  "display": "standalone",
  "background_color": "#08080f",
  "theme_color": "#7c3aed",
  "icons": [...]
}
```

Meta tags en `layout.tsx`:
```tsx
<meta name="theme-color" content="#7c3aed"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
```

---

## Archivos incluidos

```
MRTPVREST Mobile Admin.html  → Prototipo completo en iPhone frame (fuente de verdad visual)
```

---

## Checklist de implementación

- [ ] Layout mobile-first en `saas/app/(dashboard)/layout.tsx` cuando viewport < 768px
- [ ] Bottom tab bar component con 3 tabs + badges
- [ ] FAB component
- [ ] Home screen: KPI 2×2 + alerts strip + activity feed + revenue bars
- [ ] Alerts screen: filtros + alert cards + ACK
- [ ] Errors screen: filtros por nivel + expandibles + polling 4s
- [ ] AI bottom sheet: chat UI + quick chips + data cards
- [ ] Toast notifications
- [ ] PWA manifest + meta tags
