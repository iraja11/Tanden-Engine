//! Segundo plano no computador: o Tanden fica na bandeja ao fechar a janela,
//! para os lembretes continuarem avisando. Abrir o app de novo (ou clicar no
//! ícone da bandeja, ou num aviso) traz a janela de volta.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, State, WindowEvent};

/// Argumento que o início automático com o sistema passa: abre direto na bandeja.
pub const HIDDEN_ARG: &str = "--hidden";

pub struct Background {
    /// a interface liga/desliga em Lembretes → "Rodar em segundo plano"
    enabled: AtomicBool,
    /// sem bandeja, esconder a janela deixaria o app inalcançável
    tray: AtomicBool,
}

impl Default for Background {
    fn default() -> Self {
        Self { enabled: AtomicBool::new(true), tray: AtomicBool::new(false) }
    }
}

impl Background {
    fn hides_on_close(&self) -> bool {
        self.enabled.load(Ordering::Relaxed) && self.tray.load(Ordering::Relaxed)
    }
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Cria a bandeja e decide se a janela abre visível.
pub fn setup<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let handle = app.handle();
    let open = MenuItem::with_id(handle, "open", "Abrir o Tanden", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("tanden")
        .tooltip("Tanden Engine")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    let state = app.state::<Background>();
    match tray.build(handle) {
        Ok(_) => state.tray.store(true, Ordering::Relaxed),
        Err(e) => eprintln!("bandeja indisponível, fechar a janela encerra o app: {e}"),
    }

    let started_hidden = std::env::args().any(|a| a == HIDDEN_ARG) && state.hides_on_close();
    if let Some(w) = app.get_webview_window("main") {
        if started_hidden {
            w.hide()?;
        }
        let app = handle.clone();
        w.on_window_event(move |e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                if app.state::<Background>().hides_on_close() {
                    api.prevent_close();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub fn background_set(state: State<'_, Background>, enabled: bool) -> bool {
    state.enabled.store(enabled, Ordering::Relaxed);
    state.tray.load(Ordering::Relaxed)
}
