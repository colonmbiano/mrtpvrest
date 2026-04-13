# mrtpvrest

Resumen rápido

Monorepo PNPM + Turbo para una solución TPV web. Contiene UIs Next.js (admin, client, tpv) y un backend en Express con Prisma para la base de datos. Paquetes compartidos para configuración, tipos y prisma.

Estructura

- apps/
  - admin — Next.js (puerto 3002). Panel administrativo (charts, mapas, sockets).
  - client — Next.js (puerto 3006). Front público.
  - tpv — Next.js (puerto 3005). Interfaz TPV.
  - backend — Express (src/index.js). API, WebSockets, integraciones.

- packages/
  - config — exports de config compartida (tailwind, tsconfig).
  - database — Prisma schema, scripts de db.
  - types — tipos TypeScript compartidos.

Tecnologías clave

- Node >= 20, pnpm 9.x
- Turbo (cache y tareas paralelas)
- Next.js 14 (apps UI)
- Express + Socket.io (backend)
- Prisma (base de datos)
- TailwindCSS, TypeScript
- Integraciones: OpenAI, Resend, Mercadopago, Cloudinary, Bull, nodemailer, web-push

Prerequisitos

- Node >= 20
- pnpm >= 9
- Base de datos (según prisma schema; p. ej. PostgreSQL/MySQL)
- Variables de entorno para backend (DATABASE_URL, JWT_SECRET, CLOUDINARY, MERCADOPAGO, OPENAI_API_KEY, RESEND_API_KEY, SMTP_*, etc.) — revisar apps/backend/.env.example o documentación interna.

Comandos principales (desde la raíz)

- Instalar dependencias:
  pnpm install

- Desarrollo (levanta todas las apps que definan `dev` mediante Turbo):
  pnpm dev

- Compilar todas las apps:
  pnpm build

- Formatear:
  pnpm run format

- Lint y type-check (turbo coordina los paquetes):
  pnpm run lint
  pnpm run type-check

Base de datos / Prisma

- Generar cliente Prisma (root):
  pnpm run db:generate

- Empujar esquema a BD (sin migrations):
  pnpm run db:push

- Desde @mrtpvrest/backend:
  pnpm --filter @mrtpvrest/backend run db:migrate    # dev migrations (usa prisma schema en packages/database)
  pnpm --filter @mrtpvrest/backend run db:seed

Notas de arranque recomendadas

1. Configurar .env con DATABASE_URL y demás claves.
2. Ejecutar las migraciones/`db:push` y/o `db:generate` según flujo preferido.
3. Iniciar backend: pnpm --filter @mrtpvrest/backend dev
4. Iniciar UIs (o ejecutar pnpm dev desde root para lanzar todo en paralelo).

Despliegue

- Construir Next apps (pnpm build) y servir con NODE_ENV=production.
- Asegurar variables de entorno en el entorno de producción.
- Ejecutar migraciones (prisma migrate deploy) antes de iniciar el backend.

Solución de problemas (rápido)

- Errores de Prisma: comprobar DATABASE_URL y ejecutar `pnpm run db:generate`.
- Puertos en uso: verificar que 3002/3005/3006 están libres o cambiar en package.json de cada app.
- Dependencias workspace no resueltas: ejecutar `pnpm install --filter <package>` o `pnpm -w install`.

Contacto y siguientes pasos

- Para añadir documentación de variables de entorno o diagramas de arquitectura, proporcionar .env.example o pedir que genere un diagrama basado en los flujos de backend.

---
Este README es una guía rápida para desarrolladores. ¿Deseas que genere un archivo .env.example basado en el código o un diagrama de arquitectura? 