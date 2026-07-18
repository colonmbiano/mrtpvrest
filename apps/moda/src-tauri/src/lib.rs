// Punto de entrada de la app de escritorio (Windows) de MRTPV Retail.

use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

// Impresión térmica ESC/POS por TCP (puerto 9100 / RAW-JetDirect).
// El front (lib/printer.ts) genera los bytes ESC/POS y los manda con
// `invoke("print_escpos", { host, port, bytes })`.
#[tauri::command]
fn print_escpos(host: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    let addr = format!("{host}:{port}");
    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("conexión a {addr}: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(6)))
        .ok();
    stream
        .write_all(&bytes)
        .map_err(|e| format!("envío: {e}"))?;
    stream.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // OTA de escritorio: el front llama a `check()` del plugin updater al
        // arrancar; descarga e instala el nuevo instalador firmado y relanza.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![print_escpos])
        .run(tauri::generate_context!())
        .expect("error al ejecutar MRTPV Retail");
}
