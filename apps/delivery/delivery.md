# App Delivery: Especificación Técnica y de Diseño (Warm Tech / Halo)

**Proyecto:** MRTPVREST - Módulo de Repartidores
**Versión:** 2.0 (Halo Design System / Warm Tech)
**Scope:** Diseño visual coordinado con el TPV, estructura de pantallas, offline-first y nuevas features operativas.

---

## 1. Visión General

La aplicación de Delivery es la herramienta móvil para los repartidores en ruta. Ha sido rediseñada bajo el concepto **"Warm Tech" (Halo Design System)** para ofrecer una experiencia premium, minimalista y de alta legibilidad. Utiliza fondos oscuros profundos con destellos radiales sutiles para guiar la atención y tarjetas con bordes amplios para una interfaz moderna y táctil.

---

## 2. Design System: Warm Tech (Halo)

### 2.1. Fondo Global y Profundidad
- **Fondo Base:** Negro profundo (`#0C0C0E`).
- **Halo Glows (Mesh Gradients):**
  - **Glow Naranja (Superior Izquierdo):** `#FF840030` a transparente. Proporciona calidez y energía.
  - **Glow Verde Esmeralda (Inferior Derecho):** `#88D66C20` a transparente. Representa éxito y flujo de caja.

### 2.2. Tarjetas y Paneles (Halo UI)
- **Fondo de Tarjeta:** Opaco, ligeramente elevado (`#1A1A1A`).
- **Bordes:** Muy finos y sutiles (`border border-white/5`).
- **Redondeado (Corner Radius):** Tarjetas y botones principales con un radio amplio de `24px` o `32px` (`rounded-3xl`).
- **Sombra:** Sombra suave externa para dar profundidad sobre el fondo oscuro.

### 2.3. Tipografía y Colores de Acento
- **Data Dura y Montos:** `JetBrains Mono` (Bold). Color: Blanco puro o Verde Esmeralda (`#88D66C`) para dinero en mano.
- **Textos de Interfaz y Direcciones:** `Geist` o `Inter` (Regular/Medium). 
- **Color Texto Principal:** Blanco brillante (`#FFFFFF`).
- **Color Texto Secundario:** Gris mutado (`#9ca3af`) para etiquetas y detalles.
- **Marca y Acento:** Ámbar principal (`#FF8400`) para CTAs críticos y estados de advertencia.

---

## 3. Estructura de Pantallas y Funcionalidad

### 3.1. Pantalla de Login
- **Numpad Estilo Halo:** Botones circulares o muy redondeados con tipografía JetBrains Mono grande.
- **Acceso rápido:** PIN de 4-6 dígitos.

### 3.2. Dashboard "Ruta Activa"
- **Safe Area:** Padding superior para notch/isla dinámica.
- **Header con Ticker Dinámico:** Barra sutil en la parte superior con mensajes contextuales (clima, seguridad, motivación).
- **Resumen de Hoy (Halo Card):** Métricas destacadas en JetBrains Mono (Entregas | Efectivo).
- **Mandados Prioritarios:** Tarjeta con borde resaltado para tareas de logística interna.
- **Lista de Órdenes:** 
  - Tarjetas de gran formato (`rounded-3xl`).
  - Dirección resaltada para lectura inmediata.
  - Botones de acción rápida: Llamada, Chat y Cambio de Status.

### 3.3. Módulo de Caja Chica
- Control riguroso de ingresos y gastos.
- Balance principal destacado en Verde Esmeralda sobre fondo Halo.

---

## 4. Arquitectura Offline-First

- **Caché Local:** IndexedDB/LocalStorage para persistencia de órdenes asignadas.
- **Acciones Optimistas:** Confirmación de entrega y mensajes se reflejan instantáneamente en el UI y se encolan en `useOfflineStore`.
- **Sincronización:** Proceso en background que envía la cola al servidor en cuanto se detecta conexión estable.

---

## 5. Tokens de Tailwind (Guía)

```html
<!-- Contenedor Halo Card -->
<div class="bg-halo-card rounded-3xl border border-white/5 p-6 shadow-xl">
  <p class="font-mono text-2xl text-halo-success">$450.00</p>
</div>

<!-- Fondo con Glows (Layout) -->
<div class="fixed inset-0 bg-halo-bg -z-10">
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-halo-primary/20 blur-[100px] rounded-full"></div>
  <div class="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-halo-success/10 blur-[120px] rounded-full"></div>
</div>
```
