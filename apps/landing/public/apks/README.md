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

## Estado del pipeline de release

Los `.apk` deben ser builds **release firmados**, no debug. Las 5 apps ya tienen
pipeline de release firmado en CI (`assembleRelease` + keystore de GitHub Secrets,
con verificación de firma v2/v3):

- **TPV** → `.github/workflows/build-android-apk-release.yml` (`workflow_dispatch` o tag `tpv-v*`).
- **KDS / Delivery / Meseros Lite / Kiosk** → `.github/workflows/build-android-apks-release.yml`
  (matriz; `workflow_dispatch` o tag `apks-rel-v*`).

Cada `android/app/build.gradle` tiene `signingConfigs.release` que lee el keystore
de env (`KEYSTORE_PATH`/`KEYSTORE_PASSWORD`/`KEY_ALIAS`/`KEY_PASSWORD`); sin keystore
`assembleRelease` queda sin firma a propósito.

## Cómo publicar un APK release

1. Genera el build release firmado (en CI vía el workflow, o local con el keystore).
2. Descarga el artifact (`app-release.apk`) y renómbralo al nombre exacto de arriba.
3. Colócalo en esta carpeta (`apps/landing/public/apks/`).
4. Agrega su URL a `READY_APKS` en `apps/landing/lib/links.ts` (es **per-app**:
   solo los que estén en `READY_APKS` se ofrecen como descarga; el resto degrada a
   "Solicitar acceso", sin enlaces muertos).
5. Verifica:
   ```cmd
   curl -sI https://mrtpvrest.com/apks/mrtpvrest-tpv.apk
   ```
   Debe responder `200` con
   `content-type: application/vnd.android.package-archive`
   (lo fuerza `next.config.js` → `headers()`).
