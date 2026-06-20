// Enlaces de descarga de la app de caja MODA+ (para instalar el POS en una PC
// Windows o tablet/celular Android). Hosting: GitHub Releases (público).
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
    url: "https://github.com/colonmbiano/mrtpvrest/releases/download/moda-apk-latest/mrtpv-moda.apk",
    hint: "Archivo .apk. Permite “instalar de orígenes desconocidos” al abrirlo.",
  },
];
