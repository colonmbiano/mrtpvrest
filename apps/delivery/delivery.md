# App Delivery — Especificación Técnica v2

**Proyecto:** MRTPVREST · Módulo de Repartidores
**Stack:** Next.js 14 App Router + Capacitor Android + reuso de `apps/backend`
**Objetivo:** Una herramienta operativa que un repartidor pueda usar 8 horas bajo sol con guante puesto, alineada al diseño operativo del monorepo.

---

## 1. Principios de diseño (no negociables)

| Principio | Justificación |
|---|---|
| **Identidad MRTPVREST sin divergencia** | Cajeros y repartidores rotan. Un solo design system reduce fricción cognitiva y bundle. |
| **Outdoor-first, no premium-first** | Decisiones visuales subordinadas a legibilidad bajo sol directo. Glassmorphism solo en modales. |
| **Offline-first real, no aspiracional** | Conflict resolution explícita, estado por acción, retries con backoff. |
| **Una mano + guante** | Targets táctiles `min-h-[64px]`, gestos básicos, cero menus anidados. |
| **Información jerárquica** | Lo crítico (orden, dirección, total) ocupa el 60% del viewport en cada pantalla. |

---

## 2. Design System (alineado al monorepo)

### 2.1 Paleta
- Fondo base: `#0C0C0E` (Obsidiana — mismo que TPV)
- Acento primario: `#FFB84D` (Ámbar Miel — CTAs, focus, totales pendientes)
- Éxito: `#88D66C` (Verde Salvia — entregas confirmadas, dinero ya cobrado)
- Alerta: `#FF5C33` (Coral — errores, no contesta, dirección errónea)
- Info: `#A78BFA` (Iris — geolocalización, tracking)
- Texto: `#FFFFFF` / `white/70` / `white/40` por jerarquía

### 2.2 Tipografía
- Títulos: **Syne** (mismo que TPV)
- Cuerpo: **Outfit** (mismo que TPV)
- Números/dinero/orden#: `tabular-nums` aplicado a Outfit (no introducir tercera familia tipográfica)

### 2.3 Containers
- **Cards sólidas con borde** (NO glass como bg principal):
  ```html
  <div class="bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md p-5">
  ```
- **Glow ámbar puntual** por radial gradient para "premium feel" sin sacrificar legibilidad:
  ```html
  <div class="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-30 blur-2xl"
       style="background:radial-gradient(circle, rgba(255,184,77,0.4) 0%, transparent 70%)" />
  ```
- Glass real (`backdrop-blur-md` + transparencia mayor) **solo dentro de modales** que aparecen sobre la pantalla — outdoor el repartidor está enfocado en el modal, no en el bg.

### 2.4 Botones
- `min-h-[64px]` siempre.
- `active:scale-95`, sin `hover:`.
- Primario: ámbar `#FFB84D` con `text-[#0C0C0E]` y sombra `shadow-[0_10px_30px_rgba(255,184,77,0.3)]`.
- Secundario: `bg-white/5 border-white/10 text-white`.
- Destructivo: `bg-red-500/10 border-red-500/30 text-red-400`.

---

## 3. Pantallas

### 3.1 Login (`/login`)
- Logo: ícono de moto/scooter sobre círculo ámbar.
- Header: `MRTPV Delivery · {locationName}` (cargado de localStorage tras primer login).
- Form: email + password OR código de turno (si la operación lo permite).
- **Botón biométrico opcional** post-primer-login (huella/face) usando `@capacitor/biometric-auth` para evitar re-loguear cada apertura.
- Auth contra `apps/backend`: `POST /api/employees/login` con scope `DELIVERY`. Mismo JWT pattern que TPV.

### 3.2 Hub principal (`/dashboard`)

Layout vertical:

**A. Header sticky (`min-h-[88px]`)**
- Avatar + nombre del repartidor.
- Pill de estado: `EN RUTA` (verde) / `EN PAUSA` (gris) / `FUERA DE TURNO` (rojo).
- Pill de conexión: `🟢 Online` / `🟡 Sincronizando` / `🔴 Offline · 3 pendientes`.

**B. Métricas del día (card ámbar)**
- 3 columnas: Completadas · Efectivo en mano · Comisiones del día.
- Tap en "Efectivo en mano" → abre `/caja`.

**C. Ticker informativo (opcional)**
- Una sola línea de texto con icono pequeño, fondo `bg-white/[0.03]`.
- Mensajes pre-canned + uno generado por Groq cada apertura **con caché 30 min** y failover a pre-canned si Groq falla/timeout.
- Si quieres clima real: integrar Open-Meteo (gratis, sin API key) en el server, no en el cliente.

