#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn load_windows_system_font(family: String) -> Option<Vec<u8>> {
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let file = match family.as_str() {
        "serif" => "times.ttf",
        "mono" => "cour.ttf",
        "calibri" => "calibri.ttf",
        _ => "arial.ttf",
    };
    let path = PathBuf::from(windir).join("Fonts").join(file);
    fs::read(path).ok()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_windows_system_font])
        .run(tauri::generate_context!())
        .expect("Erro ao executar o shell Tauri v2 do PDF Studio Free");
}
