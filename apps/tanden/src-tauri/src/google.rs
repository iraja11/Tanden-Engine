//! Login Google para apps instalados (OAuth 2 com PKCE).
//!
//! Computador: o navegador volta para 127.0.0.1:<porta aleatória>, onde o app
//! escuta (cliente "App para computador").
//!
//! Android: o Android congela (ou mata) o app enquanto o navegador está na
//! frente, então ninguém atende no 127.0.0.1. Lá o login usa um cliente
//! "Android" com esquema próprio: o Google volta para
//! `dev.tanden.engine:/oauth2redirect?code=…`, o Android reabre o app por deep
//! link e o login termina. O login em andamento fica gravado em disco, então
//! funciona mesmo se o app tiver sido fechado no meio. Sem cliente Android, o
//! celular tenta o 127.0.0.1 e aceita que você cole o endereço que o
//! navegador mostrou.
//!
//! O refresh token fica só neste aparelho; o token de acesso nunca vai para o disco.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// drive.file: o app só enxerga os arquivos que ele mesmo criou no seu Drive.
/// calendar.events + calendarlist.readonly: a Agenda lê e grava eventos e lista
/// as suas agendas, sem mexer nas configurações delas.
const SCOPES: &str = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
/// Sem este escopo concedido, a Agenda pede para entrar de novo.
const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Volta do login no celular: o esquema é o nome do pacote (ver o AndroidManifest).
#[cfg_attr(desktop, allow(dead_code))]
pub const MOBILE_SCHEME: &str = "dev.tanden.engine";
const MOBILE_REDIRECT: &str = "dev.tanden.engine:/oauth2redirect";
/// Quanto tempo o login espera você terminar no navegador.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(600);
/// Evento para a interface reler o estado (login terminado por deep link, acesso revogado).
const CHANGED_EVENT: &str = "google-changed";

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Credentials {
    pub client_id: String,
    pub client_secret: String,
    /// cliente do tipo "Android" (sem chave secreta), usado no celular
    #[serde(default)]
    pub android_client_id: String,
}

/// Login começado e ainda não terminado (o app pode ser fechado no meio).
#[derive(Serialize, Deserialize, Clone)]
struct Pending {
    client_id: String,
    client_secret: String,
    redirect: String,
    verifier: String,
    state: String,
    /// segundos desde 1970, para descartar logins velhos
    started: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    credentials: Option<Credentials>,
    refresh_token: Option<String>,
    email: Option<String>,
    /// escopos que o Google concedeu (a tela de consentimento deixa desmarcar)
    #[serde(default)]
    scopes: Option<String>,
    /// cliente que emitiu o refresh token (a renovação precisa ser com ele)
    #[serde(default)]
    token_client: Option<String>,
    #[serde(default)]
    pending: Option<Pending>,
}

