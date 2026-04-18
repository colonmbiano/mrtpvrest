# apps/saas Separation + Dark Purple Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer el panel SaaS (Super Admin) a `apps/saas` (puerto 3005, dominio `saas.mrtpvrest.com`), rediseñar todas las páginas públicas de `apps/admin` con el design system dark purple de la landing, y añadir tematización dinámica por cliente (color de acento del logo vía `colorthief`) y toggle light/dark.

**Architecture:** `apps/saas` es un Next.js app independiente que hereda el `dashboard.css` y los componentes del SaaS migrados desde `apps/admin/(saas)/`. `apps/admin` mantiene las rutas de restaurante pero sus páginas de auth se rediseñan con dark purple + CSS variable `--brand-primary` inyectada por un `ThemeProvider`. El color de acento se extrae en el backend sobre el buffer en memoria con `colorthief` antes de subir a Cloudinary, y se guarda en `Business.accentColor`.

**Tech Stack:** Next.js 14.2.35, React 18, Tailwind CSS 3.4.1, CSS custom properties (`data-theme` selector), colorthief, Prisma, Cloudinary, pnpm workspaces, Turborepo.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `pnpm-workspace.yaml` | Verificar que `apps/*` incluye `apps/saas` |
| `turbo.json` | Sin cambios (el pipeline `apps/*` ya incluye la nueva app) |
| `apps/saas/package.json` | Crear |
| `apps/saas/next.config.js` | Crear |
| `apps/saas/tsconfig.json` | Crear |
| `apps/saas/postcss.config.mjs` | Crear |
| `apps/saas/vercel.json` | Crear |
| `apps/saas/tailwind.config.ts` | Crear |
| `apps/saas/styles/dashboard.css` | Crear (copiado de admin + orange→purple) |
| `apps/saas/app/globals.css` | Crear |
| `apps/saas/app/layout.tsx` | Crear |
| `apps/saas/middleware.ts` | Crear |
| `apps/saas/lib/api.ts` | Crear (copiado de `apps/admin/lib/api.ts`) |
| `apps/saas/lib/auth.ts` | Crear (copiado de `apps/admin/lib/auth.ts`) |
| `apps/saas/components/ThemeProvider.tsx` | Crear (migrado) |
| `apps/saas/components/Sidebar.tsx` | Crear (migrado + badge SaaS Central) |
| `apps/saas/components/MrrChart.tsx` | Crear (migrado verbatim) |
| `apps/saas/app/login/page.tsx` | Crear (rediseño dark purple) |
| `apps/saas/app/(dashboard)/layout.tsx` | Crear |
| `apps/saas/app/(dashboard)/dashboard/page.tsx` | Migrar desde admin |
| `apps/saas/app/(dashboard)/marcas/page.tsx` | Migrar desde admin |
| `apps/saas/app/(dashboard)/facturacion/page.tsx` | Migrar desde admin |
| `apps/saas/app/(dashboard)/logs/page.tsx` | Migrar desde admin |
| `apps/saas/app/(dashboard)/api-keys/page.tsx` | Migrar desde admin |
| `apps/saas/app/(dashboard)/ajustes/page.tsx` | Migrar desde admin |
| `apps/admin/app/(saas)/` | Eliminar carpeta completa |
| `apps/admin/app/saas/` | Eliminar carpeta completa |
| `apps/admin/middleware.ts` | Modificar (remover SAAS_PATHS, redirigir SUPER_ADMIN a saas.mrtpvrest.com) |
| `apps/admin/tailwind.config.ts` | Modificar (añadir `primary`, `darkMode`) |
| `apps/admin/app/globals.css` | Modificar (añadir `--brand-primary`) |
| `apps/admin/app/layout.tsx` | Modificar (fuentes DM Sans + Syne, ThemeProvider) |
| `apps/admin/components/ThemeProvider.tsx` | Crear (inyecta `--brand-primary` + toggle dark/light) |
| `apps/admin/components/ThemeToggle.tsx` | Crear (botón toggle dark/light) |
| `apps/admin/app/login/page.tsx` | Rediseñar |
| `apps/admin/app/register/page.tsx` | Rediseñar |
| `apps/admin/app/onboarding/page.tsx` | Rediseñar (orange→primary) |
| `apps/admin/app/verify-email/page.tsx` | Rediseñar (orange→primary) |
| `packages/database/prisma/schema.prisma` | Añadir `accentColor String?` a `Business` |
| `apps/backend/package.json` | Añadir `colorthief` |
| `apps/backend/src/routes/tenant.routes.js` | Extraer color en endpoint de logo |

---

## Task 1: Scaffold apps/saas

**Files:**
- Create: `apps/saas/package.json`
- Create: `apps/saas/next.config.js`
- Create: `apps/saas/tsconfig.json`
- Create: `apps/saas/postcss.config.mjs`
- Create: `apps/saas/vercel.json`

- [ ] **Crear `apps/saas/package.json`**

```json
{
  "name": "@mrtpvrest/saas",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3005",
    "build": "next build",
    "start": "next start -p 3005",
    "lint": "next lint"
  },
  "dependencies": {
    "@mrtpvrest/database": "workspace:*",
    "axios": "^1.13.6",
    "chart.js": "^4.5.1",
    "next": "14.2.35",
    "react": "^18",
    "react-chartjs-2": "^5.3.1",
    "react-dom": "^18",
    "socket.io-client": "^4.8.3"
  },
  "devDependencies": {
    "@mrtpvrest/config": "workspace:*",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "eslint": "^8",
    "eslint-config-next": "14.2.35",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```

- [ ] **Crear `apps/saas/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Crear `apps/saas/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Crear `apps/saas/postcss.config.mjs`**

