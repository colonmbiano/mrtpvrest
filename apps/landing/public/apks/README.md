# APK release firmados (descargas públicas)

Estos archivos se sirven **estáticamente** desde el sitio público
(`https://mrtpvrest.com/apks/...`), NO desde `admin.mrtpvrest.com` (el admin no
expone los APK a visitantes anónimos: redirigía a `/login`).

## Nombres exactos esperados

Los nombres deben coincidir **exactamente** con `apps/landing/lib/links.ts` (`APKS`):

- `mrtpvrest-tpv.apk`
- `mrtpvrest-kiosko.apk`
- `mrtpvrest-kds.apk`
- `mrtpvrest-delivery.apk`
- `mrtpvrest-meseros-lite.apk`

## Cómo generarlos (deben ser builds **release** firmados, no debug)

Los debug son más pesados, depurables/reversibles y van firmados con la clave de
debug. Para publicar:

1. En cada proyecto Android/Capacitor, genera el build release firmado
   (`assembleRelease` con el keystore de release de GitHub Secrets / respaldo local).
2. Renómbralos con los nombres de arriba.
3. Colócalos en esta carpeta (`apps/landing/public/apks/`).
4. Cambia `DOWNLOADS_READY = true` en `apps/landing/lib/links.ts`.
5. Verifica:
   ```cmd
   curl -sI https://mrtpvrest.com/apks/mrtpvrest-tpv.apk
   ```
   Debe responder `200` con
   `content-type: application/vnd.android.package-archive`
   (lo fuerza `next.config.js` → `headers()`).

Mientras `DOWNLOADS_READY = false`, los botones de descarga piden acceso (registro)
en vez de enlazar a archivos inexistentes.
