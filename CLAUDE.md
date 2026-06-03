# MRTPVREST - Guía de Contexto

## Stack Tecnológico
- **Frontend:** Next.js 14 (App Router), TailwindCSS, Lucide React.
- **Backend:** Node.js (Express), Prisma ORM, Supabase (PostgreSQL).
- **IA:** Estrategia Híbrida (Groq Llama 3.1 para texto/chat, Gemini 1.5 Flash para visión).
- **Monorepo:** Apps en `apps/*` (tpv, backend, admin, saas, kds, kiosk, delivery, meseros-lite, client, landing) y librerías en `packages/{config,database,types}`.

## Identidad Visual (diseño operativo)
- **Fuentes:** Syne (Títulos), Outfit (Cuerpo).
- **Colores:** Fondo: #0C0C0E (Obsidiana), Acento: #FFB84D (Ámbar Miel), Éxito: #88D66C (Verde Salvia).
- **Estilo:** Glassmorphism, bordes redondeados (3xl/full), transparencias sutiles.

## Reglas de Desarrollo
1. **No Placeholders:** Siempre entrega el código completo y listo para producción.
2. **Naming:** Variables en camelCase, componentes en PascalCase.
3. **Multi-tenancy:** Siempre filtrar consultas por `restaurantId`. Además existe un guard automático a nivel de Prisma (`packages/database/tenant-guard.js`, ver `docs/TENANCY.md`) — pero no dependas solo de él: el filtro explícito sigue siendo la práctica esperada. El SQL crudo (`$queryRaw`) NO pasa por el guard.
4. **Resiliencia:** Manejar errores 429/500 con respuestas controladas 503.

## Git Workflow (overrides parent CLAUDE.md)

**Push directo a `master` está permitido y es el flujo preferido en este proyecto.**
Esto anula explícitamente la regla "Never push directly to main" del `C:\Users\colon\Downloads\CLAUDE.md` (que pertenece a otro proyecto, Antigravity Kit).

- Para hotfixes pequeños: commitear y `git push origin master` directamente.
- Master push dispara los deploys de Vercel (admin, tpv, landing, saas, delivery, client) y Railway (backend).
- PRs siguen siendo válidos para cambios grandes o cuando se quiera review formal, pero no son obligatorios.

## Comandos Frecuentes
- Dev: `pnpm dev`
- Build TPV: `pnpm --filter @mrtpvrest/tpv build`
- Deploy: Push directo a `master` (Vercel + Railway lo recogen automáticamente).