```js
const config = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
export default config;
```

- [ ] **Crear `apps/saas/vercel.json`**

```json
{ "framework": "nextjs" }
```

- [ ] **Instalar dependencias**

```bash
cd C:/Users/colon/Downloads/mrtpvrest
pnpm install
```

Verificar que no haya errores de resolución de workspace.

- [ ] **Commit**

```bash
git add apps/saas/package.json apps/saas/next.config.js apps/saas/tsconfig.json apps/saas/postcss.config.mjs apps/saas/vercel.json
git commit -m "feat(saas): scaffold nueva app Next.js en apps/saas"
```

---

## Task 2: Design system de apps/saas (CSS + Tailwind)

**Files:**
- Create: `apps/saas/styles/dashboard.css`
- Create: `apps/saas/tailwind.config.ts`
- Create: `apps/saas/app/globals.css`

- [ ] **Crear `apps/saas/styles/dashboard.css`**

Copiar `apps/admin/styles/dashboard.css` completo, luego reemplazar todas las referencias a naranja por purple.

En el bloque `.d {}` (dark theme), reemplazar:
```css
/* ANTES */
--orange: #ff6b35;
--orange2: #ff8c5a;
--orange-dim: rgba(255, 107, 53, 0.12);
```
```css
/* DESPUÉS */
--orange: #7c3aed;
--orange2: #9f67ff;
--orange-dim: rgba(124, 58, 237, 0.12);
```

En el bloque `.l {}` (light theme), reemplazar:
```css
/* ANTES */
--orange: #e85d28;
--orange2: #d04f1e;
--orange-dim: rgba(232, 93, 40, 0.1);
```
```css
/* DESPUÉS */
--orange: #7c3aed;
--orange2: #6d28d9;
--orange-dim: rgba(124, 58, 237, 0.1);
```

- [ ] **Crear `apps/saas/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: "var(--orange)",
        "primary-2": "var(--orange2)",
        "primary-dim": "var(--orange-dim)",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        syne: ["Syne", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Crear `apps/saas/app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Commit**

```bash
git add apps/saas/styles/ apps/saas/tailwind.config.ts apps/saas/app/globals.css
git commit -m "feat(saas): design system CSS dark purple"
```

---

## Task 3: apps/saas layout, middleware y lib

**Files:**
- Create: `apps/saas/app/layout.tsx`
- Create: `apps/saas/middleware.ts`
- Create: `apps/saas/lib/api.ts`
- Create: `apps/saas/lib/auth.ts`

- [ ] **Crear `apps/saas/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Central — MRTPVREST",
  description: "Panel de control global",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('saas-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Crear `apps/saas/middleware.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/_next", "/favicon", "/api", "/.well-known"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const role = req.cookies.get("mb-role")?.value ?? null;
  if (!role || role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|\\.well-known).*)"],
};
```

- [ ] **Crear `apps/saas/lib/api.ts`**

Copiar `apps/admin/lib/api.ts` verbatim. El archivo usa `axios` con `NEXT_PUBLIC_API_URL` — no requiere cambios.

- [ ] **Crear `apps/saas/lib/auth.ts`**

Copiar `apps/admin/lib/auth.ts` verbatim (contiene la función `logout`).

- [ ] **Commit**

```bash
git add apps/saas/app/layout.tsx apps/saas/middleware.ts apps/saas/lib/
git commit -m "feat(saas): layout, middleware y lib"
```

---

## Task 4: Migrar componentes SaaS (ThemeProvider, Sidebar, MrrChart)

**Files:**
- Create: `apps/saas/components/ThemeProvider.tsx`
- Create: `apps/saas/components/Sidebar.tsx`
- Create: `apps/saas/components/MrrChart.tsx`

- [ ] **Crear `apps/saas/components/ThemeProvider.tsx`**

Copiar `apps/admin/app/(saas)/components/ThemeProvider.tsx` con un cambio: localStorage key `"saas-theme"` (en lugar de `"db-theme"`).

```tsx
"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("saas-theme") as Theme | null;
    if (saved) {
      setThemeState(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("saas-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={theme === "dark" ? "d" : "l"} style={{ minHeight: "100vh" }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

- [ ] **Crear `apps/saas/components/Sidebar.tsx`**

Copiar `apps/admin/app/(saas)/components/Sidebar.tsx` con dos cambios:
1. Añadir badge "SaaS Central" debajo del logo.
2. Corregir el import de `logout` a `@/lib/auth`.

En el bloque del logo (`.db-logo`), añadir badge después de `.db-logo-mark`:
```tsx
<div className="db-logo">
  <div className="db-logo-mark">MR<span>TPV</span>REST</div>
  <div className="db-logo-sub">GLOBAL DASHBOARD</div>
  {/* Badge SaaS Central */}
  <div style={{
    marginTop: 6,
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    background: 'var(--orange-dim)',
    color: 'var(--orange)',
    border: '1px solid var(--orange-dim)',
  }}>SaaS Central</div>
</div>
```

- [ ] **Crear `apps/saas/components/MrrChart.tsx`**

Copiar `apps/admin/app/(saas)/components/MrrChart.tsx` verbatim. Solo actualizar el import de `api`:
```tsx
import api from "@/lib/api";
```

- [ ] **Commit**

```bash
git add apps/saas/components/
git commit -m "feat(saas): migrar ThemeProvider, Sidebar y MrrChart"
```

---

## Task 5: apps/saas — login page (dark purple)

**Files:**
- Create: `apps/saas/app/login/page.tsx`

- [ ] **Crear `apps/saas/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function SaaSLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      if (data.user.role !== "SUPER_ADMIN") {
        setError("Acceso denegado: solo para Super Administradores.");
        setLoading(false);
        return;
      }
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.removeItem("restaurantId");
      localStorage.removeItem("locationId");
      document.cookie = `mb-role=SUPER_ADMIN; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Error de conexión con la central");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
         style={{ background: "var(--bg, #080810)", fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12
          }}>
            <div style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
              borderRadius: 10, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "'Syne', sans-serif",
              fontWeight: 800, fontSize: 11, color: "#fff"
            }}>MR</div>
            <span style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 22, color: "var(--text, #f0f0f8)", letterSpacing: -1
            }}>
              MRTPV<span style={{ color: "#9f67ff" }}>REST</span>
            </span>
          </div>
          <div style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
            textTransform: "uppercase",
            background: "rgba(124,58,237,0.15)", color: "#9f67ff",
            border: "1px solid rgba(124,58,237,0.3)"
          }}>SaaS Central</div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surf, #0e0e1a)",
          border: "1px solid var(--border, #1e1e30)",
          borderRadius: 24, padding: "36px 32px",
          boxShadow: "0 0 40px rgba(124,58,237,0.07)"
        }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 20, color: "var(--text, #f0f0f8)",
            marginBottom: 4, letterSpacing: -0.5
          }}>Acceso Central</h2>
          <p style={{ fontSize: 12, color: "var(--muted, #6b6b90)", marginBottom: 24 }}>
            Solo Super Administradores
          </p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "var(--muted, #6b6b90)", textTransform: "uppercase",
                letterSpacing: "0.8px", marginBottom: 6
              }}>Correo</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@mrtpvrest.com" required
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "var(--surf2, #13131f)",
                  border: "1px solid var(--border2, #2a2a40)",
                  borderRadius: 10, fontSize: 13,
                  color: "var(--text, #f0f0f8)", outline: "none"
                }}
              />
            </div>
            <div>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "var(--muted, #6b6b90)", textTransform: "uppercase",
                letterSpacing: "0.8px", marginBottom: 6
              }}>Contraseña</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "var(--surf2, #13131f)",
                  border: "1px solid var(--border2, #2a2a40)",
                  borderRadius: 10, fontSize: 13,
                  color: "var(--text, #f0f0f8)", outline: "none"
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: "rgba(239,68,68,0.08)", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.2)", textAlign: "center"
              }}>{error}</div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: "100%", padding: "13px",
                background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
                border: "none", borderRadius: 12,
                fontFamily: "'Syne', sans-serif", fontWeight: 800,
                fontSize: 13, color: "#fff", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
                transition: "all .2s"
              }}
            >
              {loading ? "Verificando..." : "Ingresar a la Central →"}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: "center", marginTop: 20,
          fontSize: 10, color: "var(--muted2, #4a4a6a)",
          fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px"
        }}>
          Sistema Protegido · © 2026 MRTPVREST
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Verificar que corre**

