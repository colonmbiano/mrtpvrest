# App Repartidor para iPhone — Guía de Build (iOS)

La app de repartidor (`apps/delivery`) es una app **Next.js + Capacitor**. El mismo
código React que corre en Android y en web se empaqueta dentro de un WebView nativo
de iOS. **No hay código Swift de negocio** — solo el contenedor Capacitor.

> ⚠️ **Requisito ineludible de Apple:** compilar y firmar un `.ipa` para iPhone
> **solo es posible en macOS con Xcode**. Apple no permite construir apps iOS en
> Linux/Windows. El proyecto iOS ya está generado y configurado en este repo
> (`apps/delivery/ios/`); lo que sigue se hace en una Mac.

---

## 1. Requisitos previos

| Requisito | Notas |
|---|---|
| **Mac con macOS** | Xcode solo corre en macOS. |
| **Xcode 15+** | Desde la App Store. Incluye el simulador de iPhone. |
| **CocoaPods** | `sudo gem install cocoapods` (Capacitor lo usa para dependencias nativas). |
| **Node 20+ y pnpm 9+** | Igual que el resto del monorepo. |
| **Cuenta Apple Developer** | Gratuita: instalar en tu propio iPhone (perfil válido 7 días). De pago ($99/año): TestFlight y App Store. |

---

## 2. Variables de entorno

La app necesita las mismas variables que en web/Android. Se **inlinean en el build**
(`NEXT_PUBLIC_*`), así que deben estar presentes al ejecutar `next build`. Crea
`apps/delivery/.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://<tu-backend>.up.railway.app   # backend en producción (https)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...                        # token público de Mapbox
```

> En iOS, App Transport Security (ATS) **bloquea http** por defecto. El backend de
> producción es https (Railway), así que no hay problema. Si quieres probar contra
> un backend local por http (`http://localhost:3001`), tendrás que añadir una
> excepción ATS temporal en `ios/App/App/Info.plist` — **no la commitees**.

---

## 3. Build paso a paso (en la Mac)

```bash
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Generar el export web estático y sincronizarlo al proyecto iOS
#    (compila Next con output:'export' y copia /out → ios/App/App/public)
pnpm --filter @mrtpvrest/delivery build:ios

# 3. Abrir el proyecto en Xcode
pnpm --filter @mrtpvrest/delivery ios:open
```

En Xcode:

1. Selecciona el target **App** → pestaña **Signing & Capabilities**.
2. Elige tu **Team** (tu Apple ID / cuenta de desarrollador). Xcode genera el
   perfil de firma automáticamente.
3. El `Bundle Identifier` es `com.mrtpvrest.delivery` (coincide con Android).
   Si ese ID ya está tomado en tu cuenta, cámbialo (p.ej. `com.tuempresa.delivery`).
4. Elige un dispositivo destino:
   - **Simulador** (iPhone 15, etc.) → ⌘R para correr. *Ojo:* el GPS del simulador
     es simulado (Debug → Simulate Location).
   - **iPhone físico** conectado por cable → ⌘R. La primera vez tendrás que
     confiar en el perfil de desarrollador en *Ajustes → General → VPN y gestión
     de dispositivos* en el iPhone.

Cada vez que cambies el código web, repite `build:ios` (o `ios:sync` si ya
buildeaste el `/out`) para resincronizar antes de correr en Xcode.

---

## 4. Permisos y GPS en segundo plano

`ios/App/App/Info.plist` ya está configurado con:

- `NSLocationWhenInUseUsageDescription` — ubicación con la app en primer plano.
- `NSLocationAlwaysAndWhenInUseUsageDescription` / `NSLocationAlwaysUsageDescription`
  — ubicación con la app en segundo plano.
- `UIBackgroundModes: [location]` — permite que iOS no suspenda la app mientras
  rastrea.

> 🔋 **Nota importante sobre el background real:** el `GPSTracker` actual usa la
> API web `navigator.geolocation` dentro del WebView. Con la pantalla **bloqueada**,
> iOS suspende el WebView y `navigator.geolocation` **deja de emitir posiciones**,
> aunque el modo background esté declarado. La declaración del plist habilita la
> *capacidad*, pero para un rastreo que realmente continúe con la pantalla apagada
> hace falta mover el tracking a un plugin nativo de CoreLocation
> (p.ej. `@capacitor/geolocation` con `watchPosition`, o
> `@capacitor-community/background-geolocation` para tracking continuo).
> Eso es un cambio de código en `GPSTracker.tsx` que se puede abordar como
> siguiente iteración — el andamiaje nativo (permisos + background mode) ya está
> listo para soportarlo.

---

## 5. Distribución

### Opción A — Probar en tus propios iPhones (cuenta gratuita)
- Conecta el iPhone por cable y corre desde Xcode (⌘R), o usa **Product → Archive**
  y distribuye **Ad Hoc** a dispositivos registrados.
- Con cuenta gratuita, la app caduca a los **7 días** y hay que reinstalar.

### Opción B — TestFlight / App Store (cuenta de pago, $99/año)
1. En [App Store Connect](https://appstoreconnect.apple.com) crea la app con el
   bundle id `com.mrtpvrest.delivery`.
2. En Xcode: **Product → Archive** → **Distribute App** → **App Store Connect**.
3. La build aparece en App Store Connect → pestaña **TestFlight**. Invita a los
   repartidores por email; instalan vía la app **TestFlight**.
4. Para publicar en la App Store pública: completar ficha (capturas, descripción,
   política de privacidad — *obligatoria por usar ubicación*) y enviar a revisión.

> Apple revisa con lupa el permiso de ubicación "Always". Justifica claramente en
> la ficha de revisión que es para rastrear entregas activas del repartidor.

---

## 6. Iconos y splash

Capacitor generó placeholders en `ios/App/App/Assets.xcassets/`. Para los assets
finales de marca, usa [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

```bash
# Coloca icon.png (1024x1024) y splash.png (2732x2732) en apps/delivery/resources/
npx @capacitor/assets generate --ios
```

---

## 7. Scripts disponibles

| Script | Qué hace |
|---|---|
| `pnpm --filter @mrtpvrest/delivery build:ios` | Build web export + `cap sync ios`. |
| `pnpm --filter @mrtpvrest/delivery ios:sync` | Solo resincroniza `/out` → iOS (sin rebuild). |
| `pnpm --filter @mrtpvrest/delivery ios:open` | Abre el proyecto en Xcode. |
