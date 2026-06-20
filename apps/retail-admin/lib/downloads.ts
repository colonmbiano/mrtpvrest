// Enlaces de descarga de la app de caja MODA+ (para que una tienda nueva instale
// el POS en su PC Windows o tablet/celular Android).
//
// Hosting: GitHub Releases (público por defecto, URL directa). Si en su lugar
// usas Google Drive, reemplaza la `url` por el enlace de descarga directa de
// Drive (con el archivo compartido como "cualquiera con el enlace").
//
// Drive: el enlace de "compartir" (…/file/d/<ID>/view) NO descarga directo;
// usa el formato: https://drive.google.com/uc?export=download&id=<ID>

export interface DownloadTarget {
  platform: "windows" | "android";
  label: string;
  version: string;
  size: string;
  url: string;
  hint: string;
}

export const DOWNLOADS: DownloadTarget[] = [
  {
    platform: "windows",
    label: "Windows (PC / caja)",
    version: "1.0.0",
    size: "3.7 MB",
    url: "https://github.com/colonmbiano/mrtpvrest/releases/download/moda-v1.0.0/MODA%2B.Retail_1.0.0_x64-setup.exe",
    hint: "Instalador .exe. Doble clic y listo. Se actualiza sola.",
  },
  {
    platform: "android",
    label: "Android (tablet / celular)",
    version: "1.0.0",
    size: "6.7 MB",
    // TODO: reemplazar por la URL del APK release una vez publicado.
    url: "https://github.com/colonmbiano/mrtpvrest/releases/download/moda-apk-latest/mrtpv-moda.apk",
    hint: "Archivo .apk. Permite “instalar de orígenes desconocidos” al abrirlo.",
  },
];
