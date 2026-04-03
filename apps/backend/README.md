# 🌮 Restaurante — Backend API

Plataforma de pedidos online con integración Loyverse, impresión automática y WhatsApp.

---

## ⚡ Arranque rápido (Fase 1)

### Paso 1 — Instalar dependencias

```bash
cd backend
npm install
```

### Paso 2 — Crear tu base de datos GRATIS en Supabase

1. Ve a **https://supabase.com** → Crear cuenta gratis
2. Crear nuevo proyecto (guarda la contraseña)
3. Ve a **Project Settings → Database → Connection string → URI**
4. Copia la URL (tiene este formato):
   ```
   postgresql://postgres:[TU-PASSWORD]@db.[ID].supabase.co:5432/postgres
   ```

### Paso 3 — Configurar variables de entorno

```bash
cp .env.example .env
```

Abre `.env` y llena **solo estas 3 variables** para empezar:

```env
DATABASE_URL="postgresql://postgres:[TU-PASSWORD]@db.[ID].supabase.co:5432/postgres"
JWT_SECRET="escribe-cualquier-texto-largo-aqui-min-32-chars"
JWT_REFRESH_SECRET="otro-texto-largo-diferente-al-de-arriba"
```

> El resto (Loyverse, WhatsApp, impresora) lo configuras en fases posteriores.

### Paso 4 — Crear las tablas en la BD

```bash
npm run db:migrate
```

Cuando pregunte un nombre para la migración, escribe: `init`

### Paso 5 — Cargar datos iniciales

```bash
npm run db:seed
```

Esto crea:
- ✅ Usuario admin: `admin@mirestaurante.com` / `Admin1234!`
- ✅ Usuario cocina: `cocina@mirestaurante.com` / `Cocina1234!`
- ✅ Categorías y platillos de ejemplo
- ✅ Cupón `BIENVENIDO` (20% de descuento)

### Paso 6 — Arrancar el servidor

```bash
npm run dev
```

Verás esto:
```
  ┌─────────────────────────────────────┐
  │  🌮 Restaurante API                 │
  │  Puerto:  3001                      │
  │  Entorno: development               │
  │  Health:  /health                   │
  └─────────────────────────────────────┘
```

### Paso 7 — Probar que funciona

Abre tu navegador en: **http://localhost:3001/health**

Debes ver:
```json
{ "status": "ok", "timestamp": "...", "env": "development" }
```

**¡Listo! Tu API está funcionando. 🎉**

---

## 🧪 Probar los endpoints

Puedes usar [Thunder Client](https://www.thunderclient.com/) (extensión de VS Code) o [Postman](https://postman.com).

### Registrar un cliente:
```
POST http://localhost:3001/api/auth/register
Content-Type: application/json

{
  "name": "Juan García",
  "email": "juan@ejemplo.com",
  "phone": "5512345678",
  "password": "mipassword123"
}
```

### Ver el menú:
```
GET http://localhost:3001/api/menu/items
```

### Login como admin:
```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "admin@mirestaurante.com",
  "password": "Admin1234!"
}
```

---

## 📁 Estructura del proyecto

```
backend/
├── prisma/
│   ├── schema.prisma      ← Diseño completo de la BD
│   └── seed.js            ← Datos iniciales
├── src/
│   ├── index.js           ← Servidor Express + Socket.io
│   ├── middleware/
│   │   └── auth.middleware.js   ← Verificación JWT
│   ├── routes/
│   │   ├── auth.routes.js       ← Login, registro, refresh
│   │   ├── menu.routes.js       ← Menú + sync Loyverse
│   │   ├── orders.routes.js     ← ⭐ Flujo principal de pedidos
│   │   ├── loyalty.routes.js    ← Puntos y cupones
│   │   ├── payments.routes.js   ← Conekta (stub)
│   │   ├── reports.routes.js    ← Dashboard ventas
│   │   └── admin.routes.js      ← Config restaurante
│   ├── services/
│   │   ├── loyverse.service.js  ← Crear receipt en Loyverse
│   │   ├── printer.service.js   ← Imprimir ticket ESC/POS
│   │   ├── whatsapp.service.js  ← Mensajes WhatsApp
│   │   └── loyalty.service.js   ← Lógica de puntos
│   └── utils/
│       └── prisma.js            ← Cliente de BD singleton
├── .env.example           ← Variables de entorno (plantilla)
└── package.json
```

---

## 🔧 Configuraciones por fase

| Variable | Cuándo configurar |
|---|---|
| `DATABASE_URL` | **Ahora (Fase 1)** |
| `JWT_SECRET` | **Ahora (Fase 1)** |
| `LOYVERSE_API_TOKEN` | Fase 4 |
| `WHAPI_TOKEN` | Fase 4 |
| `PRINTER_IP` | Fase 4 |
| `CONEKTA_SECRET_KEY` | Fase 3 |
| `R2_ACCESS_KEY_ID` | Fase 2 |

---

## 🆘 Problemas comunes

**Error: `Environment variable not found: DATABASE_URL`**
→ Asegúrate de tener el archivo `.env` (no `.env.example`) con tu URL de Supabase.

**Error: `ECONNREFUSED` al correr migrate**
→ Revisa que la URL de Supabase sea correcta y que el proyecto esté activo.

**Puerto 3001 ocupado**
→ Cambia `PORT=3002` en tu `.env`

---

## 📞 Siguiente paso

Con el servidor corriendo, el siguiente paso es **Fase 2: Login y Panel Admin** en Next.js.
"# master-burguers-admin" 
