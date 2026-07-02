# Hosting del bot "Cajero Estrella" (whatsapp-web.js + Gemini)

El bot corre como un **servicio Railway SEPARADO** del backend API. Motivo:
whatsapp-web.js necesita Chromium + una sesión persistente **single-instance**;
meterlo en el contenedor del API lo bloquearía a 1 réplica, inflaría la imagen y
un leak de puppeteer podría tumbar el API.

Rama con el código: **`claude/whatsapp-bot`** (aún no en master; mergear tras
validar en prod). Entrypoint: `apps/backend/src/whatsapp/worker.js`.
Build: `apps/backend/Dockerfile.bot` (Chromium del sistema).

---

## 1. Crear el servicio en Railway (dashboard)

En el proyecto **mrtpvrest**, entorno **production**:

1. **New → GitHub Repo** → `colonmbiano/mrtpvrest`, branch **`claude/whatsapp-bot`**.
   Nómbralo p.ej. `whatsapp-bot`.
2. **Settings → Build:**
   - Builder: **Dockerfile**
   - Dockerfile Path: **`apps/backend/Dockerfile.bot`**
   - Root Directory: **vacío** (raíz del repo — el Dockerfile hace `COPY . .`).
3. **Settings → Deploy:**
   - Start Command: **vacío** (lo pone el `CMD` del Dockerfile).
   - Healthcheck Path (opcional): **`/healthz`**.
   - Replicas: **1** (obligatorio — una sola sesión de WhatsApp).

## 2. Volumen persistente (sesión de WhatsApp)

**Settings → Volumes → Add Volume**, mount path **`/data`**.
Sin esto, cada redeploy pierde la sesión y toca re-escanear el QR.

## 3. Variables de entorno

En **Variables** del nuevo servicio:

| Variable | Valor |
|---|---|
| `WHATSAPP_BOT_ENABLED` | `true` |
| `WHATSAPP_BOT_RESTAURANT_ID` | `cmp53hjwh00061qo7vx9usdfn` (Master Burguer's) |
| `WHATSAPP_BOT_API_BASE` | `https://api.mrtpvrest.com` |
| `WWEBJS_DATA_PATH` | `/data` |
| `GOOGLE_AI_API_KEY` | referencia al backend: `${{<servicio-backend>.GOOGLE_AI_API_KEY}}` |
| `DATABASE_URL` | referencia al backend: `${{<servicio-backend>.DATABASE_URL}}` |
| `JWT_SECRET` | referencia al backend: `${{<servicio-backend>.JWT_SECRET}}` |

`PUPPETEER_EXECUTABLE_PATH` y `PUPPETEER_SKIP_DOWNLOAD` ya vienen del Dockerfile.

> Usa **referencias** (`${{...}}`) para no copiar secretos en claro. Sustituye
> `<servicio-backend>` por el nombre real del servicio API en el proyecto.

## 4. Deploy y escaneo del QR

1. Lanza el deploy. En los **logs** verás el QR (ASCII) + un link a
   `api.qrserver.com`.
2. Alternativa cómoda: **Settings → Networking → Generate Domain** y abre
   `https://<dominio>/qr` (página con el QR, se auto-refresca cada 10 s).
   > Privacidad: cualquiera con esa URL podría vincular la sesión mientras el QR
   > esté vivo. Si generas dominio, **quítalo** tras vincular (o usa solo logs).
3. En el celular del restaurante: **WhatsApp → Dispositivos vinculados →
   Vincular un dispositivo** → escanea. whatsapp-web.js se vincula como
   **dispositivo companion**: el WhatsApp del celular sigue funcionando (no se
   migra el número, a diferencia de Meta Cloud API).
4. Cuando el log diga `Cliente WhatsApp listo y conectado!`, mándale un mensaje
   de prueba desde otro número y verifica que responde y que el pedido cae en el
   panel "Pedidos Web" del TPV.

## 5. Alternativa por CLI (si prefieres terminal)

```bash
railway login
railway link            # elige proyecto mrtpvrest / production
railway add             # crea el servicio (o hazlo en el dashboard)
# Configura build/vars/volumen en el dashboard (el CLI no cubre todo),
# luego:
railway up --service whatsapp-bot
railway logs --service whatsapp-bot   # ver el QR
```

## Notas / gotchas

- **1 sola réplica**: escalar rompe la sesión (dos Chromium peleando por el
  mismo `clientId`).
- La sesión vive en el volumen (`/data/.wwebjs_auth`); si se corrompe, borra el
  contenido del volumen y re-escanea.
- El worker **no corre migraciones** (de eso se encarga el API).
- Órdenes: el worker las crea contra `WHATSAPP_BOT_API_BASE` por HTTP; el dedupe
  server-side (`POST /api/store/orders`, master `fe7b8fe`) evita duplicados si
  Gemini reemite CONFIRMED.
- Para probar en local sin Railway: el bot sigue corriendo dentro del backend
  (`WHATSAPP_BOT_ENABLED=true` en `apps/backend/.env`, sin `WHATSAPP_BOT_API_BASE`
  → usa localhost).
```
