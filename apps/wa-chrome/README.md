# Pedidos WhatsApp → TPV (extensión de Chrome)

Extensión que **lee el chat abierto en WhatsApp Web**, detecta el pedido (con tu
IA del backend) y lo **crea en el TPV** con un clic. Queda **PENDING** en el panel
"Pedidos Web" para que el **cajero lo confirme** antes de cocina.

## Por qué este enfoque (vs un bot tipo Baileys)
- **No vincula un dispositivo nuevo** — usa la sesión de WhatsApp Web que ya tienes abierta.
- **Solo lectura**: lee el DOM del chat que TÚ abriste. No abre chats, **no envía mensajes**, no automatiza nada a tus espaldas.
- **Riesgo de baneo ~nulo**: no hay handshake de automatización ni envío. Solo lees lo que ya está en pantalla y llamas a TU backend.

## Instalar (una vez)
1. Abre `chrome://extensions`
2. Activa **"Modo de desarrollador"** (arriba a la derecha).
3. Clic en **"Cargar descomprimida"** y elige la carpeta:
   `C:\Users\colon\Downloads\mrtpvrest\apps\wa-chrome`
4. **Conecta tu restaurante:** clic en el **icono de la extensión** (arriba a la
   derecha del navegador) → escribe el **código de tu tienda** (el `slug`, p.ej. en
   `tutienda.mrtpvrest.com` el código es `tutienda`) → **"Verificar y guardar"**.
   La extensión valida el código contra el backend y muestra el nombre del negocio.
5. Abre/recarga **web.whatsapp.com** → aparece el panel **"Pedido → TPV"** abajo a la
   derecha, con el nombre de tu restaurante en la parte superior.

> Sin restaurante configurado, el panel muestra un aviso y no lee ni crea pedidos.
> El código se guarda en `chrome.storage.sync` (lo puedes cambiar cuando quieras
> desde el mismo icono); la misma extensión sirve para cualquier restaurante.

## Usar
1. Abre el chat del cliente con su pedido (como siempre).
2. En el panel, clic **"📦 Leer pedido del chat"** → muestra los productos detectados.
3. Elige **Para llevar / Domicilio** (y dirección si aplica).
4. Clic **"✅ Crear en TPV"** → el pedido cae en **Pedidos Web** del TPV.
5. El **cajero lo acepta** → cocina.

> El backend recalcula los precios; si la IA interpretó algo mal, el cajero lo
> corrige al confirmar. Nunca se manda nada a cocina sin esa confirmación.

## Configuración
- **Restaurante (slug):** desde el **icono de la extensión** (popup). Se valida
  contra `GET /api/store/info?r=<slug>` y se guarda en `chrome.storage.sync` —
  no hay que tocar código. Acepta también pegar la URL de tu tienda.
- **Backend:** `API_BASE` en `background.js` (por defecto `https://api.mrtpvrest.com`,
  compartido por todos los restaurantes del SaaS).

## Cómo funciona (técnico)
- `content.js` lee el chat abierto:
  - Cliente: `#main header span[dir="auto"]`.
  - Mensajes: `.copyable-text[data-pre-plain-text]`; entrante/saliente por el
    `data-id` (`false_`/`true_`); número del cliente desde el JID si es `@c.us`.
  - Toma el último "turno" del cliente (mensajes entrantes tras el último saliente).
- `popup.html` / `popup.js` configuran el restaurante: validan el slug con
  `GET /api/store/info?r=<slug>` y lo guardan en `chrome.storage.sync`.
- `background.js` (service worker, con `host_permissions`) llama al backend sin CORS:
  - lee el slug guardado en `chrome.storage.sync` (sin él, devuelve `notConfigured`).
  - `POST /api/store/parse-order` (interpreta el texto con tu Groq BYOK).
  - `POST /api/store/orders` (`source: WHATSAPP`, queda PENDING).

## Limitaciones
- Funciona mientras WhatsApp Web esté abierto en Chrome.
- Es lectura del DOM: si WhatsApp cambia mucho su HTML, habría que ajustar los
  selectores (`content.js`).
