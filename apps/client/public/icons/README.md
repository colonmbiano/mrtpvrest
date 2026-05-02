# PWA Icons

Coloca aquí los iconos por defecto de la PWA (usados como fallback si un
restaurante no subió logo personalizado en `Restaurant.logoUrl`):

- `icon-192.png` — 192×192, transparente o sobre fondo del brand
- `icon-512.png` — 512×512, idem
- `apple-touch-icon.png` — 180×180, opcional para iOS

El manifest dinámico (`apps/client/src/app/[slug]/manifest.ts`) usa el
`logoUrl` del tenant cuando existe, y cae a `/icons/icon-512.png` cuando
no — por eso este archivo debe existir y pesar > 0.

Genera ambos tamaños desde un SVG con cualquier tool (ImageMagick,
realfavicongenerator.net, etc.). PNG con fondo opaco recomendado para
evitar efectos visuales en iOS.
