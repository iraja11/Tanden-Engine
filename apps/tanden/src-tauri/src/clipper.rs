//! Recortador do navegador: um favorito ("bookmarklet") manda a página aberta
//! no navegador para o Tanden, como a extensão Web Clipper do Obsidian.
//!
//! O app escuta só em 127.0.0.1. Cada aparelho tem uma chave própria que vai
//! dentro do favorito; pedidos sem ela são recusados, então um site qualquer
//! não consegue gravar nada no cofre. A página chega como o navegador mostrou
//! (serve até para páginas que pedem login), junto com o trecho selecionado.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use rand::RngCore;
use serde::{Deserialize, Serialize};

/// Porta fixa: o favorito guarda o endereço. Se estiver ocupada, tenta as próximas.
pub const PORT: u16 = 27183;
/// Páginas grandes (com imagens embutidas) passam; mais que isso é recusado.
const MAX_BODY: usize = 24 * 1024 * 1024;

#[derive(Clone, Serialize)]
pub struct ClipperInfo {
    pub port: u16,
    pub token: String,
    pub running: bool,
}

#[derive(Deserialize)]
struct Incoming {
    token: String,
    url: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    html: String,
    #[serde(default)]
    selection: String,
}

/// O que a interface recebe no evento `clip-request`.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct ClipRequest {
    pub url: String,
    pub title: String,
    pub html: String,
    pub selection: String,
}

/// Chave deste aparelho, criada na primeira vez.
pub fn load_token(dir: &Path) -> String {
    let file = dir.join("clipper-token");
    if let Ok(t) = std::fs::read_to_string(&file) {
        let t = t.trim().to_string();
        if t.len() >= 16 {
            return t;
        }
    }
    let mut b = [0u8; 18];
    rand::thread_rng().fill_bytes(&mut b);
    let t: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(&file, &t);
    t
}

/// Compara sem parar no primeiro byte diferente.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn http_url(u: &str) -> bool {
    url::Url::parse(u).map(|x| x.scheme() == "http" || x.scheme() == "https").unwrap_or(false)
}

const CORS: &str = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Private-Network: true\r\n";

fn respond(stream: &mut TcpStream, status: &str, kind: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\n{CORS}Content-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn page(msg: &str, ok: bool) -> String {
    let color = if ok { "#ff8a3d" } else { "#e5484d" };
    // fecha sozinha quando foi aberta pelo favorito
    format!(
        "<!doctype html><meta charset=utf-8><title>Tanden</title><body style=\"background:#0c0c0e;color:#ecebf0;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h2 style=\"color:{color}\">{msg}</h2><p>Pode fechar esta aba.</p></div><script>setTimeout(()=>window.close(),1500)</script></body>"
    )
}

/// Trata um pedido. Devolve o recorte quando ele é válido.
fn handle(stream: &mut TcpStream, token: &str) -> Option<ClipRequest> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next()?.to_string(), parts.next()?.to_string());
    let mut length = 0usize;
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).ok()? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0);
            }
        }
    }
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    match (method.as_str(), url.path()) {
        ("OPTIONS", _) => {
            respond(stream, "204 No Content", "text/plain", "");
            None
        }
        ("GET", "/ping") => {
            respond(stream, "200 OK", "application/json", "{\"app\":\"tanden\"}");
            None
        }
        ("POST", "/clip") => {
            if length == 0 || length > MAX_BODY {
                respond(stream, "413 Payload Too Large", "application/json", "{\"ok\":false,\"erro\":\"página grande demais\"}");
                return None;
            }
            let mut body = vec![0u8; length];
            reader.read_exact(&mut body).ok()?;
            let req: Incoming = match serde_json::from_slice(&body) {
                Ok(r) => r,
                Err(_) => {
                    respond(stream, "400 Bad Request", "application/json", "{\"ok\":false}");
                    return None;
                }
            };
            if !same(&req.token, token) || !http_url(&req.url) {
                respond(stream, "403 Forbidden", "application/json", "{\"ok\":false,\"erro\":\"chave errada: copie o favorito de novo no Tanden\"}");
                return None;
            }
            respond(stream, "200 OK", "application/json", "{\"ok\":true}");
            Some(ClipRequest { url: req.url, title: req.title, html: req.html, selection: req.selection })
        }
        ("GET", "/clip") => {
            // plano B do favorito, quando o site bloqueia o envio: só o endereço e a seleção
            let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned()).unwrap_or_default();
            if !same(&get("token"), token) || !http_url(&get("url")) {
                respond(stream, "403 Forbidden", "text/html; charset=utf-8", &page("Chave errada: copie o favorito de novo no Tanden", false));
                return None;
            }
            respond(stream, "200 OK", "text/html; charset=utf-8", &page("Enviado ao Tanden ✓", true));
            Some(ClipRequest { url: get("url"), title: get("title"), html: String::new(), selection: get("sel") })
        }
        _ => {
            respond(stream, "404 Not Found", "text/plain", "");
            None
        }
    }
}

