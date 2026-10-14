//! Janelas dos plugins. Cada plugin é uma página HTML servida por um endereço
//! próprio (`tplugin://localhost/<id>`), fora da origem do app: assim a página
//! não herda a política de segurança do app nem alcança os comandos nativos.
//! Ela só conversa com o app por mensagens, que a interface confere uma a uma
//! (`@tanden/core`, `PluginHost`).

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::http::{header, Request, Response, StatusCode};

pub const SCHEME: &str = "tplugin";
const LIMIT: usize = 16 * 1024 * 1024;

/// HTML pronto (já com o SDK) de cada plugin ativo, entregue pela interface.
#[derive(Default)]
pub struct Plugins(Mutex<HashMap<String, String>>);

fn valid_id(id: &str) -> bool {
    (2..=40).contains(&id.len())
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
}

#[tauri::command]
pub fn plugin_stage(state: tauri::State<'_, Plugins>, id: String, html: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("id de plugin inválido: {id}"));
    }
    if html.len() > LIMIT {
        return Err("plugin grande demais (mais de 16 MB)".into());
    }
    state.0.lock().map_err(|e| e.to_string())?.insert(id, html);
    Ok(())
}

#[tauri::command]
pub fn plugin_unstage(state: tauri::State<'_, Plugins>, id: String) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.remove(&id);
    Ok(())
}

/// Responde `tplugin://localhost/<id>`. O cabeçalho `sandbox` mantém a página
/// isolada mesmo que alguém a abra fora do <iframe sandbox> do app.
pub fn serve(plugins: &Plugins, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_matches('/').to_string();
    let html = plugins.0.lock().ok().and_then(|m| m.get(&id).cloned());
    let Some(html) = html else {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(b"plugin desconhecido".to_vec())
            .unwrap();
    };
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, "sandbox allow-scripts")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(html.into_bytes())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(p: &Plugins, uri: &str) -> Response<Vec<u8>> {
        serve(p, &Request::builder().uri(uri).body(Vec::new()).unwrap())
    }

    #[test]
    fn serve_so_o_que_foi_entregue() {
        let p = Plugins::default();
        p.0.lock().unwrap().insert("noticias".into(), "<p>oi</p>".into());
        let r = get(&p, "tplugin://localhost/noticias");
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.body(), b"<p>oi</p>");
        assert_eq!(r.headers()[header::CONTENT_SECURITY_POLICY], "sandbox allow-scripts");
        assert_eq!(get(&p, "http://tplugin.localhost/noticias?v=2").status(), StatusCode::OK);
        assert_eq!(get(&p, "tplugin://localhost/outro").status(), StatusCode::NOT_FOUND);
        assert_eq!(get(&p, "tplugin://localhost/../noticias").status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn ids_validos() {
        assert!(valid_id("noticias"));
        assert!(valid_id("bola-8"));
        assert!(!valid_id("a"));
        assert!(!valid_id("../x"));
        assert!(!valid_id("Maiuscula"));
        assert!(!valid_id("-x"));
    }
}