```bash
cd C:/Users/colon/Downloads/mrtpvrest
pnpm --filter @mrtpvrest/saas dev
```

Abrir `http://localhost:3005/login`. Debe mostrar la página con fondo oscuro y acento purple. No debe redirigir en loop.

- [ ] **Commit**

```bash
git add apps/saas/app/login/
git commit -m "feat(saas): login page dark purple"
```

---

## Task 6: apps/saas — layout del dashboard + migrar páginas internas

**Files:**
- Create: `apps/saas/app/(dashboard)/layout.tsx`
- Create: `apps/saas/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/saas/app/(dashboard)/marcas/page.tsx`
- Create: `apps/saas/app/(dashboard)/facturacion/page.tsx`
- Create: `apps/saas/app/(dashboard)/logs/page.tsx`
- Create: `apps/saas/app/(dashboard)/api-keys/page.tsx`
- Create: `apps/saas/app/(dashboard)/ajustes/page.tsx`

- [ ] **Crear `apps/saas/app/(dashboard)/layout.tsx`**

```tsx
import "../../styles/dashboard.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="db-shell">
        <Sidebar />
        <main className="db-main">{children}</main>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Migrar `dashboard/page.tsx`**

Copiar `apps/admin/app/(saas)/dashboard/page.tsx` verbatim. Actualizar imports:
- `import { useTheme } from "../components/ThemeProvider"` → `import { useTheme } from "@/components/ThemeProvider"`
- `import MrrChart from "../components/MrrChart"` → `import MrrChart from "@/components/MrrChart"`
- `import api from "@/lib/api"` — queda igual.

- [ ] **Migrar páginas restantes**

Para cada una de: `marcas`, `facturacion`, `logs`, `api-keys`, `ajustes`:

Copiar `apps/admin/app/(saas)/<nombre>/page.tsx` a `apps/saas/app/(dashboard)/<nombre>/page.tsx`.
Actualizar cualquier import relativo (`../components/...`) a path absoluto (`@/components/...`).

- [ ] **Verificar navegación**

```bash
pnpm --filter @mrtpvrest/saas dev
```

Ir a `http://localhost:3005/login`, iniciar sesión con cuenta SUPER_ADMIN, verificar que redirige a `/dashboard` y que el Sidebar muestra el badge "SaaS Central".

- [ ] **Commit**

```bash
git add apps/saas/app/
git commit -m "feat(saas): migrar todas las páginas del dashboard SaaS"
```

---

## Task 7: Limpiar apps/admin — eliminar rutas SaaS y actualizar middleware

**Files:**
- Delete: `apps/admin/app/(saas)/`
- Delete: `apps/admin/app/saas/`
- Modify: `apps/admin/middleware.ts`

- [ ] **Eliminar carpetas**

