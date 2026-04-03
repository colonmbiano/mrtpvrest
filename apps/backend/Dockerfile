FROM node:18

WORKDIR /app

# Copiar todo el código fuente
COPY . .

# Eliminar node_modules de Windows si se coló (independiente del .dockerignore)
RUN rm -rf node_modules .npm

# Instalar dependencias limpias en Linux
RUN npm ci

# Generar cliente de Prisma en Linux — produce binario debian-openssl-3.0.x
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]
