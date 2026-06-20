// Punto de entrada de la app de escritorio (Windows) de MODA+.
//
// TODO(impresión nativa): agregar un comando para imprimir recibo y etiqueta de SKU
// por ESC/POS. El front lo invoca con `import { invoke } from "@tauri-apps/api/core"`.
//
//   #[tauri::command]
//   fn print_receipt(host: String, payload: String) -> Result<(), String> {
//       // Abrir TCP a `host:9100` y mandar los bytes ESC/POS de `payload`.
//       Ok(())
//   }
//
// y registrarlo con `.invoke_handler(tauri::generate_handler![print_receipt])`.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error al ejecutar MODA+ Retail");
}
