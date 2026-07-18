// Versión de la app, en un solo lugar. Sale de src-tauri/tauri.conf.json, que es
// la fuente que usa el CI para nombrar el release y el tag (misma que downloads.ts):
// el bundle web se compila junto con el binario, así que esta constante SIEMPRE
// refleja la versión que está corriendo — antes y después de una actualización OTA.
import tauriConf from "../../src-tauri/tauri.conf.json";

export const APP_VERSION: string = tauriConf.version;