/// O que o navegador devolveu (pelo 127.0.0.1, por deep link ou colado).
#[derive(Debug, Clone, PartialEq)]
struct Callback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Default)]
pub struct GoogleState {
    access: Mutex<Option<(String, Instant)>>,
    /// login esperando a volta do navegador
    waiter: Mutex<Option<mpsc::Sender<Callback>>>,
    /// manda o servidor do 127.0.0.1 do login anterior parar
    stop: Mutex<Option<Arc<AtomicBool>>>,
    /// último código recebido por deep link (o Android pode entregar o mesmo duas vezes)
    #[cfg_attr(desktop, allow(dead_code))]
    last_code: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct Status {
    configured: bool,
    signed_in: bool,
    email: Option<String>,
    /// o login atual libera a Agenda
    calendar: bool,
    /// este aparelho entra pelo cliente Android (volta por deep link)
    mobile_client: bool,
    /// é um celular (a tela explica o login de outro jeito)
    mobile: bool,
    /// há um login esperando a volta do navegador
    pending: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    id_token: Option<String>,
    scope: Option<String>,
}

#[derive(Clone)]
struct Client {
    id: String,
    secret: String,
    /// cliente Android: volta pelo esquema próprio, sem chave secreta
    mobile: bool,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
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

fn env_or(stored: Option<&str>, built: Option<&'static str>) -> Option<String> {
    stored.filter(|s| !s.trim().is_empty()).map(|s| s.trim().to_string()).or_else(|| built.filter(|s| !s.is_empty()).map(String::from))
}

/// Cliente "App para computador": o que você colou no app ou o embutido no build.
fn desktop_client(stored: &Stored) -> Option<Client> {
    let c = stored.credentials.as_ref();
    let pasted = c.filter(|c| !c.client_id.trim().is_empty());
    let (id, secret) = match pasted {
        Some(c) => (c.client_id.trim().to_string(), c.client_secret.trim().to_string()),
        None => (env_or(None, option_env!("TANDEN_GOOGLE_CLIENT_ID"))?, option_env!("TANDEN_GOOGLE_CLIENT_SECRET").unwrap_or("").to_string()),
    };
    Some(Client { id, secret, mobile: false })
}

/// Cliente "Android" (só ID, sem chave secreta).
fn android_client(stored: &Stored) -> Option<Client> {
    let id = env_or(stored.credentials.as_ref().map(|c| c.android_client_id.as_str()), option_env!("TANDEN_GOOGLE_ANDROID_CLIENT_ID"))?;
    Some(Client { id, secret: String::new(), mobile: true })
}

/// Com qual cliente este aparelho entra.
fn login_client(stored: &Stored) -> Option<Client> {
    if cfg!(target_os = "android") {
        android_client(stored).or_else(|| desktop_client(stored))
    } else {
        desktop_client(stored)
    }
}

/// A renovação usa o mesmo cliente que emitiu o refresh token.
fn refresh_client(stored: &Stored) -> Option<Client> {
    let all = [android_client(stored), desktop_client(stored)];
    if let Some(id) = &stored.token_client {
        if let Some(c) = all.iter().flatten().find(|c| &c.id == id) {
            return Some(c.clone());
        }
    }
    // login de antes desta versão: o token veio sempre do cliente de computador
    desktop_client(stored).or_else(|| login_client(stored))
}

/// Chama o endpoint de token e traduz os erros mais comuns.
async fn token_request(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    // cliente Android não tem chave secreta: o campo nem vai
    let form: Vec<_> = form.iter().filter(|(k, v)| !(*k == "client_secret" && v.is_empty())).collect();
    let res = reqwest::Client::new().post(TOKEN_URL).form(&form).send().await.map_err(|e| format!("sem conexão com o Google: {e}"))?;
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

/// O escopo está na lista separada por espaços que o Google devolve?
fn has_scope(granted: Option<&str>, scope: &str) -> bool {
    granted.is_some_and(|g| g.split_whitespace().any(|s| s == scope))
}

/// Lê o e-mail de dentro do id_token (JWT); não precisa validar, veio direto do Google por HTTPS.
fn email_from_id_token(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let json: serde_json::Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).ok()?).ok()?;
    json.get("email")?.as_str().map(String::from)
}

/// Tira code/state/error de um endereço de volta (completo ou só "/?code=…").
fn parse_callback(raw: &str) -> Option<Callback> {
    let raw = raw.trim();
    let url = if raw.starts_with('/') { url::Url::parse(&format!("http://127.0.0.1{raw}")) } else { url::Url::parse(raw) }.ok()?;
    let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
    let cb = Callback { code: get("code"), state: get("state"), error: get("error") };
    (cb.code.is_some() || cb.error.is_some()).then_some(cb)
}

/// Confere o state (contra CSRF) e devolve o código.
fn check(cb: &Callback, expected_state: &str) -> Result<String, String> {
    if let Some(e) = &cb.error {
        return Err(if e == "access_denied" { "login cancelado no Google".into() } else { format!("o Google recusou: {e}") });
    }
    match (&cb.code, cb.state.as_deref()) {
        (Some(c), Some(s)) if s == expected_state => Ok(c.clone()),
        (Some(_), _) => Err("esse endereço é de outro login; entre de novo".into()),
        _ => Err("resposta de login inválida".into()),
    }
}

fn answer(mut stream: &TcpStream, ok: bool) {
    let body = if ok {
        "<html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body style=\"background:#0c0c0e;color:#ecebf0;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\"><div><h2 style=\"color:#ff8a3d\">Login recebido</h2><p>Pode fechar esta aba e voltar ao Tanden.</p></div></body></html>"
    } else {
        "<html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body style=\"background:#0c0c0e;color:#ecebf0;font-family:sans-serif\"><h2>Login cancelado ou inválido.</h2><p>Volte ao Tanden e tente de novo.</p></body></html>"
    };
    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
}

/// Escuta o 127.0.0.1 até o navegador voltar (ou até mandarem parar) e entrega a volta.
fn serve_loopback(listener: TcpListener, tx: mpsc::Sender<Callback>, stop: Arc<AtomicBool>) {
    let _ = listener.set_nonblocking(true);
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    while !stop.load(Ordering::Relaxed) && Instant::now() < deadline {
        let stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(_) => continue,
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        let target = line.split_whitespace().nth(1).unwrap_or("/");
        let Some(cb) = parse_callback(target) else {
            let _ = (&stream).write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
            continue; // ex.: favicon
        };
        answer(&stream, cb.code.is_some());
        let _ = tx.send(cb);
        return;
    }
}

fn status_of(s: &Stored) -> Status {
    let calendar = s.refresh_token.is_some() && has_scope(s.scopes.as_deref(), CALENDAR_SCOPE);
    let client = login_client(s);
    Status {
        configured: client.is_some(),
        signed_in: s.refresh_token.is_some(),
        email: s.email.clone(),
        calendar,
        mobile_client: client.is_some_and(|c| c.mobile),
        mobile: cfg!(mobile),
        pending: s.pending.as_ref().is_some_and(|p| now_secs().saturating_sub(p.started) < LOGIN_TIMEOUT.as_secs()),
    }
}

/// Troca o código pelos tokens e guarda o login.
async fn finish(app: &AppHandle, pending: &Pending, code: &str) -> Result<Status, String> {
    let res = token_request(&[
        ("code", code),
        ("client_id", pending.client_id.as_str()),
        ("client_secret", pending.client_secret.as_str()),
        ("redirect_uri", pending.redirect.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", pending.verifier.as_str()),
    ])
    .await?;
    let mut stored = load(app);
    stored.refresh_token = res.refresh_token.or(stored.refresh_token);
    stored.email = res.id_token.as_deref().and_then(email_from_id_token).or(stored.email);
    stored.scopes = res.scope.clone();
    stored.token_client = Some(pending.client_id.clone());
    stored.pending = None;
    save(app, &stored)?;
    let state = app.state::<GoogleState>();
    *state.access.lock().unwrap() = Some((res.access_token, Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60))));
    Ok(status_of(&stored))
}

