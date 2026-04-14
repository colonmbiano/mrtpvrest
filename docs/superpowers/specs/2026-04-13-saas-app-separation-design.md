# Spec: apps/saas — Separación del Panel SaaS + Design System Dark Purple

**Fecha:** 2026-04-13  
**Estado:** Aprobado

---

## Resumen

Separar el panel de Super Admin (SaaS Central) de `apps/admin` en su propia app Next.js independiente (`apps/saas`), desplegada en `saas.mrtpvrest.com`. Simultáneamente, rediseñar todas las páginas públicas de `apps/admin` (login, register, onboarding, verify-email) con el design system dark purple de la landing page. Añadir tematización dinámica por cliente (color de acento extraído del logo) y soporte de modo claro/oscuro en ambas apps.

---

## 1. Estructura de repositorio

### Antes
```
apps/
  admin/
    app/
      (saas)/          ← rutas del panel SaaS
        dashboard/
        marcas/
        facturacion/
        logs/
        api-keys/
        ajustes/
        layout.tsx
        components/    (Sidebar, MrrChart, ThemeProvider)
      saas/
        login/page.tsx ← login del super admin
      login/           ← auth restaurante (diseño light)
      register/        ← auth restaurante (diseño light)
      onboarding/      ← setup IA (diseño dark orange)
      verify-email/    ← verificación email
```

### Después
```
apps/
  admin/
    app/
      login/           ← redesign dark purple
      register/        ← redesign dark purple
      onboarding/      ← redesign dark purple (orange → purple)
      verify-email/    ← redesign dark purple
      (admin)/         ← sin cambios
      (saas)/          ← ELIMINADO
      saas/            ← ELIMINADO
  saas/                ← NUEVA APP
    app/
      login/
      dashboard/
      marcas/
      facturacion/
      logs/
      api-keys/
      ajustes/
    components/
      Sidebar.tsx
      MrrChart.tsx
      ThemeProvider.tsx
    app/layout.tsx
    package.json
    tailwind.config.ts
    next.config.js
    vercel.json
```

---

## 2. Nueva app `apps/saas`

### `package.json` — requisitos críticos

```json
{
  "name": "@mrtpvrest/saas",
  "dependencies": {
    "@mrtpvrest/database": "workspace:*",
    "next": "...",
    "react": "...",
    "react-dom": "...",
    "tailwindcss": "..."
  },
  "scripts": {
    "dev": "next dev -p 3005",
    "build": "next build",
    "start": "next start -p 3005"
  }
}
```

- `@mrtpvrest/database: workspace:*` — acceso directo a Prisma para consultas globales del super admin.
- Puerto `3005` — evita conflictos con `apps/admin` (3000), `apps/backend` (3001), `apps/landing` (3002), `apps/tpv` (3003/3004).

### `vercel.json`
```json
{
  "framework": "nextjs"
}
```
Proyecto Vercel separado, dominio `saas.mrtpvrest.com`.

### `turbo.json` (monorepo)
Añadir `apps/saas` al pipeline de Turborepo igual que las demás apps.

---

## 3. Design system — Dark Purple

### Variables CSS base (compartidas en ambas apps)

```css
:root {
  /* Fondo — SIEMPRE FIJO, nunca cambia con tematización */
  --bg:     #080810;
  --surf:   #0e0e1a;
  --surf2:  #13131f;
  --border: #1e1e30;
  --border2:#2a2a40;

  /* Texto */
  --text:   #f0f0f8;
  --muted:  #6b6b90;
  --muted2: #4a4a6a;

  /* Acento dinámico — cambia por cliente */
  --brand-primary: #7c3aed; /* fallback: purple landing */

  /* Semánticos fijos */
  --green:  #10b981;
  --amber:  #f59e0b;
  --red:    #ef4444;
  --blue:   #3b82f6;
}
```

### Tailwind config (`tailwind.config.ts`) — ambas apps

```ts
theme: {
  extend: {
    colors: {
      primary: 'var(--brand-primary)',    // acento dinámico
      brand:   'var(--brand-primary)',    // alias
    },
    fontFamily: {
      sans:  ['DM Sans', 'sans-serif'],
      syne:  ['Syne', 'sans-serif'],
    },
  },
}
```

Esto permite usar `bg-primary`, `text-primary`, `border-primary`, `ring-primary` en cualquier componente y que responda automáticamente al color de marca del cliente.

### Modo oscuro / claro

```ts
// tailwind.config.ts
darkMode: 'class'
```

- Default: modo oscuro (clase `dark` presente en `<html>` por defecto).
- Toggle: guarda preferencia en `localStorage('theme')`, aplica/quita clase `dark` en `<html>`.
- En modo claro: fondos cambian a `#ffffff / #f8fafc / #f1f5f9`, texto a `#0f172a / #64748b`.
- El acento dinámico `--brand-primary` funciona igual en ambos modos.
- Clases duales en componentes: `bg-white dark:bg-[#080810]`, `text-slate-900 dark:text-[#f0f0f8]`.

---

## 4. Tematización dinámica por cliente

### 4.1 Base de datos — Prisma

