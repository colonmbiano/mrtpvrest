# PWA Icons

Los PNG se generan desde los SVG de esta carpeta (desde `apps/client`, con el
`sharp` que ya trae Next):

```bash
node scripts/generate-icons.mjs
```

Para cambiar un ícono edita su SVG y vuelve a correr el script; no edites los PNG
a mano.

## Marketplace (`/marketplace.webmanifest`)

- `marketplace-icon.svg` → `marketplace-192.png`, `marketplace-512.png`
  (purpose `any`, esquinas redondeadas).
- `marketplace-maskable.svg` → `marketplace-maskable-512.png` (purpose
  `maskable`: el dibujo cabe en la zona segura del 80 %) y
  `marketplace-apple-touch-icon.png` (180×180, fondo opaco para iOS).

## Tiendas (fallback)

- `store-icon.svg` → `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.

El manifest dinámico (`apps/client/src/app/[slug]/manifest.ts`) usa el
`logoUrl` del tenant cuando existe, y cae a `/icons/icon-512.png` cuando
no (ver `src/lib/tenant.ts`), por eso estos archivos deben existir.