**D. Lista de órdenes activas**
- Cada orden = card vertical con:
  - Top: chip `#orderNumber` + ETA en minutos + chip de status.
  - Middle: nombre cliente, dirección con icono de pin (tap → abre mapa).
  - Bottom: total grande (ámbar si pendiente, verde si ya pagado), botones `Llamar` `Mensaje` `Navegar`.
- CTA expandido: `CONFIRMAR ENTREGA` (cuando ya está en destino, geo-validado por backend o por tap manual).

**E. Mandados / pendientes operativos**
- Sección colapsable separada (no mezclada con órdenes).
- Lista simple: descripción + monto + botón "Registrar gasto".

### 3.3 Mapa de ruta (`/route` — pantalla nueva, crítica)
- **Falta en el plan original.** Es la pantalla más usada.
- Embed con Mapbox Navigation SDK o Google Maps SDK.
- Trazado de ruta optimizada para todas las órdenes activas.
- Markers numerados por orden de entrega.
- Bottom sheet deslizable con detalle de la orden actual.
- Botón "Iniciar navegación" → abre Google Maps / Waze nativo en intent.

### 3.4 Detalle de orden (`/orders/:id`)
- Header con orderNumber + estado + tiempo en ruta.
- Card con cliente (nombre, teléfono con tap-to-call, notas del cliente).
- Card con dirección (con coordenadas si están, botón "Navegar").
- Lista de items (solo lectura — el repartidor no edita).
- Total con desglose: subtotal + propina + total.
- **Captura de evidencia de entrega:**
  - Botón "Tomar foto" (`@capacitor/camera`).
  - Captura opcional de firma con `react-signature-canvas`.
  - Código de confirmación de 4 dígitos que el cliente dicta al repartidor.
- **Flujos de excepción** (botones secundarios):
  - "Cliente no contesta" → marca timestamp, dispara push al cajero.
  - "Dirección errónea" → modal con campo de comentario.
  - "Producto dañado" → fotos + nota.
  - "Devolución parcial" → selector de items, recálculo de total.
- CTA primario: `CONFIRMAR ENTREGA` con efectivo recibido (modal de monto y cambio).

### 3.5 Mi caja (`/caja`)
- Saldo actual en grande, tabular-nums.
- Lista de transacciones con icono por tipo (cobro, retiro, ajuste).
- Botón "Solicitar retiro" → genera evento que el cajero aprueba.
- Botón "Cerrar turno" → conciliación final con cajero, fija saldo a cero.
- Histórico paginado por día.

### 3.6 Modo "Aceptar pedido" (overlay flotante)
- Aparece cuando el backend asigna una orden vía Socket.io / push.
- Modal a pantalla completa con: cliente, dirección, ETA estimada, total.
- 2 botones: `RECHAZAR` (gris, full-width) / `ACEPTAR` (ámbar, full-width).
- Timer de 30s; si no responde, vuelve al pool.

---

## 4. Arquitectura offline-first detallada

### 4.1 Estado por acción
Cada acción del repartidor (confirmar entrega, marcar mandado, retirar efectivo) se persiste con estado:
```ts
type ActionStatus = 'PENDING_LOCAL' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
```

### 4.2 Cola persistente (IndexedDB via Dexie)
```ts
// apps/delivery/src/store/syncQueue.ts
interface QueuedAction {
  id: string;          // uuid client-side
  endpoint: string;    // ej. POST /api/orders/:id/confirm-delivery
  body: object;
  createdAt: number;
  status: ActionStatus;
  retries: number;
  lastError?: string;
}
```

### 4.3 Sync worker
- En Android: **Capacitor BackgroundRunner** o `@capacitor-community/background-fetch` (NO Service Worker — Capacitor Android no lo soporta bien).
- Trigger: cuando `network: online` event, cuando la app vuelve a foreground, cada 60s mientras la app está abierta.
- Retry con backoff: 1s, 5s, 30s, 5min, 30min. Tras 5 fallos consecutivos → `FAILED` y notif al repartidor.

### 4.4 Conflict resolution
- Cada orden trae un `version` (`updatedAt` ISO) del backend.
- Al sincronizar una acción, el cliente envía `If-Unmodified-Since: <version>`.
- Si el backend detecta conflicto (otra app tocó la orden) → 409 + estado actual + acción del cliente queda como `CONFLICT`.
- UI muestra modal: "El cajero modificó esta orden mientras estabas offline. Revisa antes de continuar."
- Casos típicos:
  - Repartidor confirma entrega offline; cajero canceló online → conflict, prevalece cancelación.
  - Dos repartidores aceptan misma orden offline → primero en sincronizar gana, otro recibe `409 ALREADY_ASSIGNED`.

