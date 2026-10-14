//! Lado nativo do Tanden Engine: dá à interface acesso à pasta do cofre.
//! A lógica de notas e merge vive em TypeScript (`@tanden/core`); aqui só
//! há leitura e escrita de arquivos, sempre presas dentro da pasta do cofre.

mod google;
mod ollama;
#[cfg(desktop)]
mod pty;
mod release;
mod vault;
mod watch;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(google::GoogleState::default())
        .setup(|app| {
            // atualização automática pelas releases do GitHub (só desktop)
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.manage(pty::Terminals::default());
            }
            // TANDEN_VAULT aponta para outra pasta (ex.: uma pasta sincronizada do Drive).
            let root = match std::env::var("TANDEN_VAULT") {
                Ok(p) => PathBuf::from(p),
                Err(_) => default_root(app)?,
            };
            std::fs::create_dir_all(&root)?;
            // sem o vigia o app funciona igual, só percebe mudanças externas no sync periódico
            match watch::start(app.handle().clone(), &root) {
                Ok(w) => {
                    app.manage(w);
                }
                Err(e) => eprintln!("vigia do cofre indisponível: {e}"),
            }
            app.manage(vault::VaultRoot(root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_root,
            vault::vault_list,
            vault::vault_read,
            vault::vault_write,
            vault::vault_remove,
            google::google_status,
            google::google_set_credentials,
            google::google_sign_in,
            google::google_access_token,
            google::google_sign_out,
            release::release_info,
            release::release_android_check,
            release::release_open_apk,
            ollama::ollama_models,
            ollama::ollama_chat,
            #[cfg(desktop)]
            pty::pty_spawn,
            #[cfg(desktop)]
            pty::pty_write,
            #[cfg(desktop)]
            pty::pty_resize,
            #[cfg(desktop)]
            pty::pty_kill
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Tanden Engine");
}

#[cfg(desktop)]
fn default_root(app: &tauri::App) -> tauri::Result<PathBuf> {
    Ok(app.path().home_dir()?.join("Tanden"))
}

#[cfg(mobile)]
fn default_root(app: &tauri::App) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("Tanden"))
}
