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

## Estado del pipeline de release (importante)

Los `.apk` deben ser builds **release firmados**, no debug (los debug son más
pesados, depurables/reversibles y van con la clave de debug). Hoy en CI:

- **TPV** → SÍ tiene build release firmado: `.github/workflows/build-android-apk-release.yml`
  (`assembleRelease` + keystore de GitHub Secrets). Disparable con `workflow_dispatch`.
- **KDS / Delivery / Meseros Lite** → en CI solo hay build **DEBUG**
  (`build-android-apk-*.yml` corren `assembleDebug`). NO se pueden publicar como release
  hasta agregarles `signingConfig` de release en su `android/app/build.gradle` + un
  workflow `assembleRelease` (como el del TPV).
- **Kiosko** → no tiene ningún workflow de release (solo debug en `build-apks.yml`).

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
