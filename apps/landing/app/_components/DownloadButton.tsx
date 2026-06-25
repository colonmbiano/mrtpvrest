import { DOWNLOADS_READY } from '../../lib/links'
import { registerUrl } from '../_data/site'

type DownloadButtonProps = {
  apkUrl: string
  label: string
  // Texto cuando aún no hay binarios publicados (DOWNLOADS_READY === false).
  requestLabel?: string
  // Clase del ancla. Vacío/undefined para heredar el estilo del contenedor
  // (p.ej. la fila `.apk-downloads a`); "btn btn-line" para botón suelto.
  className?: string
}

// Botón de descarga con degradación honesta: si los APK release no están
// publicados, NO enlaza a un archivo inexistente; ofrece "Solicitar acceso".
export function DownloadButton({
  apkUrl,
  label,
  requestLabel = 'Solicitar acceso',
  className,
}: DownloadButtonProps) {
  if (!DOWNLOADS_READY) {
    return (
      <a className={className} href={registerUrl}>
        {requestLabel}
      </a>
    )
  }
  return (
    <a className={className} href={apkUrl} download>
      {label}
    </a>
  )
}
