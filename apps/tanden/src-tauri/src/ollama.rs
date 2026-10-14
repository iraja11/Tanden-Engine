//! Conversa com o Ollama (IA local na sua placa de vídeo). Passa pelo lado
//! nativo para funcionar igual no PC e no celular, onde o Ollama do PC é
//! acessado pela rede de casa.

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::ipc::Channel;

#[derive(Serialize, Deserialize)]
pub struct Message {
    role: String,
    content: String,
}

fn base(url: &str) -> Result<String, String> {
    let u = url::Url::parse(url.trim()).map_err(|_| format!("endereço inválido: {url}"))?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err("use um endereço http://".into());
    }
    Ok(u.as_str().trim_end_matches('/').to_string())
}

fn unreachable(e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Ollama não respondeu. Ele está aberto? (no PC: `ollama serve`)".into()
    } else {
        e.to_string()
    }
}

#[tauri::command]
pub async fn ollama_models(url: String) -> Result<Vec<String>, String> {
    #[derive(Deserialize)]
    struct Tags {
        models: Vec<Model>,
    }
    #[derive(Deserialize)]
    struct Model {
        name: String,
    }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(4)).build().map_err(|e| e.to_string())?;
    let tags: Tags = client
        .get(format!("{}/api/tags", base(&url)?))
        .send()
        .await
        .map_err(unreachable)?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

/// Manda a conversa e devolve a resposta aos pedaços, conforme o modelo escreve.
#[tauri::command]
pub async fn ollama_chat(url: String, model: String, messages: Vec<Message>, on_token: Channel<String>) -> Result<(), String> {
    #[derive(Deserialize)]
    struct Chunk {
        message: Option<Message>,
        error: Option<String>,
    }
    let mut res = reqwest::Client::new()
        .post(format!("{}/api/chat", base(&url)?))
        .json(&json!({ "model": model, "messages": messages, "stream": true }))
        .send()
        .await
        .map_err(unreachable)?;
    if !res.status().is_success() {
        let status = res.status();
        return Err(format!("Ollama respondeu {status}: {}", res.text().await.unwrap_or_default()));
    }
    // a resposta vem em linhas JSON; um pedaço da rede pode cortar uma linha ao meio
    let mut pending: Vec<u8> = Vec::new();
    while let Some(bytes) = res.chunk().await.map_err(unreachable)? {
        pending.extend_from_slice(&bytes);
        while let Some(pos) = pending.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = pending.drain(..=pos).collect();
            if line.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let chunk: Chunk = serde_json::from_slice(&line).map_err(|e| e.to_string())?;
            if let Some(err) = chunk.error {
                return Err(err);
            }
            if let Some(m) = chunk.message {
                if !m.content.is_empty() {
                    on_token.send(m.content).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}