/// Entrega a volta do navegador: para o login que está esperando ou, se o app
/// foi reaberto do zero, termina o login guardado em disco.
async fn deliver(app: &AppHandle, cb: Callback) -> Result<Option<Status>, String> {
    let waiting = app.state::<GoogleState>().waiter.lock().unwrap().clone();
    if let Some(tx) = waiting {
        if tx.send(cb.clone()).is_ok() {
            return Ok(None);
        }
    }
    let mut stored = load(app);
    let pending = stored.pending.clone().ok_or("nenhum login em andamento; toque em Entrar com Google")?;
    let code = check(&cb, &pending.state);
    let code = match code {
        Ok(c) => c,
        Err(e) => {
            stored.pending = None;
            let _ = save(app, &stored);
            return Err(e);
        }
    };
    let status = finish(app, &pending, &code).await?;
    Ok(Some(status))
}

/// Deep link do Android (`dev.tanden.engine:/oauth2redirect?code=…`).
#[cfg_attr(desktop, allow(dead_code))]
pub fn handle_deep_link(app: &AppHandle, url: &url::Url) {
    if url.scheme() != MOBILE_SCHEME {
        return;
    }
    let Some(cb) = parse_callback(url.as_str()) else { return };
    {
        let state = app.state::<GoogleState>();
        let mut last = state.last_code.lock().unwrap();
        let key = cb.code.clone().or(cb.error.clone());
        if key.is_some() && *last == key {
            return;
        }
        *last = key;
    }
    // sem login em andamento (link velho reaberto pelo Android): ignora calado
    if state_is_idle(app) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let msg = match deliver(&app, cb).await {
            Ok(None) => return, // o login que espera avisa a tela
            Ok(Some(_)) => String::new(),
            Err(e) => e,
        };
        let _ = app.emit(CHANGED_EVENT, msg);
    });
}

#[cfg_attr(desktop, allow(dead_code))]
fn state_is_idle(app: &AppHandle) -> bool {
    app.state::<GoogleState>().waiter.lock().unwrap().is_none() && load(app).pending.is_none()
}

#[tauri::command]
pub fn google_status(app: AppHandle) -> Status {
    status_of(&load(&app))
}