```bash
rm -rf "C:/Users/colon/Downloads/mrtpvrest/apps/admin/app/(saas)"
rm -rf "C:/Users/colon/Downloads/mrtpvrest/apps/admin/app/saas"
```

- [ ] **Actualizar `apps/admin/middleware.ts`**

Reemplazar el contenido completo:

```ts
import { NextRequest, NextResponse } from "next/server";

// Admin (ADMIN/KITCHEN) protected paths — prefix match
const ADMIN_PREFIX = "/admin";

// Public paths — always allowed
const PUBLIC_PATHS = ["/login", "/register", "/verify-email", "/onboarding", "/_next", "/favicon", "/logo", "/api", "/.well-known"];

function isAdminPath(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(ADMIN_PREFIX + "/");
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith("/kds") || pathname.startsWith("/repartidor")) return NextResponse.next();

  const role = req.cookies.get("mb-role")?.value ?? null;

  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // SUPER_ADMIN ya no tiene panel aquí → redirigir a saas app
  if (role === "SUPER_ADMIN") {
    const saasUrl = process.env.NEXT_PUBLIC_SAAS_URL || "http://localhost:3005";
    return NextResponse.redirect(new URL("/dashboard", saasUrl));
  }

  // ADMIN / KITCHEN: solo acceden a rutas /admin
  if (role === "ADMIN" || role === "KITCHEN") {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|manifest|\\.well-known).*)",
  ],
};
```

- [ ] **Añadir variable de entorno**

En `apps/admin/.env.local` (crear si no existe):
```
NEXT_PUBLIC_SAAS_URL=https://saas.mrtpvrest.com
```

En `apps/admin/.env.local.example` añadir la misma variable.

- [ ] **Verificar que apps/admin compila sin errores**

```bash
pnpm --filter @mrtpvrest/admin build
```

Esperado: sin errores de import hacia `(saas)/`.

- [ ] **Commit**

```bash
git add apps/admin/middleware.ts apps/admin/.env.local.example
git commit -m "feat(admin): remover rutas SaaS, redirigir SUPER_ADMIN a apps/saas"
```

---

## Task 8: Design system en apps/admin (Tailwind + CSS vars)

**Files:**
- Modify: `apps/admin/tailwind.config.ts`
- Modify: `apps/admin/app/globals.css`

- [ ] **Actualizar `apps/admin/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--text)",
        surface: "var(--surf)",
        "surface-2": "var(--surf2)",
        border: "var(--border)",
        "border-2": "var(--border2)",
        muted: "var(--muted)",
        "muted-2": "var(--muted2)",
        primary: "var(--brand-primary)",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        syne: ["Syne", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Actualizar `apps/admin/app/globals.css`**

Reemplazar el bloque `:root, [data-theme="dark"]` existente añadiendo `--brand-primary`. Dejar intacto el resto del archivo (light theme, componentes, etc.).

```css
@import url("https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap");
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── TEMA OSCURO (default) ── */
:root,
[data-theme="dark"] {
  --bg:            #080810;
  --surf:          #0e0e1a;
  --surf2:         #13131f;
  --border:        #1e1e30;
  --border2:       #2a2a40;
  --text:          #f0f0f8;
  --muted:         #6b6b90;
  --muted2:        #4a4a6a;

  /* Acento dinámico — sobreescrito por ThemeProvider con color del logo */
  --brand-primary:   #7c3aed;
  --brand-secondary: #9f67ff;

  /* Semánticos */
  --green:  #10b981;
  --amber:  #f59e0b;
  --red:    #ef4444;
  --blue:   #3b82f6;
}

/* ── TEMA CLARO ── */
[data-theme="light"] {
  --bg:            #ffffff;
  --surf:          #f8fafc;
  --surf2:         #f1f5f9;
  --border:        #e2e8f0;
  --border2:       #cbd5e1;
  --text:          #0f172a;
  --muted:         #64748b;
  --muted2:        #94a3b8;

  --brand-primary:   #7c3aed;
  --brand-secondary: #6d28d9;

  --green:  #16a34a;
  --amber:  #d97706;
  --red:    #dc2626;
  --blue:   #2563eb;
}
```

- [ ] **Verificar que Tailwind compila**

```bash
pnpm --filter @mrtpvrest/admin dev
```

No debe haber errores de CSS.

- [ ] **Commit**

```bash
git add apps/admin/tailwind.config.ts apps/admin/app/globals.css
git commit -m "feat(admin): design system dark purple con brand-primary dinámico"
```

---

## Task 9: ThemeProvider + ThemeToggle para apps/admin

**Files:**
- Create: `apps/admin/components/ThemeProvider.tsx`
- Create: `apps/admin/components/ThemeToggle.tsx`
- Modify: `apps/admin/app/layout.tsx`

- [ ] **Crear `apps/admin/components/ThemeProvider.tsx`**

```tsx
"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accentColor: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  accentColor: "#7c3aed",
});

interface Props {
  children: ReactNode;
  accentColor?: string; // recibido del layout que lo lee de la API
}

