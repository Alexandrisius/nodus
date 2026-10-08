// Прячем консоль в release-сборке (Windows): оболочка — GUI-приложение.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nodus_desktop_lib::run()
}
