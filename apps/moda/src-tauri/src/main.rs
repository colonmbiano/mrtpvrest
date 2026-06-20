// Evita una ventana de consola en Windows en builds release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    moda_pos_lib::run()
}
