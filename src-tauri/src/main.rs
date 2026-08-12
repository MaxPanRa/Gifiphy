// Evita que se abra una consola detras de la ventana en Windows release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gifiphy_lib::run()
}
