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

CMD ["node", "apps/backend/src/index.js"]
