# Arquitectura MRTPVREST - Fase 3: Storefront "Street Food" y Checkout WA

**Rol:** Senior Frontend Developer & UI/UX Expert.
**Objetivo:** Construir la tienda web pública en Next.js (App Router) que sea dinámica, lea la configuración de colores de la base de datos y permita enviar pedidos estructurados por WhatsApp.

## Paso 1: Enrutamiento Dinámico (`apps/saas-client`)
1. Crea la ruta dinámica `app/[slug]/page.tsx`.
2. Haz fetch del `Tenant` usando el `slug`. Si el tenant no existe o `hasWebStore` es `false`, retorna un `notFound()`.
3. Extrae `themeConfig` (ej. primaryColor) y aplícalo como variables CSS inline en el contenedor principal o usa Tailwind `style={{ '--primary': tenant.themeConfig.primaryColor }}`.

## Paso 2: UI "Street Food"
1. Maqueta un diseño optimizado para móviles (Mobile-first).
2. Crea un layout con un Header (Nombre del local), Categorías en scroll horizontal (burbujas) y un listado de productos con imágenes grandes y botones de "Agregar" muy visibles.
3. Utiliza datos falsos (mock data) de categorías (Burgers, Alitas) y productos por ahora, mientras conectamos el catálogo real en la siguiente fase.

## Paso 3: El Carrito y Checkout de Guerrilla
1. Implementa un estado global o local (Zustand o Context) para el carrito de compras.
2. Crea un botón flotante (Sticky Footer) que muestre el total y diga "Pedir por WhatsApp".
3. Al hacer clic, genera un mensaje de texto formateado: "NUEVO PEDIDO\n- 1x Master Burger ($120)\nTotal: $120".
4. Usa `window.open` para redirigir a `https://wa.me/${tenant.whatsappNumber}?text=${encodeURIComponent(mensaje)}`.