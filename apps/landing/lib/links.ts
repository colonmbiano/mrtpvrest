// lib/links.ts
// Fuente única de verdad para enlaces de descarga, ventas y páginas de función.

// WhatsApp de ventas (formato wa.me, sin "+").
export const WHATSAPP_SALES = 'https://wa.me/5218148150200'

// Enlace de ventas con mensaje prellenado para que el prospecto no llegue en frío.
export const WHATSAPP_SALES_DEMO = `${WHATSAPP_SALES}?text=${encodeURIComponent(
  'Hola, quiero una demo de MRTPVREST para mi restaurante.',
)}`

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
// agrega la URL aquí SOLO cuando el .apk release firmado esté en public/apks; si no,
// DownloadButton degrada a "Solicitar acceso" (sin enlaces muertos).
// Las 5 apps tienen pipeline de release firmado en CI (assembleRelease + keystore):
//   TPV                              → build-android-apk-release.yml  (run 28215708538)
//   KDS/Delivery/Meseros Lite/Kiosk  → build-android-apks-release.yml (run 28216454498)
export const READY_APKS: string[] = [
  APKS.tpv,
  APKS.kds,
  APKS.delivery,
  APKS.meserosLite,
  APKS.kiosko,
]

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
