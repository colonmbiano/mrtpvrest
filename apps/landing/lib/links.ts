// lib/links.ts
// Fuente única de verdad para enlaces de descarga, ventas y páginas de función.
//
// Bandera maestra: déjala en `false` mientras NO existan los APK release publicados
// en `public/apks/`. Con `false`, los botones de descarga se convierten en
// "Solicitar acceso" (ver `app/_components/DownloadButton.tsx`) en vez de enlazar a
// un archivo inexistente. Ponla en `true` cuando los binarios firmados estén en
// `public/apks/` con los nombres de `APKS` (ver Tarea E del checklist de release).
export const DOWNLOADS_READY = false

// WhatsApp de ventas. Reemplaza por el número real en formato wa.me (sin "+").
// Mientras no haya número real, el fallback de DownloadButton usa el registro.
export const WHATSAPP_SALES = 'https://wa.me/52XXXXXXXXXX'

// APK servidos ESTÁTICAMENTE desde el sitio público (public/apks/...),
// NO desde admin.mrtpvrest.com (el admin no sirve estos archivos a anónimos).
export const APKS = {
  tpv: '/apks/mrtpvrest-tpv.apk',
  kiosko: '/apks/mrtpvrest-kiosko.apk',
  kds: '/apks/mrtpvrest-kds.apk',
  delivery: '/apks/mrtpvrest-delivery.apk',
  meserosLite: '/apks/mrtpvrest-meseros-lite.apk',
} as const

// Páginas de función existentes (para que las tarjetas del ecosistema naveguen,
// NO descarguen ni caigan en el login del admin).
export const FUNCIONES = {
  tpv: '/funciones/punto-de-venta',
  asistente: '/funciones/asistente-de-voz',
  kds: '/funciones/kds-cocina',
  delivery: '/funciones/delivery',
  kiosko: '/funciones/kiosko',
  appCliente: '/funciones/app-cliente',
  admin: '/funciones/administracion',
} as const
