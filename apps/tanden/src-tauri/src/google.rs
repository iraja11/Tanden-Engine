//! Login Google para apps instalados (OAuth 2 com PKCE e redirecionamento local).
//!
//! 1. Abre o navegador na tela de consentimento do Google.
//! 2. Escuta em 127.0.0.1:<porta aleatória> o retorno com o código.
//! 3. Troca o código por tokens e guarda o refresh token só neste aparelho.
//!
//! O token de acesso nunca é salvo em disco; é renovado quando expira.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// drive.file: o app só enxerga os arquivos que ele mesmo criou no seu Drive.
const SCOPES: &str = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Credentials {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    credentials: Option<Credentials>,
    refresh_token: Option<String>,
    email: Option<String>,
}

#[derive(Default)]
pub struct GoogleState {
    access: Mutex<Option<(String, Instant)>>,
}

#[derive(Serialize)]
pub struct Status {
    configured: bool,
    signed_in: bool,
    email: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    id_token: Option<String>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("google.json"))
}

fn load(app: &AppHandle) -> Stored {
    store_path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, s: &Stored) -> Result<(), String> {
    let path = store_path(app)?;
    std::fs::write(&path, serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Credencial embutida no build (GitHub Actions) ou a que você colou no app.
fn credentials(stored: &Stored) -> Option<Credentials> {
    if let Some(c) = &stored.credentials {
        if !c.client_id.is_empty() {
            return Some(c.clone());
        }
    }
    match (option_env!("TANDEN_GOOGLE_CLIENT_ID"), option_env!("TANDEN_GOOGLE_CLIENT_SECRET")) {
        (Some(id), Some(secret)) if !id.is_empty() => Some(Credentials { client_id: id.into(), client_secret: secret.into() }),
        _ => None,
    }
}

/// Chama o endpoint de token e traduz os erros mais comuns.
async fn token_request(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let res = reqwest::Client::new().post(TOKEN_URL).form(form).send().await.map_err(|e| format!("sem conexão com o Google: {e}"))?;
    if res.status().is_success() {
        return res.json().await.map_err(|e| e.to_string());
    }
    let body = res.text().await.unwrap_or_default();
    Err(if body.contains("invalid_client") {
        "o Google recusou a credencial: confira o Client ID e o Client secret".into()
    } else if body.contains("invalid_grant") {
        "o acesso expirou ou foi revogado: entre com o Google de novo".into()
    } else {
        format!("o Google recusou o login: {body}")
    })
}

fn random_b64(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}

/// Lê o e-mail de dentro do id_token (JWT); não precisa validar, veio direto do Google por HTTPS.
fn email_from_id_token(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let json: serde_json::Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).ok()?).ok()?;
    json.get("email")?.as_str().map(String::from)
}

/// Espera o navegador voltar com ?code=…&state=… e responde uma página simples.
fn wait_for_code(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    listener.set_nonblocking(false).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if Instant::now() > deadline {
            return Err("tempo esgotado esperando o login".into());
        }
        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line).map_err(|e| e.to_string())?;
        let target = line.split_whitespace().nth(1).unwrap_or("/");
        let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|e| e.to_string())?;
        let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
        let (code, state, error) = (get("code"), get("state"), get("error"));
        if code.is_none() && error.is_none() {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
            continue; // ex.: favicon
        }
        let ok = code.is_some() && state.as_deref() == Some(expected_state);
        let body = if ok {
            "<html><body style=\"background:#0c0c0e;color:#ecebf0;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\"><div><h2 style=\"color:#ff8a3d\">Login recebido</h2><p>Pode fechar esta aba e voltar ao Tanden.</p></div></body></html>"
        } else {
            "<html><body style=\"background:#0c0c0e;color:#ecebf0;font-family:sans-serif\"><h2>Login cancelado ou inválido.</h2><p>Volte ao Tanden e tente de novo.</p></body></html>"
        };
        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
        return match (ok, code, error) {
            (true, Some(c), _) => Ok(c),
            (_, _, Some(e)) => Err(format!("o Google recusou: {e}")),
            _ => Err("resposta de login inválida".into()),
        };
    }
}

