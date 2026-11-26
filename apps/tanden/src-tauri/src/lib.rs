//! Lado nativo do Tanden Engine: dá à interface acesso à pasta do cofre.
//! A lógica de notas e merge vive em TypeScript (`@tanden/core`); aqui só
//! há leitura e escrita de arquivos, sempre presas dentro da pasta do cofre.

#[cfg(desktop)]
mod background;
#[cfg(desktop)]
mod clipper;
mod google;
#[cfg(desktop)]
mod janela;
#[cfg(desktop)]
mod minecraft;
#[cfg(desktop)]
mod musica;
mod ollama;
mod plugin;
#[cfg(desktop)]
mod pty;
mod release;
#[cfg(desktop)]
mod steam;
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
    // no celular, a volta do login do Google chega por deep link
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_deep_link::init());
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(google::GoogleState::default())
        .manage(plugin::Plugins::default())
        // janelas dos plugins, fora da origem do app
        .register_uri_scheme_protocol(plugin::SCHEME, |ctx, request| {
            use tauri::Manager;
            plugin::serve(&ctx.app_handle().state::<plugin::Plugins>(), &request)
        })
        .setup(|app| {
            // atualização automática pelas releases do GitHub (só desktop)
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.manage(pty::Terminals::default());
                app.handle().plugin(tauri_plugin_autostart::Builder::new().arg(background::HIDDEN_ARG).build())?;
                app.manage(background::Background::default());
                app.manage(steam::SteamCache::default());
                app.manage(minecraft::Ponte::default());
                background::setup(app)?;
                // clicar num aviso de lembrete abre a janela
                use tauri_plugin_notification::NotificationExt;
                let handle = app.handle().clone();
                app.notification().on_action(move |a| {
                    if a.action_id() == "tap" {
                        background::show_main(&handle);
                    }
                })?;
                // recortador do navegador: o favorito manda a página para cá
                let token = clipper::load_token(&app.path().app_data_dir()?);
                let handle = app.handle().clone();
                let port = clipper::start(token.clone(), move |req| {
                    use tauri::Emitter;
                    let _ = handle.emit("clip-request", req);
                    background::show_main(&handle);
                });
                app.manage(clipper::ClipperInfo { port: port.unwrap_or(clipper::PORT), token, running: port.is_some() });
            }
            #[cfg(mobile)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |e| {
                    for url in e.urls() {
                        google::handle_deep_link(&handle, &url);
                    }
                });
                // o app foi aberto do zero pela volta do login (o Android tinha fechado ele)
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in urls {
                        google::handle_deep_link(app.handle(), &url);
                    }
                }
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
            vault::vault_write_b64,
            vault::vault_stat,
            web::web_fetch,
            web::web_open,
            plugin::plugin_stage,
            plugin::plugin_unstage,
            google::google_status,
            google::google_set_credentials,
            google::google_sign_in,
            google::google_access_token,
            google::google_sign_out,
            google::google_finish_url,
            google::google_cancel,
            release::release_info,
            release::release_android_check,
            release::release_open_apk,
            ollama::ollama_models,
            ollama::ollama_chat,
            #[cfg(desktop)]
            background::background_set,
            #[cfg(desktop)]
            steam::steam_jogo,
            #[cfg(desktop)]
            janela::janela_ativa,
            #[cfg(desktop)]
            musica::musica_tocando,
            #[cfg(desktop)]
            minecraft::minecraft_ligar,
            #[cfg(desktop)]
            minecraft::minecraft_enviar,
            #[cfg(desktop)]
            clipper_info,
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

/// Porta e chave do recortador, para a interface montar o favorito.
#[cfg(desktop)]
#[tauri::command]
fn clipper_info(info: tauri::State<'_, clipper::ClipperInfo>) -> clipper::ClipperInfo {
    info.inner().clone()
}

#[cfg(desktop)]
fn default_root(app: &tauri::App) -> tauri::Result<PathBuf> {
    Ok(app.path().home_dir()?.join("Tanden"))
}

#[cfg(mobile)]
fn default_root(app: &tauri::App) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("Tanden"))
}