#[tauri::command]
pub fn google_set_credentials(app: AppHandle, client_id: String, client_secret: String, android_client_id: Option<String>) -> Result<(), String> {
    let mut s = load(&app);
    let old = s.credentials.clone().unwrap_or_default();
    s.credentials = Some(Credentials {
        client_id: client_id.trim().into(),
        client_secret: client_secret.trim().into(),
        android_client_id: android_client_id.map(|x| x.trim().to_string()).unwrap_or(old.android_client_id),
    });
    save(&app, &s)
}

#[tauri::command]
pub async fn google_sign_in(app: AppHandle, state: State<'_, GoogleState>) -> Result<Status, String> {
    let mut stored = load(&app);
    let client = login_client(&stored).ok_or("falta a credencial do Google (client ID)")?;
    // um login anterior que ficou esperando é abandonado
    if let Some(old) = state.stop.lock().unwrap().take() {
        old.store(true, Ordering::Relaxed);
    }
    let (tx, rx) = mpsc::channel::<Callback>();
    let redirect = if client.mobile {
        MOBILE_REDIRECT.to_string()
    } else {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let stop = Arc::new(AtomicBool::new(false));
        *state.stop.lock().unwrap() = Some(stop.clone());
        let tx = tx.clone();
        std::thread::spawn(move || serve_loopback(listener, tx, stop));
        format!("http://127.0.0.1:{port}")
    };
    let verifier = random_b64(48);
    let pending = Pending {
        client_id: client.id.clone(),
        client_secret: client.secret.clone(),
        redirect: redirect.clone(),
        verifier: verifier.clone(),
        state: random_b64(16),
        started: now_secs(),
    };
    stored.pending = Some(pending.clone());
    save(&app, &stored)?;
    *state.waiter.lock().unwrap() = Some(tx);

    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut auth = url::Url::parse(AUTH_URL).unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", &client.id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", &format!("openid email {SCOPES}"))
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("include_granted_scopes", "true")
        .append_pair("prompt", "consent")
        .append_pair("state", &pending.state);
    if let Err(e) = app.opener().open_url(auth.as_str(), None::<&str>) {
        *state.waiter.lock().unwrap() = None;
        return Err(e.to_string());
    }

    let got = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(LOGIN_TIMEOUT)).await.map_err(|e| e.to_string())?;
    *state.waiter.lock().unwrap() = None;
    if let Some(stop) = state.stop.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
    }
    let cb = got.map_err(|_| "tempo esgotado esperando o login".to_string())?;
    let code = match check(&cb, &pending.state) {
        Ok(c) => c,
        Err(e) => {
            let mut s = load(&app);
            s.pending = None;
            let _ = save(&app, &s);
            return Err(e);
        }
    };
    finish(&app, &pending, &code).await
}

/// Termina o login com o endereço que o navegador mostrou (quando a volta
/// automática não chegou ao app, comum no Android).
#[tauri::command]
pub async fn google_finish_url(app: AppHandle, url: String) -> Result<Status, String> {
    let cb = parse_callback(&url).ok_or("esse endereço não tem o código do login (procure por \"code=\")")?;
    match deliver(&app, cb).await? {
        Some(s) => Ok(s),
        None => Ok(status_of(&load(&app))),
    }
}

/// Desiste do login que está esperando o navegador.
#[tauri::command]
pub fn google_cancel(app: AppHandle, state: State<'_, GoogleState>) -> Result<(), String> {
    *state.waiter.lock().unwrap() = None;
    if let Some(stop) = state.stop.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
    }
    let mut s = load(&app);
    s.pending = None;
    save(&app, &s)
}

#[tauri::command]
pub async fn google_access_token(app: AppHandle, state: State<'_, GoogleState>) -> Result<String, String> {
    if let Some((tok, until)) = state.access.lock().unwrap().clone() {
        if Instant::now() < until {
            return Ok(tok);
        }
    }
    let mut stored = load(&app);
    let client = refresh_client(&stored).ok_or("falta a credencial do Google")?;
    let refresh = stored.refresh_token.clone().ok_or("não conectado ao Google")?;
    let res = match token_request(&[
        ("client_id", client.id.as_str()),
        ("client_secret", client.secret.as_str()),
        ("refresh_token", &refresh),
        ("grant_type", "refresh_token"),
    ])
    .await
    {
        Ok(r) => r,
        Err(e) => {
            // acesso revogado ou vencido (app em "Teste" vence a cada 7 dias): sai da conta
            // para a tela pedir o login de novo, em vez de falhar calada para sempre
            if e.contains("expirou ou foi revogado") {
                stored.refresh_token = None;
                stored.scopes = None;
                let _ = save(&app, &stored);
                let _ = app.emit(CHANGED_EVENT, e.clone());
            }
            return Err(e);
        }
    };
    // a renovação também diz os escopos; guarda se mudaram (ex.: revogou a agenda)
    if res.scope.is_some() && res.scope != stored.scopes {
        stored.scopes = res.scope.clone();
        let _ = save(&app, &stored);
    }
    let tok = res.access_token.clone();
    *state.access.lock().unwrap() = Some((res.access_token, Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60))));
    Ok(tok)
}