#[tauri::command]
pub fn google_status(app: AppHandle) -> Status {
    let s = load(&app);
    Status { configured: credentials(&s).is_some(), signed_in: s.refresh_token.is_some(), email: s.email }
}

#[tauri::command]
pub fn google_set_credentials(app: AppHandle, client_id: String, client_secret: String) -> Result<(), String> {
    let mut s = load(&app);
    s.credentials = Some(Credentials { client_id: client_id.trim().into(), client_secret: client_secret.trim().into() });
    save(&app, &s)
}

#[tauri::command]
pub async fn google_sign_in(app: AppHandle, state: State<'_, GoogleState>) -> Result<Status, String> {
    let mut stored = load(&app);
    let creds = credentials(&stored).ok_or("falta a credencial do Google (client ID)")?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
    let verifier = random_b64(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let csrf = random_b64(16);
    let mut auth = url::Url::parse(AUTH_URL).unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", &creds.client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", &format!("openid email {SCOPES}"))
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &csrf);
    app.opener().open_url(auth.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(listener, &csrf))
        .await
        .map_err(|e| e.to_string())??;

    let res = token_request(&[
        ("code", code.as_str()),
        ("client_id", &creds.client_id),
        ("client_secret", &creds.client_secret),
        ("redirect_uri", &redirect),
        ("grant_type", "authorization_code"),
        ("code_verifier", &verifier),
    ])
    .await?;

    stored.refresh_token = res.refresh_token.or(stored.refresh_token);
    stored.email = res.id_token.as_deref().and_then(email_from_id_token);
    save(&app, &stored)?;
    *state.access.lock().unwrap() = Some((res.access_token, Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60))));
    Ok(google_status(app))
}

#[tauri::command]
pub async fn google_access_token(app: AppHandle, state: State<'_, GoogleState>) -> Result<String, String> {
    if let Some((tok, until)) = state.access.lock().unwrap().clone() {
        if Instant::now() < until {
            return Ok(tok);
        }
    }
    let stored = load(&app);
    let creds = credentials(&stored).ok_or("falta a credencial do Google")?;
    let refresh = stored.refresh_token.ok_or("não conectado ao Google")?;
    let res = token_request(&[
        ("client_id", creds.client_id.as_str()),
        ("client_secret", &creds.client_secret),
        ("refresh_token", &refresh),
        ("grant_type", "refresh_token"),
    ])
    .await?;
    let tok = res.access_token.clone();
    *state.access.lock().unwrap() = Some((res.access_token, Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60))));
    Ok(tok)
}

#[tauri::command]
pub fn google_sign_out(app: AppHandle, state: State<'_, GoogleState>) -> Result<(), String> {
    let mut s = load(&app);
    s.refresh_token = None;
    s.email = None;
    *state.access.lock().unwrap() = None;
    save(&app, &s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_o_email_do_id_token() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"girlene@example.com"}"#);
        assert_eq!(email_from_id_token(&format!("x.{payload}.y")).as_deref(), Some("girlene@example.com"));
    }

    #[test]
    fn recebe_o_codigo_do_navegador() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let t = std::thread::spawn(move || wait_for_code(listener, "abc"));
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(b"GET /?state=abc&code=XYZ HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let mut resp = String::new();
        std::io::Read::read_to_string(&mut s, &mut resp).unwrap();
        assert!(resp.contains("Login recebido"));
        assert_eq!(t.join().unwrap().unwrap(), "XYZ");
    }

    #[test]
    fn recusa_state_errado() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let t = std::thread::spawn(move || wait_for_code(listener, "abc"));
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(b"GET /?state=OUTRO&code=XYZ HTTP/1.1\r\n\r\n").unwrap();
        let mut resp = String::new();
        std::io::Read::read_to_string(&mut s, &mut resp).unwrap();
        assert!(t.join().unwrap().is_err());
    }
}