export function ThemeProvider({ children, accentColor = "#7c3aed" }: Props) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Restore saved theme
  useEffect(() => {
    const saved = localStorage.getItem("mb-theme") as Theme | null;
    if (saved) {
      setThemeState(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  // Inject accent color CSS var whenever it changes
  useEffect(() => {
    document.documentElement.style.setProperty("--brand-primary", accentColor);
  }, [accentColor]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("mb-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

- [ ] **Crear `apps/admin/components/ThemeToggle.tsx`**

```tsx
"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Cambiar tema"
      style={{
        width: 34, height: 34, borderRadius: 8,
        background: "var(--surf2)", border: "1px solid var(--border2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--muted)", transition: "all .15s",
        fontSize: 15,
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
```

- [ ] **Actualizar `apps/admin/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Panel Admin — Restaurante",
  description: "Sistema de gestión de pedidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('mb-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
      </head>
      <body>
        {/* accentColor se pasa como prop desde páginas que ya leyeron el tenant */}
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

> **Nota:** El `accentColor` real del tenant se inyecta en las páginas auth una vez que el usuario está logueado. En páginas públicas (login, register) usa el fallback `#7c3aed`. Para páginas autenticadas, el layout de `(admin)` leerá `accentColor` de localStorage (guardado al login) y lo pasará al contexto.

- [ ] **Commit**

```bash
git add apps/admin/components/ apps/admin/app/layout.tsx
git commit -m "feat(admin): ThemeProvider con brand-primary dinámico + ThemeToggle"
```

---

## Task 10: Rediseñar apps/admin — Login

**Files:**
- Modify: `apps/admin/app/login/page.tsx`

- [ ] **Reemplazar el contenido completo de `apps/admin/app/login/page.tsx`**

Mantener toda la lógica (estados, handlers, `handleResend`, `handleSubmit`). Solo cambiar el JSX de retorno:

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending]   = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) router.push("/dashboard");
  }, []);

  const handleResend = async () => {
    setResending(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setResendDone(true);
      setTimeout(() => setResendDone(false), 5000);
    } catch { /* silencioso */ }
    setResending(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("accessToken",  data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user",         JSON.stringify(data.user));
      if (data.user?.restaurantId) localStorage.setItem("restaurantId", data.user.restaurantId);
      document.cookie = `mb-role=${data.user.role}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      if (data.user?.role === "SUPER_ADMIN") {
        router.push("/dashboard");
        return;
      }

      const tenantRes = await api.get("/api/tenant/me");
      const tenant = tenantRes.data;

      // Guardar accentColor para ThemeProvider
      if (tenant.accentColor) {
        localStorage.setItem("mb-accent", tenant.accentColor);
      }

      if (!tenant.emailVerifiedAt) {
        setPendingEmail(data.user.email);
        return;
      }

      router.push("/admin");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  // Estilos reutilizables
  const inputStyle = {
    width: "100%", padding: "11px 14px",
    border: "1px solid var(--border2)",
    borderRadius: 10, background: "var(--surf)",
    color: "var(--text)", fontSize: 13, outline: "none",
    fontFamily: "'DM Sans', sans-serif",
  } as const;

  return (
    <>
      {/* Modal email pendiente */}
      {pendingEmail && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(8,8,16,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, zIndex: 50,
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            background: "var(--surf)", border: "1px solid var(--border2)",
            borderRadius: 24, padding: 40, textAlign: "center",
            boxShadow: "0 0 60px rgba(0,0,0,0.5)"
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, margin: "0 auto 20px"
            }}>✉️</div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "var(--text)", marginBottom: 8 }}>
              Verifica tu email
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Enviamos un enlace a <strong style={{ color: "var(--text)" }}>{pendingEmail}</strong>
            </p>
            <button
              onClick={handleResend} disabled={resending || resendDone}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 10, fontWeight: 700, fontSize: 13,
                cursor: "pointer", marginBottom: 12, border: "none",
                background: resendDone ? "rgba(16,185,129,0.1)" : "var(--brand-primary)",
                color: resendDone ? "#10b981" : "#fff",
                opacity: resending ? 0.6 : 1,
              }}
            >
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "Reenviar correo"}
            </button>
            <button
              onClick={() => { setPendingEmail(""); localStorage.removeItem("accessToken"); document.cookie = "mb-role=; path=/; max-age=0"; }}
              style={{ background: "none", border: "none", fontSize: 12, color: "var(--muted)", cursor: "pointer", textDecoration: "underline" }}
            >Volver al login</button>
          </div>
        </div>
      )}

      {/* Layout split */}
      <div style={{
        minHeight: "100vh", display: "grid",
        gridTemplateColumns: "1.3fr 1fr",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Panel izquierdo */}
        <div style={{
          background: "var(--surf)", borderRight: "1px solid var(--border)",
          padding: "48px 48px", display: "flex", flexDirection: "column",
          justifyContent: "space-between", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: "-20%", left: "-20%",
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48, textDecoration: "none" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, color: "#fff"
              }}>MR</div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--text)", letterSpacing: -0.5 }}>
                MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span>
              </span>
            </Link>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 36, color: "var(--text)", lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 16 }}>
              Gestiona tu restaurante{" "}
              <em style={{ fontStyle: "normal", color: "var(--brand-primary)" }}>sin complicaciones.</em>
            </h1>
            <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, maxWidth: 340 }}>
              TPV, cocina, delivery y tienda online. Todo sincronizado en tiempo real para restaurantes en LATAM.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, borderTop: "1px solid var(--border)", paddingTop: 24, position: "relative", zIndex: 1 }}>
            {[{ n: "+500", l: "Restaurantes activos" }, { n: "$29", l: "Desde por mes" }, { n: "15d", l: "Prueba gratis" }].map(s => (
              <div key={s.n}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho (formulario) */}
        <div style={{ background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 40px" }}>
          <div style={{ width: "100%", maxWidth: 380 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: "var(--text)", marginBottom: 4, letterSpacing: -0.5 }}>Bienvenido de nuevo</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 28 }}>Ingresa a tu panel de administración</p>

            {error && (
              <div style={{
                marginBottom: 20, padding: "10px 14px", borderRadius: 10,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444", fontSize: 13, fontWeight: 700
              }}>{error}</div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Correo electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@restaurante.com" required autoComplete="email" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Contraseña</label>
                <div style={{ position: "relative" }}>
                  <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={{ ...inputStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={{
                width: "100%", padding: "13px",
                background: "var(--brand-primary)",
                border: "none", borderRadius: 10,
                fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13,
                color: "#fff", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 20px rgba(124,58,237,0.25)",
                transition: "all .2s", marginTop: 4,
              }}>
                {loading ? "Verificando..." : "Entrar al panel →"}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.8px" }}>¿nuevo aquí?</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Link href="/register" style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-primary)", textDecoration: "none" }}>
                Crear cuenta gratis — 15 días sin tarjeta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Verificar visualmente**

```bash
pnpm --filter @mrtpvrest/admin dev
```

Abrir `http://localhost:3002/login`. Debe mostrar layout split, fondo oscuro, acento purple, sin naranja.

- [ ] **Commit**

```bash
git add apps/admin/app/login/page.tsx
git commit -m "feat(admin): redesign login page dark purple"
```

---

## Task 11: Rediseñar apps/admin — Register

**Files:**
- Modify: `apps/admin/app/register/page.tsx`

- [ ] **Reemplazar el JSX de la página, mantener toda la lógica**

Los estados y handlers (`canNext1`, `canNext2`, `handleResend`, `handleSubmit`) no cambian. Solo el JSX devuelto. Reemplazar el `return` completo:

```tsx
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Brand */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#9f67ff)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 10, color: "#fff" }}>MR</div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "var(--text)", letterSpacing: -0.5 }}>
            MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span>
          </span>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>EMPIEZA TU PRUEBA DE 15 DÍAS</p>
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 480, background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 20, padding: "36px 40px", boxShadow: "0 0 40px rgba(124,58,237,0.06)" }}>

        {/* Stepper */}
        {step < 3 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 32 }}>
            {[{ n: 1, label: "TU RESTAURANTE" }, { n: 2, label: "TU CUENTA" }].map(({ n, label }, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 12px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: step === n ? "rgba(124,58,237,0.12)" : step > n ? "rgba(16,185,129,0.1)" : "var(--surf2)",
                  color: step === n ? "var(--brand-primary)" : step > n ? "#10b981" : "var(--muted)",
                  border: `1px solid ${step === n ? "rgba(124,58,237,0.25)" : step > n ? "rgba(16,185,129,0.25)" : "var(--border2)"}`,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800,
                    background: step === n ? "var(--brand-primary)" : step > n ? "#10b981" : "var(--border2)",
                    color: step >= n ? "#fff" : "var(--muted)",
                  }}>
                    {step > n ? "✓" : n}
                  </div>
                  {label}
                </div>
                {i < 1 && <div style={{ width: 24, height: 2, borderRadius: 2, background: step > n ? "#10b981" : "var(--border2)" }} />}
              </div>
            ))}
          </div>
        )}

        {/* Paso 1 */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 4 }}>Tu restaurante</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Cuéntanos sobre tu negocio para empezar.</p>
            {[{ label: "Nombre del negocio", value: restaurantName, set: setRestaurantName, ph: "Ej: Tacos El Gordo" },
              { label: "Tu nombre completo", value: ownerName, set: setOwnerName, ph: "Ej: Juan García" }].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{f.label} <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  style={{ width: "100%", padding: "11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
              </div>
            ))}
            <div style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)", borderRadius: 12, padding: "12px 16px", marginTop: 16 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Plan incluido</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}><span style={{ color: "var(--brand-primary)" }}>15 días gratis</span> · Plan Básico</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>Sin tarjeta de crédito requerida</p>
            </div>
          </div>
        )}

        {/* Paso 2 */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 4 }}>Crea tu cuenta</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Serás el administrador de <strong style={{ color: "var(--text)" }}>{restaurantName}</strong>.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>Correo electrónico <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@mirestaurante.com"
                style={{ width: "100%", padding: "11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px" }}>Contraseña <span style={{ color: "#ef4444" }}>*</span></label>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Mínimo 8 caracteres</span>
              </div>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" }} />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Mínimo 8 caracteres</p>}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
              <div onClick={() => setTerms(t => !t)} style={{
                marginTop: 2, width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1px solid ${terms ? "var(--brand-primary)" : "var(--border2)"}`,
                background: terms ? "var(--brand-primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {terms && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Acepto los <a href="#" style={{ color: "var(--brand-primary)" }}>términos</a> y la <a href="#" style={{ color: "var(--brand-primary)" }}>política de privacidad</a>
              </span>
            </label>
          </div>
        )}

        {/* Paso 3 — email enviado */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 20px" }}>✉️</div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 8 }}>Revisa tu email</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>
              Enviamos un enlace a <br /><strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>
            {emailDomain && (
              <a href={`https://${emailDomain}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", padding: "10px 24px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "var(--text)", textDecoration: "none", marginBottom: 24 }}>
                Abrir {emailDomain} →
              </a>
            )}
            <div style={{ background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 12, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Qué sigue</p>
              {["Haz clic en el botón del email", "Tu cuenta queda activada", "Configura tu negocio"].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(124,58,237,0.12)", color: "var(--brand-primary)", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</div>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={handleResend} disabled={resending || resendDone}
              style={{ width: "100%", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "1px solid var(--border2)", background: "var(--surf2)", color: "var(--muted)", opacity: (resending || resendDone) ? 0.6 : 1 }}>
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "No llegó el correo — Reenviar"}
            </button>
          </div>
        )}

        {/* Error global */}
        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13, fontWeight: 700 }}>⚠️ {error}</div>
        )}

        {/* Botones de navegación */}
        {step < 3 && (
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            {step > 1 && (
              <button onClick={() => { setStep(s => s - 1); setError(""); }}
                style={{ padding: "12px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", background: "var(--surf2)", border: "1px solid var(--border2)", color: "var(--muted)" }}>
                ← Atrás
              </button>
            )}
            {step < 2 ? (
              <button disabled={!canNext1} onClick={() => { setStep(2); setError(""); }}
                style={{ flex: 1, padding: "13px", borderRadius: 10, fontWeight: 800, fontSize: 13, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: canNext1 ? "pointer" : "not-allowed", opacity: canNext1 ? 1 : 0.5, boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
                CONTINUAR →
              </button>
            ) : (
              <button disabled={!canNext2 || loading} onClick={handleSubmit}
                style={{ flex: 1, padding: "13px", borderRadius: 10, fontWeight: 800, fontSize: 13, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: (canNext2 && !loading) ? "pointer" : "not-allowed", opacity: (canNext2 && !loading) ? 1 : 0.5, boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
                {loading ? "Creando cuenta..." : "EMPEZAR GRATIS →"}
              </button>
            )}
          </div>
        )}

        {/* Footer link */}
        {step < 3 && (
          <div style={{ marginTop: 20, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>¿Ya tienes cuenta?{" "}
              <Link href="/login" style={{ color: "var(--brand-primary)", fontWeight: 700, textDecoration: "none" }}>Iniciar sesión</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
```

- [ ] **Verificar visualmente** — `http://localhost:3002/register`

Debe mostrar tarjeta centrada, fondo oscuro, stepper purple.

- [ ] **Commit**

```bash
git add apps/admin/app/register/page.tsx
git commit -m "feat(admin): redesign register page dark purple"
```

---

## Task 12: Rediseñar apps/admin — Onboarding y verify-email

**Files:**
- Modify: `apps/admin/app/onboarding/page.tsx`
- Modify: `apps/admin/app/verify-email/page.tsx`

- [ ] **Actualizar onboarding — reemplazar referencias a orange-500 con brand-primary**

En `apps/admin/app/onboarding/page.tsx`, hacer estas sustituciones de forma literal en todas las clases Tailwind:

| Antes | Después |
|---|---|
| `bg-orange-500` | `bg-[var(--brand-primary)]` |
| `border-orange-500` | `border-[var(--brand-primary)]` |
| `text-orange-500` | `text-[var(--brand-primary)]` |
| `bg-orange-500/20` | `bg-[var(--brand-primary)]/20` |
| `border-orange-500/30` | `border-[var(--brand-primary)]/30` |
| `focus:border-orange-500/50` | `focus:border-[var(--brand-primary)]/50` |
| `focus:bg-white/[0.06]` | sin cambio |

También cambiar el fondo del loading inicial de `bg-[#050505]` a `bg-[var(--bg)]`.

- [ ] **Actualizar verify-email — mismas sustituciones**

En `apps/admin/app/verify-email/page.tsx`:

| Antes | Después |
|---|---|
| `bg-orange-500` | `bg-[var(--brand-primary)]` |
| `border-orange-500/30` | `border-[var(--brand-primary)]/30` |
| `text-orange-500` | `text-[var(--brand-primary)]` |
| `bg-[#050505]` | `style={{ background: "var(--bg)" }}` en el wrapper |

El título `MRTPV<span className="text-orange-500">REST</span>` cambia a `MRTPV<span style={{color:"var(--brand-primary)"}}>REST</span>`.

- [ ] **Verificar visualmente**

```bash
# Abrir http://localhost:3002/onboarding (requiere estar logueado con email verificado)
# Para verify-email, probar con un token inválido: http://localhost:3002/verify-email?token=test
```

No debe aparecer ningún naranja.

- [ ] **Commit**

```bash
git add apps/admin/app/onboarding/page.tsx apps/admin/app/verify-email/page.tsx
git commit -m "feat(admin): redesign onboarding y verify-email, orange→brand-primary"
```

---

## Task 13: Prisma — añadir accentColor a Business

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Leer el schema actual**

```bash
cat packages/database/prisma/schema.prisma | grep -A 20 "model Business"
```

Ubicar el modelo `Business` y añadir el campo `accentColor`:

```prisma
model Business {
  // ... campos existentes ...
  accentColor  String?   // HEX extraído del logo con colorthief, ej: "#7c3aed"
  // ... resto de campos ...
}
```

- [ ] **Generar la migración**

```bash
cd packages/database
npx prisma migrate dev --name add_accent_color_to_business
```

Esperado: migración creada en `prisma/migrations/`, cliente Prisma regenerado.

- [ ] **Verificar que el tipo está disponible**

```bash
node -e "const {PrismaClient}=require('./src/generated/client');console.log('OK')"
```

Esperado: `OK` (sin error de tipos).

- [ ] **Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(db): añadir accentColor a modelo Business"
```

---

## Task 14: Backend — extracción de color con colorthief

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/src/routes/tenant.routes.js`

- [ ] **Añadir colorthief a `apps/backend/package.json`**

```bash
cd apps/backend
pnpm add colorthief
```

Verificar que aparece en `dependencies` de `apps/backend/package.json`.

- [ ] **Escribir test unitario antes de implementar**

Crear `apps/backend/src/services/__tests__/extractColor.test.js`:

```js
const { extractAccentColor } = require('../extractColor.service');
const path = require('path');
const fs = require('fs');

describe('extractAccentColor', () => {
  it('devuelve un HEX válido para un PNG de muestra', async () => {
    // Crear un PNG de 1x1 pixel rojo para test
    // Buffer de un PNG 1x1 rojo mínimo
    const redPixelPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c49444154789c6260f8cfc00000000200013e0175400000000049454e44ae426082',
      'hex'
    );
    const color = await extractAccentColor(redPixelPng);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color).toBe('#ff0000');
  });

  it('devuelve #7c3aed (fallback) si el buffer es inválido', async () => {
    const color = await extractAccentColor(Buffer.from('invalid'));
    expect(color).toBe('#7c3aed');
  });
});
```

- [ ] **Correr el test — debe fallar**

```bash
cd apps/backend
npx jest src/services/__tests__/extractColor.test.js
```

Esperado: `FAIL` — `Cannot find module '../extractColor.service'`

- [ ] **Crear `apps/backend/src/services/extractColor.service.js`**

```js
const ColorThief = require('colorthief');

/**
 * Extrae el color dominante de un buffer de imagen.
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>} HEX color, ej: "#7c3aed". Fallback: "#7c3aed".
 */
async function extractAccentColor(imageBuffer) {
  try {
    const rgb = await ColorThief.getColor(imageBuffer);
    return '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
  } catch {
    return '#7c3aed';
  }
}

module.exports = { extractAccentColor };
```

- [ ] **Correr el test — debe pasar**

```bash
npx jest src/services/__tests__/extractColor.test.js
```

Esperado: `PASS`

- [ ] **Integrar en `apps/backend/src/routes/tenant.routes.js`**

Buscar el endpoint que recibe el logo del negocio (buscar `logoUrl` o `logo` en el archivo). Añadir la extracción después de recibir el buffer y antes de subir a Cloudinary:

```js
const { extractAccentColor } = require('../services/extractColor.service');
const { uploadImage } = require('../services/cloudinary.service');

// Dentro del handler del endpoint de actualización de logo:
// 1. Extraer color del buffer en memoria
const accentColor = await extractAccentColor(req.file.buffer);

// 2. Subir a Cloudinary (ya existente)
const logoUrl = await uploadImage(req.file.buffer, 'logos');

// 3. Guardar ambos en BD
await prisma.business.update({
  where: { id: businessId },
  data: { logoUrl, accentColor },
});

res.json({ logoUrl, accentColor });
```

> **Nota:** Lee el endpoint actual en `tenant.routes.js` para saber el nombre exacto de la variable `businessId` y la llamada a `prisma` existente antes de editar.

- [ ] **Commit**

```bash
git add apps/backend/package.json apps/backend/src/services/extractColor.service.js apps/backend/src/services/__tests__/ apps/backend/src/routes/tenant.routes.js
git commit -m "feat(backend): extracción de accentColor con colorthief en upload de logo"
```

---

## Task 15: Conectar accentColor al frontend de apps/admin

**Files:**
- Modify: `apps/admin/app/(admin)/layout.tsx` (o el layout que envuelve las páginas autenticadas)

- [ ] **Leer el layout autenticado**

```bash
cat "apps/admin/app/(admin)/layout.tsx"
```

- [ ] **Añadir lectura de accentColor desde localStorage y pasarlo al ThemeProvider**

El `accentColor` se guarda en `localStorage('mb-accent')` durante el login (ya añadido en Task 10). El layout autenticado debe leerlo y pasarlo al ThemeProvider.

Envolver el contenido con un client component `AccentInjector` que lea `mb-accent` de localStorage y lo inyecte:

Crear `apps/admin/components/AccentInjector.tsx`:

```tsx
"use client";
import { useEffect } from "react";

export function AccentInjector() {
  useEffect(() => {
    const accent = localStorage.getItem("mb-accent");
    if (accent) {
      document.documentElement.style.setProperty("--brand-primary", accent);
    }
  }, []);
  return null;
}
```

En `apps/admin/app/(admin)/layout.tsx`, añadir `<AccentInjector />` al inicio del children:

```tsx
import { AccentInjector } from "@/components/AccentInjector";

export default function AdminLayout({ children }) {
  return (
    <>
      <AccentInjector />
      {/* ... layout existente ... */}
    </>
  );
}
```

- [ ] **Verificar**

Subir un logo rojo en "Mi Marca". Cerrar sesión e iniciar sesión de nuevo. El acento del panel debe cambiar a rojo. Verificar en DevTools: `document.documentElement.style.getPropertyValue('--brand-primary')` debe retornar el HEX del logo.

- [ ] **Commit**

```bash
git add apps/admin/components/AccentInjector.tsx apps/admin/app/(admin)/layout.tsx
git commit -m "feat(admin): inyectar accentColor del logo en CSS var --brand-primary"
```

---

## Verificación final end-to-end

- [ ] **Correr ambas apps en paralelo**

```bash
# Terminal 1
pnpm --filter @mrtpvrest/admin dev

# Terminal 2
pnpm --filter @mrtpvrest/saas dev
```

- [ ] **Checklist de smoke test**

| URL | Esperado |
|---|---|
| `http://localhost:3002/login` | Fondo oscuro, acento purple, layout split |
| `http://localhost:3002/register` | Fondo oscuro, tarjeta centrada, stepper purple |
| `http://localhost:3002/verify-email?token=x` | Fondo oscuro, acento purple, error "Token inválido" |
| `http://localhost:3005/login` | Dark purple, badge "SaaS Central", sin naranja |
| `http://localhost:3005/dashboard` | Dashboard con acento purple, Sidebar con badge |
| Toggle dark/light en cualquier página | Cambia entre temas |
| Login SUPER_ADMIN en `localhost:3002` | Redirige a `localhost:3005/dashboard` |
| Login ADMIN en `localhost:3002` | Entra a `/admin` normalmente |
| Subir logo rojo → logout → login | Acento de la app cambia a rojo |

- [ ] **Commit final si todo pasa**

```bash
git add .
git commit -m "feat: apps/saas separación completa + dark purple design system"
```
