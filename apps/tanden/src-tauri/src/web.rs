//! Baixa páginas e imagens da web para as notas. Passa pelo lado nativo
//! porque o navegador embutido bloqueia leituras de outros sites (CORS).

use base64::Engine;
use serde::Serialize;
use std::time::Duration;

const LIMIT: usize = 40 * 1024 * 1024;
const AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 TandenEngine/0.1";

#[derive(Serialize)]
pub struct Fetched {
    /// endereço final, depois dos redirecionamentos
    url: String,
    status: u16,
    content_type: String,
    /// conteúdo em base64
    body: String,
}

/// Endereço da rede local (roteador, outros PCs, serviços do próprio PC).
fn private_host(host: &str) -> bool {
    let h = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if h == "localhost" || h.ends_with(".localhost") || h.ends_with(".local") {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::Ipv6Addr>() {
        let first = ip.segments()[0];
        return ip.is_loopback() || ip.is_unspecified() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80;
    }
    let Ok(ip) = h.parse::<std::net::Ipv4Addr>() else { return false };
    ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
}

fn check(url: &str, allow_private: bool) -> Result<url::Url, String> {
    let u = url::Url::parse(url.trim()).map_err(|_| format!("endereço inválido: {url}"))?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err("só endereços http:// ou https://".into());
    }
    if !allow_private && u.host_str().is_some_and(private_host) {
        return Err("endereço da rede local recusado".into());
    }
    Ok(u)
}

/// `allow_private`: a página que você mesma digitou pode estar na sua rede;
/// imagens que a página pede, não.
#[tauri::command]
pub async fn web_fetch(url: String, allow_private: bool) -> Result<Fetched, String> {
    let u = check(&url, allow_private)?;
    let client = reqwest::Client::builder()
        .user_agent(AGENT)
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() > 8 {
                attempt.error("redirecionamentos demais")
            } else if !allow_private && attempt.url().host_str().is_some_and(private_host) {
                attempt.error("redirecionou para a rede local")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client
        .get(u)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
        .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "o site demorou demais para responder".into() } else if e.is_connect() { "não consegui conectar (sem internet ou site fora do ar)".into() } else { e.to_string() })?;
    let status = res.status().as_u16();
    let final_url = res.url().to_string();
    let content_type = res.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if res.content_length().is_some_and(|n| n as usize > LIMIT) {
        return Err("arquivo grande demais (mais de 40 MB)".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() > LIMIT {
            return Err("arquivo grande demais (mais de 40 MB)".into());
        }
    }
    Ok(Fetched { url: final_url, status, content_type, body: base64::engine::general_purpose::STANDARD.encode(body) })
}

/// Abre um link de uma nota no navegador do sistema (só http, https e mailto).
#[tauri::command]
pub fn web_open(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let u = url::Url::parse(url.trim()).map_err(|_| format!("endereço inválido: {url}"))?;
    if !matches!(u.scheme(), "http" | "https" | "mailto") {
        return Err("só abro links da web".into());
    }
    app.opener().open_url(u.as_str(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconhece_a_rede_local() {
        for h in ["localhost", "127.0.0.1", "192.168.0.10", "10.1.2.3", "172.16.5.4", "[::1]", "[fd00::1]", "[fe80::1]", "impressora.local", "169.254.1.1"] {
            assert!(private_host(h), "{h} é local");
        }
        for h in ["example.com", "8.8.8.8", "fd.io", "fcbarcelona.com", "172.32.0.1", "[2606:4700::1111]"] {
            assert!(!private_host(h), "{h} é pública");
        }
    }

    #[test]
    fn recusa_esquemas_estranhos() {
        assert!(check("file:///etc/passwd", true).is_err());
        assert!(check("javascript:alert(1)", true).is_err());
        assert!(check("http://127.0.0.1:11434/api/tags", false).is_err());
        assert!(check("http://127.0.0.1:8080/wiki", true).is_ok());
        assert!(check("https://example.com/a?b=1", false).is_ok());
    }
}
