//! Lado nativo do Tanden Engine: dá à interface acesso à pasta do cofre.
//! A lógica de notas e merge vive em TypeScript (`@tanden/core`); aqui só
//! há leitura e escrita de arquivos, sempre presas dentro da pasta do cofre.

#[cfg(desktop)]
mod background;
mod google;
mod ollama;
#[cfg(desktop)]
mod pty;
mod release;
mod vault;
mod watch;
mod web;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // abrir o app de novo traz de volta a janela que está na bandeja
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| background::show_main(app)));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(google::GoogleState::default())
        .setup(|app| {
            // atualização automática pelas releases do GitHub (só desktop)
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.manage(pty::Terminals::default());
                app.handle().plugin(tauri_plugin_autostart::Builder::new().arg(background::HIDDEN_ARG).build())?;
                app.manage(background::Background::default());
                background::setup(app)?;
                // clicar num aviso de lembrete abre a janela
                use tauri_plugin_notification::NotificationExt;
                let handle = app.handle().clone();
                app.notification().on_action(move |a| {
                    if a.action_id() == "tap" {
                        background::show_main(&handle);
                    }
                })?;
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
            vault::vault_read_raw,
            vault::vault_write_raw,
            vault::vault_stat,
            web::web_fetch,
            web::web_open,
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
            background::background_set,
            #[cfg(desktop)]
            vault::vault_open_external,
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
