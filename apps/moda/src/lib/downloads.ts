// Enlaces de descarga de la app de caja (para instalar el POS en una PC Windows
// o tablet/celular Android). Hosting: GitHub Releases (público).
//
// ── Por qué la versión NO se escribe a mano aquí ─────────────────────────────
// El release de Windows lo publica `.github/workflows/moda-windows-release.yml`
// con tauri-action, que toma la versión de `src-tauri/tauri.conf.json` y nombra
// TAG y ASSET con ella (moda-v1.0.2 / MODA+.Retail_1.0.2_x64-setup.exe). Como
// aquí estaba duplicada a mano, se quedó clavada en 1.0.0 mientras el release ya
// iba en 1.0.1: la pantalla /admin/descargas sirvió un instalador atrasado casi
// un mes. Derivarla de la misma fuente que el workflow cierra esa clase de bug.
//
// ⚠️ ORDEN DE PUBLICACIÓN: esta página anuncia la versión que declara
// tauri.conf.json, exista o no el release. Al mergear a master, Vercel despliega
// esto de inmediato ⇒ **taggear `moda-v<version>` justo después del merge**, o el
// enlace apunta a un release que todavía no existe (404) hasta que el tag corra.
//
// El Android no sufre esto: usa tag y asset ESTABLES (moda-apk-latest /
// mrtpv-moda.apk), así que el enlace nunca cambia y siempre trae el último APK.
import tauriConf from "../../src-tauri/tauri.conf.json";

const REPO = "https://github.com/colonmbiano/mrtpvrest/releases/download";

/** Fuente única de la versión de escritorio: la misma que lee el workflow. */
export const WINDOWS_VERSION: string = tauriConf.version;

export interface DownloadTarget {
  platform: "windows" | "android";
  label: string;
  version: string;
  /** Aproximado: el tamaño real solo se conoce al compilar. Solo es orientativo
   *  para que el cajero sepa que no es una descarga pesada. */
  size: string;
  url: string;
  hint: string;
}

export const DOWNLOADS: DownloadTarget[] = [
  {
    platform: "windows",
    label: "Windows (PC / caja)",
    version: WINDOWS_VERSION,
    size: "~3.6 MB",
    // El asset lleva la versión en el nombre y el "+" va escapado (%2B).
    url: `${REPO}/moda-v${WINDOWS_VERSION}/MODA%2B.Retail_${WINDOWS_VERSION}_x64-setup.exe`,
    hint: "Instalador .exe. Doble clic y listo. Se actualiza sola.",
  },
  {
    platform: "android",
    label: "Android (tablet / celular)",
    // Tag estable: el APK se re-sube ahí en cada release, así que no hay número
    // de versión fijo que anunciar sin mentir. Antes decía "1.0.0" fijo.
    version: "última",
    size: "~6.7 MB",
    url: `${REPO}/moda-apk-latest/mrtpv-moda.apk`,
    hint: "Archivo .apk. Permite “instalar de orígenes desconocidos” al abrirlo.",
  },
];
