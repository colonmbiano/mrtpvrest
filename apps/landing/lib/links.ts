// lib/links.ts
// Fuente única de verdad para enlaces de descarga, ventas y páginas de función.

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

// APK release (FIRMADOS) ya publicados en public/apks. Es per-app a propósito:
// solo el TPV tiene pipeline de release firmado en CI hoy
// (.github/workflows/build-android-apk-release.yml). KDS/Delivery/Meseros Lite
// solo tienen build DEBUG en CI, y Kiosko ninguno — NO se publican como release.
// Agrega la URL aquí SOLO cuando el .apk release firmado esté en public/apks;
// si no está listo, DownloadButton degrada a "Solicitar acceso" (sin enlaces muertos).
export const READY_APKS: string[] = []

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
