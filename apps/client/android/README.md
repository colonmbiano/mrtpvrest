# App Android del marketplace

Es una **Trusted Web Activity (TWA)**: abre el marketplace publicado (la PWA de
`apps/client`) en Chrome a pantalla completa. No lleva una copia del sitio, así que
la sesión, el modo sin conexión y los avisos del pedido son los de la web. Todo lo hace
[`androidbrowserhelper`](https://github.com/GoogleChrome/android-browser-helper);
este proyecto solo lo configura (`app/build.gradle` y `AndroidManifest.xml`).

## Requisitos

- **JDK 17 o 21.** El JDK de Android Studio puede ser el 25, y Gradle 8.14 no corre con él.
- **Android SDK 36.** Se toma de `ANDROID_HOME` o de `sdk.dir` en `local.properties`.

## Compilar

La URL del marketplace no está fija en el repo, porque el dominio aún no se decide.
Se pasa con `-PmarketplaceUrl`, con `MARKETPLACE_URL` o con `marketplaceUrl=` en
`local.properties`. Tiene que ser un origen https, sin puerto ni ruta.

```bash
./gradlew assembleDebug -PmarketplaceUrl=https://<dominio>
```

Para Play, `bundleRelease` firma con las mismas variables que el TPV y el repartidor:
`KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD`. Sin llave, el
release queda sin firmar. Hay que subir `versionCode` en `app/build.gradle` con cada
versión.

Para probar en un teléfono contra la tienda local se acepta `http://localhost:<puerto>`
junto con `adb reverse tcp:<puerto> tcp:<puerto>`. Así abre como pestaña de Chrome, con
la barra de dirección.

## Pantalla completa: Digital Asset Links

Chrome quita la barra de dirección solo si el sitio declara la app:

1. Toma las huellas SHA-256 de los certificados que firman la app:
   - la de firma de Play, en Play Console → Integridad de la app;
   - la de la llave de subida, con `keytool -list -v -keystore <archivo>`.
2. En la tienda (`apps/client`), pon las dos en
   `MARKETPLACE_ANDROID_CERT_SHA256=AA:BB:…,CC:DD:…`.
3. Comprueba que `https://<dominio>/.well-known/assetlinks.json` las muestre. En el
   teléfono, comprueba los enlaces con
   `adb shell pm get-app-links com.mrtpvrest.marketplace`.

Sin esos pasos la app abre igual, pero como pestaña de Chrome, con la barra de dirección.
Si el teléfono no tiene un navegador con TWA (Chrome, Edge, Samsung Internet…), la app
abre una pestaña personalizada.

## Avisos del pedido

Son los avisos web del marketplace (Mi cuenta → «Avisos de tus pedidos»). Chrome los
delega en la app (`DelegationService`), así que salen con su nombre y su ícono. En
Android 13 o más nuevo, la app pide el permiso de notificaciones. No hace falta
Firebase: basta con las llaves VAPID del backend, igual que en la web.

## Íconos

Se generan con `node scripts/generate-icons.mjs`, desde `apps/client`:

- el clásico y la pantalla de inicio salen de `public/icons/marketplace-icon.svg`;
- la capa del ícono adaptable sale de `icons/launcher-foreground.svg`; su fondo verde
  está en `colors.xml`;
- el ícono de los avisos sale de `icons/notification.svg`.