/// Abre a porta e chama `on_clip` a cada recorte válido. Devolve a porta usada.
pub fn start(token: String, on_clip: impl Fn(ClipRequest) + Send + Sync + 'static) -> Option<u16> {
    let (listener, port) = (PORT..PORT + 5).find_map(|p| TcpListener::bind(("127.0.0.1", p)).ok().map(|l| (l, p)))?;
    let on_clip = Arc::new(on_clip);
    let token = Arc::new(token);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (on_clip, token) = (on_clip.clone(), token.clone());
            std::thread::spawn(move || {
                let mut stream = stream;
                if let Some(req) = handle(&mut stream, &token) {
                    on_clip(req);
                }
            });
        }
    });
    Some(port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn send(port: u16, raw: &[u8]) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(raw).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn recebe_recortes_so_com_a_chave() {
        let (tx, rx) = mpsc::channel();
        let tx = std::sync::Mutex::new(tx);
        let port = start("chave-certa-123456".into(), move |r| tx.lock().unwrap().send(r).unwrap()).unwrap();

        let body = r#"{"token":"chave-certa-123456","url":"https://site.com/a","title":"A","html":"<p>oi</p>","selection":"oi"}"#;
        let res = send(port, format!("POST /clip HTTP/1.1\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{body}", body.len()).as_bytes());
        assert!(res.starts_with("HTTP/1.1 200"), "{res}");
        assert!(res.contains("Access-Control-Allow-Origin: *"));
        let got = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(got, ClipRequest { url: "https://site.com/a".into(), title: "A".into(), html: "<p>oi</p>".into(), selection: "oi".into() });

        let bad = r#"{"token":"outra","url":"https://site.com/a"}"#;
        let res = send(port, format!("POST /clip HTTP/1.1\r\nContent-Length: {}\r\n\r\n{bad}", bad.len()).as_bytes());
        assert!(res.starts_with("HTTP/1.1 403"), "{res}");

        let res = send(port, b"GET /clip?token=chave-certa-123456&url=https%3A%2F%2Fx.dev%2Fb&sel=um%20trecho HTTP/1.1\r\n\r\n");
        assert!(res.contains("Enviado ao Tanden"));
        let got = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!((got.url.as_str(), got.selection.as_str(), got.html.as_str()), ("https://x.dev/b", "um trecho", ""));

        // javascript: e afins não entram
        let res = send(port, b"GET /clip?token=chave-certa-123456&url=javascript%3Aalert(1) HTTP/1.1\r\n\r\n");
        assert!(res.starts_with("HTTP/1.1 403"));
        assert!(send(port, b"OPTIONS /clip HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 204"));
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
    }

    #[test]
    fn guarda_a_chave_do_aparelho() {
        let dir = tempfile::tempdir().unwrap();
        let a = load_token(dir.path());
        assert_eq!(a.len(), 36);
        assert_eq!(load_token(dir.path()), a);
    }
}
