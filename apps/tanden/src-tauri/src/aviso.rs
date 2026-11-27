//! As notificações da Ânima no computador.
//!
//! No Linux falamos direto com o servidor de notificações da área de trabalho
//! (`org.freedesktop.Notifications`, pelo D-Bus) em vez do plugin genérico,
//! para ela aparecer como as notificações do próprio sistema:
//!
//! - urgência crítica: passa pelo "não perturbe" (KDE e GNOME mostram as
//!   críticas mesmo com ele ligado) e não vai para o fim da fila;
//! - o rosto dela, com a expressão daquela fala, como imagem grande;
//! - "Responder" direto na notificação (no KDE, um campo de texto; nos outros,
//!   o botão abre a conversa) e "Abrir";
//! - uma notificação só por vez: a fala nova substitui a anterior em vez de
//!   empilhar.
//!
//! Fora do Linux o comando responde erro e a interface usa o plugin padrão.

#[cfg(target_os = "linux")]
mod linux {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Emitter, Runtime};
    use zbus::blocking::Connection;
    use zbus::zvariant::Value;

    const DEST: &str = "org.freedesktop.Notifications";
    const PATH: &str = "/org/freedesktop/Notifications";

    struct Estado {
        conn: Connection,
        /// id que o servidor deu a cada "vaga" (fala, saudade, timer...), para substituir
        vagas: Mutex<HashMap<String, u32>>,
    }

    static ESTADO: OnceLock<Option<Estado>> = OnceLock::new();

    fn estado<R: Runtime>(app: &AppHandle<R>) -> Option<&'static Estado> {
        ESTADO
            .get_or_init(|| {
                let conn = Connection::session().ok()?;
                escutar(app.clone(), conn.clone());
                Some(Estado { conn, vagas: Mutex::new(HashMap::new()) })
            })
            .as_ref()
    }

    /// Um id nosso? (o servidor manda os sinais de todo mundo)
    fn nosso(id: u32) -> bool {
        ESTADO
            .get()
            .and_then(|e| e.as_ref())
            .is_some_and(|e| e.vagas.lock().map(|v| v.values().any(|&x| x == id)).unwrap_or(false))
    }

    /// Clique e resposta vêm como sinais; viram eventos para a interface.
    fn escutar<R: Runtime>(app: AppHandle<R>, conn: Connection) {
        std::thread::spawn(move || {
            let Ok(regra) = zbus::MatchRule::builder()
                .msg_type(zbus::message::Type::Signal)
                .interface(DEST)
                .map(|b| b.build())
            else {
                return;
            };
            let Ok(it) = zbus::blocking::MessageIterator::for_match_rule(regra, &conn, Some(16)) else { return };
            for msg in it.flatten() {
                let h = msg.header();
                let Some(membro) = h.member().map(|m| m.to_string()) else { continue };
                match membro.as_str() {
                    "ActionInvoked" => {
                        let Ok((id, acao)) = msg.body().deserialize::<(u32, String)>() else { continue };
                        if !nosso(id) {
                            continue;
                        }
                        crate::background::show_main(&app);
                        let tipo = if acao == "inline-reply" { "conversa" } else { "abrir" };
                        let _ = app.emit("anima-aviso", serde_json::json!({ "acao": tipo }));
                    }
                    "NotificationReplied" => {
                        let Ok((id, texto)) = msg.body().deserialize::<(u32, String)>() else { continue };
                        if nosso(id) && !texto.trim().is_empty() {
                            let _ = app.emit("anima-aviso", serde_json::json!({ "acao": "resposta", "texto": texto }));
                        }
                    }
                    _ => {}
                }
            }
        });
    }

    /// Os poucos marcadores que o corpo aceita; o resto vira texto.
    fn escapar(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }

    pub fn enviar<R: Runtime>(
        app: &AppHandle<R>,
        vaga: &str,
        titulo: &str,
        corpo: &str,
        imagem: Option<&std::path::Path>,
        responder: bool,
    ) -> Result<(), String> {
        let e = estado(app).ok_or("sem D-Bus")?;
        let anterior = e.vagas.lock().ok().and_then(|v| v.get(vaga).copied()).unwrap_or(0);
        let icone = imagem.map(|p| format!("file://{}", p.display())).unwrap_or_else(|| "dev.tanden.engine".into());
        let mut acoes: Vec<&str> = vec!["default", "Abrir"];
        if responder {
            acoes.extend(["inline-reply", "Responder"]);
        }
        let mut hints: HashMap<&str, Value> = HashMap::new();
        hints.insert("urgency", Value::U8(2));
        hints.insert("category", Value::from("im.received"));
        hints.insert("sound-name", Value::from("message-new-instant"));
        hints.insert("x-kde-origin-name", Value::from("Tanden"));
        hints.insert("x-kde-reply-placeholder-text", Value::from("responder pra ela…"));
        hints.insert("x-kde-reply-submit-button-text", Value::from("Enviar"));
        if let Some(p) = imagem {
            hints.insert("image-path", Value::from(format!("file://{}", p.display())));
        }
        let corpo = escapar(corpo);
        let r = e.conn.call_method(
            Some(DEST),
            PATH,
            Some(DEST),
            "Notify",
            &("Ânima", anterior, icone.as_str(), titulo, corpo.as_str(), acoes, hints, 20_000i32),
        );
        let id: u32 = r.map_err(|x| x.to_string())?.body().deserialize().map_err(|x| x.to_string())?;
        if let Ok(mut v) = e.vagas.lock() {
            v.insert(vaga.to_string(), id);
        }
        Ok(())
    }
}

/// Mostra uma fala dela como notificação do sistema. `imagem` é o rosto em PNG
/// (base64), guardado em cache por `chave` (a expressão). Erro = use o plugin.
#[tauri::command]
pub fn anima_notificar<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    vaga: String,
    titulo: String,
    corpo: String,
    chave: Option<String>,
    imagem: Option<String>,
    responder: bool,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use base64::Engine;
        use tauri::Manager;
        let caminho = match (chave, imagem) {
            (Some(k), img) => {
                let k: String = k.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
                let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("anima");
                let p = dir.join(format!("{k}.png"));
                if let Some(b64) = img {
                    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
                }
                p.exists().then_some(p)
            }
            _ => None,
        };
        linux::enviar(&app, &vaga, &titulo, &corpo, caminho.as_deref(), responder)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, vaga, titulo, corpo, chave, imagem, responder);
        Err("só no Linux".into())
    }
}