#[tauri::command]
pub fn google_sign_out(app: AppHandle, state: State<'_, GoogleState>) -> Result<(), String> {
    let mut s = load(&app);
    s.refresh_token = None;
    s.email = None;
    s.scopes = None;
    s.token_client = None;
    s.pending = None;
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
    fn confere_o_escopo_da_agenda() {
        let g = "openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events";
        assert!(has_scope(Some(g), CALENDAR_SCOPE));
        assert!(!has_scope(Some("https://www.googleapis.com/auth/drive.file"), CALENDAR_SCOPE));
        assert!(!has_scope(None, CALENDAR_SCOPE));
    }

    fn serve() -> (u16, mpsc::Receiver<Callback>, Arc<AtomicBool>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let s = stop.clone();
        std::thread::spawn(move || serve_loopback(listener, tx, s));
        (port, rx, stop)
    }

    #[test]
    fn recebe_o_codigo_do_navegador() {
        let (port, rx, _) = serve();
        // favicon antes: ignora e segue esperando
        let mut f = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        f.write_all(b"GET /favicon.ico HTTP/1.1\r\n\r\n").unwrap();
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(b"GET /?state=abc&code=XYZ HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let mut resp = String::new();
        std::io::Read::read_to_string(&mut s, &mut resp).unwrap();
        assert!(resp.contains("Login recebido"));
        let cb = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(check(&cb, "abc").unwrap(), "XYZ");
    }

    #[test]
    fn recusa_state_errado() {
        let cb = parse_callback("http://127.0.0.1:5555/?state=OUTRO&code=XYZ").unwrap();
        assert!(check(&cb, "abc").is_err());
        let cancel = parse_callback("/?error=access_denied&state=abc").unwrap();
        assert!(check(&cancel, "abc").unwrap_err().contains("cancelado"));
    }

    #[test]
    fn le_a_volta_do_deep_link_e_do_endereco_colado() {
        let cb = parse_callback("dev.tanden.engine:/oauth2redirect?state=abc&code=4%2F0AQ&scope=x").unwrap();
        assert_eq!(cb.code.as_deref(), Some("4/0AQ"));
        assert_eq!(check(&cb, "abc").unwrap(), "4/0AQ");
        let pasted = parse_callback("  http://127.0.0.1:41234/?state=abc&code=Q1 ").unwrap();
        assert_eq!(pasted.code.as_deref(), Some("Q1"));
        assert!(parse_callback("http://127.0.0.1:41234/").is_none());
        assert!(parse_callback("não é endereço").is_none());
    }

    #[test]
    fn para_quando_mandam() {
        let (_, rx, stop) = serve();
        stop.store(true, Ordering::Relaxed);
        // o servidor larga o canal: quem espera fica sabendo
        assert!(rx.recv_timeout(Duration::from_secs(5)).is_err());
    }

    #[test]
    fn escolhe_o_cliente_certo() {
        let mut s = Stored {
            credentials: Some(Credentials { client_id: "desk".into(), client_secret: "seg".into(), android_client_id: "andr".into() }),
            ..Default::default()
        };
        assert_eq!(desktop_client(&s).unwrap().id, "desk");
        assert!(android_client(&s).unwrap().mobile);
        // a renovação segue o cliente que emitiu o token, não o deste aparelho
        s.token_client = Some("andr".into());
        let r = refresh_client(&s).unwrap();
        assert_eq!((r.id.as_str(), r.secret.as_str()), ("andr", ""));
        s.token_client = Some("desk".into());
        assert_eq!(refresh_client(&s).unwrap().secret, "seg");
        s.token_client = None;
        assert_eq!(refresh_client(&s).unwrap().id, "desk");
    }
}