### 4.5 Optimistic UI
- La acción se marca visualmente como completada inmediatamente.
- Indicador sutil (ámbar pequeño en esquina) cuando `PENDING_LOCAL`.
- Si pasa a `FAILED` o `CONFLICT`, banner rojo en la card pidiendo atención.

---

## 5. Seguridad y autenticación

| Aspecto | Decisión |
|---|---|
| Backend | Reuso de `apps/backend` (mismo JWT, mismo schema de Employee). |
| Login | Email/password + opcionalmente PIN si el employee usa el TPV también. |
| JWT TTL | 12h normal, 7d para devices `DELIVERY` (los repartidores no quieren re-loguear cada turno). |
| Refresh offline | Si JWT caduca offline, la app queda en modo "sólo lectura del cache" hasta que vuelva la red y refresque. |
| Force logout remoto | Backend expone `POST /api/devices/:id/revoke`. La app valida JWT contra cache local cada apertura + cada acción crítica vía socket si hay red. |
| Biometría local | Opt-in tras primer login. Llave guardada en Android Keystore via `@capacitor/biometric-auth`. |
| Geolocation | Solo durante turno activo. Permiso "When in use" no "Always" — privacidad. |

---

## 6. Performance & bundle

- **Sin fotos generadas por IA** como bg → ahorro de bandwidth crítico para 3G.
- **Reuso de Outfit/Syne** ya cargadas en el monorepo (no agregar JetBrains Mono ni Geist).
- **Code splitting agresivo:** dashboard inicial < 200KB gzipped; mapa lazy-loaded cuando el usuario navega a `/route`.
- **Imágenes:** Avatar y logo locales; sin CDN externo para bg.
- **Mapbox vs Google Maps:** Mapbox es más barato y permite custom styling diseño operativo (mapa oscuro con acentos ámbar).

---

## 7. Integraciones externas

| Servicio | Uso | Failover |
|---|---|---|
| **Groq Llama 3.1** | Ticker dinámico (clima + ánimo) | Cache 30min + 5 mensajes pre-canned |
| **Open-Meteo** | Datos de clima reales (gratis, sin key) | Server-side, fallback a "sin datos" |
| **Mapbox Navigation** | Ruta optimizada y mapa | Fallback a abrir Google Maps por intent |
| **Twilio / WhatsApp Business API** | Llamada/chat al cliente | Fallback a `tel:` y `sms:` nativos |
| **`@capacitor/camera`** | Foto de entrega | — |
| **`@capacitor/geolocation`** | Tracking en vivo | Pausa si batería < 20% |

---

## 8. Roadmap implementación (sugerencia de fases)

| Fase | Scope | Entregable |
|---|---|---|
| **D1** | Auth + reuso de backend + Login con biométrico | App abre, repartidor entra |
| **D2** | Hub con lista de órdenes (online only) | Ve sus pedidos asignados |
| **D3** | Detalle de orden + confirmar entrega + foto | Flujo completo de entrega online |
| **D4** | Mapa + navegación con Mapbox | Ruta optimizada visible |
| **D5** | Offline-first: queue + sync + conflict resolution | App funcional sin red |
| **D6** | Mi Caja + retiros + cierre de turno | Conciliación financiera |
| **D7** | Aceptar pedido por push + flujos de excepción | Asignación dinámica |
| **D8** | Mandados operativos + ticker IA | Polish y diferenciadores |
| **D9** | Tracking en vivo desde TPV (mapa cajero ve repartidores) | Visibilidad operativa para gerencia |

---

## 9. Lo que NO debería hacer este módulo (alcance fuera)

- Editar items de la orden (eso es del cajero/mesero).
- Aplicar descuentos.
- Modificar precios.
- Crear nuevas órdenes desde cero.
- Reasignar a otro repartidor sin pasar por backend.

---

## 10. Diferencias clave vs plan v1

| Tema | v1 | v2 |
|---|----|----|
| Identidad | Glass + fotos IA + paleta nueva | diseño operativo del monorepo, sin divergencia |
| Mapa | No mencionado | Pantalla crítica con Mapbox |
| Foto de entrega | No mencionado | Estándar en cada confirmación |
| Flujos de excepción | No mencionado | 4 flujos definidos |
| Asignación de pedido | No mencionado | Modal con timer 30s |
| Offline detalle | "cola con SW" | IndexedDB + BackgroundRunner + conflict resolution con `If-Unmodified-Since` |
| Glass scope | Toda la app | Solo modales |
| Bundle de tipografía | +2 familias | Reuso de Outfit/Syne |
| Total destacado | Verde | Ámbar pendiente, verde post-cobro |
| Seguridad | No mencionada | Sección dedicada |
