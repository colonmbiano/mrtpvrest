FROM node:20

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm@9.15.0

# Copiar todo el código fuente
COPY . .

# Eliminar node_modules de Windows si se coló
RUN rm -rf node_modules apps/backend/node_modules packages/database/node_modules

# Instalar dependencias con pnpm
RUN pnpm install --no-frozen-lockfile

# Generar cliente de Prisma
RUN pnpm --filter @mrtpvrest/database exec prisma generate

EXPOSE 3000

# Aplica migraciones pendientes antes de arrancar. `prisma migrate deploy` es
# idempotente: solo corre las que aún no están en _prisma_migrations. Si falla,
# el deploy falla ruidosamente y el server no levanta con schema inconsistente.
CMD ["sh", "-c", "pnpm --filter @mrtpvrest/database exec prisma migrate deploy && node apps/backend/src/index.js"]