Añadir campo al modelo `Business` en `packages/database`:

```prisma
model Business {
  // ... campos existentes
  accentColor  String?   // color HEX dominante extraído del logo, ej: "#e53935"
}
```

Migración: `npx prisma migrate dev --name add_accent_color_to_business`

### 4.2 Extracción del color — backend

Al subir un logo (endpoint existente de `mi-marca`):
1. Recibir imagen.
2. Usar `colorthief` (Node.js) para extraer el color dominante en RGB.
3. Convertir a HEX.
4. Guardar en `Business.accentColor`.

```ts
import ColorThief from 'colorthief';
const color = await ColorThief.getColor(imageBuffer);
const hex = `#${color.map(c => c.toString(16).padStart(2,'0')).join('')}`;
await prisma.business.update({ where: { id }, data: { accentColor: hex } });
```

### 4.3 Inyección en el frontend — ThemeProvider

En el `RootLayout` de `apps/admin` (auth pages) y en el layout de `apps/saas`:

```tsx
// ThemeProvider.tsx
'use client';
export function ThemeProvider({ accentColor, children }) {
  useEffect(() => {
    const color = accentColor || '#7c3aed';
    document.documentElement.style.setProperty('--brand-primary', color);
  }, [accentColor]);

  return <>{children}</>;
}
```

El layout lee `accentColor` del tenant via `GET /api/tenant/me` (ya existente) y lo pasa al provider.

### 4.4 Restricción visual — qué cambia y qué no

| Elemento | ¿Cambia con acento? |
|---|---|
| Fondo (`--bg`, `--surf`, `--surf2`) | **No** — siempre fijo |
| Botón primario (`bg-primary`) | Sí |
| Border de input en foco (`border-primary`) | Sí |
| Nav item activo (`bg-primary/10 text-primary`) | Sí |
| Badges de estado activo | Sí |
| Links y texto de acción | Sí |
| Stepper paso activo | Sí |
| Burbujas de chat usuario | Sí |
| Textos de cuerpo y headings | No |
| Superficies de cards | No |

---

## 5. Páginas a rediseñar en `apps/admin`

### 5.1 `app/login/page.tsx`
- Layout split (conservado): panel izquierdo oscuro con glow purple + stats, panel derecho formulario.
- Fondo: `#0e0e1a` (izquierdo), `#080810` (derecho).
- Logo mark: gradiente `#7c3aed → #9f67ff` (reemplaza cuadro naranja).
- Botón: `bg-primary` (era `bg-slate-900 hover:bg-[#ff5c35]`).
- Links: `text-primary`.

### 5.2 `app/register/page.tsx`
- Tarjeta centrada sobre `#080810`.
- Card background: `#0e0e1a`, borde `#2a2a40`.
- Stepper: activo en `bg-primary`, completado en verde.
- Plan-box: borde `rgba(var(--brand-primary), 0.2)`.
- Botones: `bg-primary`.

### 5.3 `app/onboarding/page.tsx`
- Ya usa fondo oscuro `#050505` — solo cambiar acento.
- Avatar AI: `bg-primary/20 border-primary/30 text-primary` (era orange).
- Burbujas usuario: `bg-primary` (era `bg-orange-500`).
- Botón enviar: `bg-primary` (era `bg-orange-500`).

### 5.4 `app/verify-email/page.tsx`
- Mismo patrón: fondo oscuro, icono, botón `bg-primary`.

---

## 6. Páginas de `apps/saas`

Todas las páginas movidas desde `apps/admin/app/(saas)/` más la nueva `login/`:

- **`login/page.tsx`** — login simple centrado (no split), dark purple, badge "SaaS Central".
- **`dashboard/page.tsx`** — métricas con acento purple, barras de MRR en purple, sidebar con badge.
- **`marcas/`, `facturacion/`, `logs/`, `api-keys/`, `ajustes/`** — mismo layout de sidebar, dark purple.

El Sidebar en `apps/saas` muestra el badge `SaaS Central` junto al logo para distinguirlo visualmente del panel de restaurante.

---

## 7. Middleware y autenticación

- `apps/admin/middleware.ts` — eliminar rutas `/dashboard`, `/marcas`, etc. que ya no existen aquí. Solo proteger rutas `(admin)` y redirigir SUPER_ADMIN a `saas.mrtpvrest.com`.
- `apps/saas` — nuevo `middleware.ts` que verifica `mb-role === SUPER_ADMIN`, si no redirige a `/login`.

---

## 8. Dependencias nuevas

| Package | Donde | Uso |
|---|---|---|
| `colorthief` | `apps/backend` | Extracción color dominante de logo |
| `colorthief` (types) | `apps/backend` | `@types/colorthief` |

No se añaden dependencias nuevas en las apps frontend — solo configuración de Tailwind y CSS variables.

---

## 9. Lo que NO cambia

- Toda la lógica de `apps/admin/app/(admin)/` — páginas del panel de restaurante.
- El backend (`apps/backend`) — solo se añade extracción de color en el endpoint de logo.
- `apps/landing` — sin cambios.
- `apps/tpv`, `apps/client` — sin cambios.
- La API y autenticación JWT existente.
