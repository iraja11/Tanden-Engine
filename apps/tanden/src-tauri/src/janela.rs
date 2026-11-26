//! A janela em foco: título e classe (o app). É o que a Ânima usa para
//! comentar o site aberto no navegador (o título da aba vai no título da
//! janela) e o app que você está usando. Só lê; nada sai do aparelho.
//!
//! No Linux não existe um jeito único: tenta, nesta ordem, Hyprland
//! (`hyprctl`), Sway (`swaymsg`), KDE no Wayland (`kdotool`) e X11
//! (`xdotool`, depois `xprop`). No GNOME/Wayland nenhum funciona sem extensão;
//! aí o comando avisa.

use serde::Serialize;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Debug, PartialEq, Default, Clone)]
pub struct Janela {
    pub titulo: String,
    /// classe / app_id da janela ("firefox", "discord", "code"...)
    pub app: String,
}

/// Roda um programa com prazo curto (800 ms); devolve a saída se deu certo.
fn rodar(prog: &str, args: &[&str]) -> Option<String> {
    let mut filho = Command::new(prog).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let fim = Instant::now() + Duration::from_millis(800);
    loop {
        match filho.try_wait() {
            Ok(Some(st)) if st.success() => break,
            Ok(Some(_)) => return None,
            Ok(None) if Instant::now() < fim => std::thread::sleep(Duration::from_millis(15)),
            _ => {
                let _ = filho.kill();
                return None;
            }
        }
    }
    let out = filho.wait_with_output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// `hyprctl activewindow -j`
pub fn ler_hyprctl(json: &str) -> Option<Janela> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let titulo = v.get("title")?.as_str()?.to_string();
    let app = v.get("class").and_then(|c| c.as_str()).unwrap_or("").to_string();
    (!titulo.is_empty() || !app.is_empty()).then_some(Janela { titulo, app })
}

/// `swaymsg -t get_tree -r`: o nó com "focused": true
pub fn ler_sway(json: &str) -> Option<Janela> {
    fn achar(n: &serde_json::Value) -> Option<Janela> {
        if n.get("focused").and_then(|f| f.as_bool()) == Some(true) && n.get("type").and_then(|t| t.as_str()).is_some_and(|t| t.contains("con")) {
            let titulo = n.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let app = n.get("app_id").and_then(|x| x.as_str()).filter(|s| !s.is_empty())
                .or_else(|| n.get("window_properties")?.get("class")?.as_str()).unwrap_or("").to_string();
            return Some(Janela { titulo, app });
        }
        for k in ["nodes", "floating_nodes"] {
            if let Some(xs) = n.get(k).and_then(|x| x.as_array()) {
                for x in xs {
                    if let Some(j) = achar(x) {
                        return Some(j);
                    }
                }
            }
        }
        None
    }
    achar(&serde_json::from_str(json).ok()?)
}

/// `xprop -id <id> _NET_WM_NAME WM_CLASS`
pub fn ler_xprop(saida: &str) -> Option<Janela> {
    let mut j = Janela::default();
    for l in saida.lines() {
        if l.starts_with("_NET_WM_NAME") || (l.starts_with("WM_NAME") && j.titulo.is_empty()) {
            if let (Some(a), Some(b)) = (l.find('"'), l.rfind('"')) {
                if b > a {
                    j.titulo = l[a + 1..b].replace("\\\"", "\"");
                }
            }
        } else if l.starts_with("WM_CLASS") {
            // WM_CLASS(STRING) = "Navigator", "firefox": a segunda é a classe
            j.app = l.split('"').filter(|s| !s.trim().is_empty() && !s.contains('=') && !s.contains(',')).last().unwrap_or("").to_string();
        }
    }
    (!j.titulo.is_empty()).then_some(j)
}

#[cfg(target_os = "linux")]
fn ativa() -> Result<Option<Janela>, String> {
    let tem = |v: &str| std::env::var_os(v).is_some();
    if tem("HYPRLAND_INSTANCE_SIGNATURE") {
        if let Some(s) = rodar("hyprctl", &["activewindow", "-j"]) {
            return Ok(ler_hyprctl(&s));
        }
    }
    if tem("SWAYSOCK") {
        if let Some(s) = rodar("swaymsg", &["-t", "get_tree", "-r"]) {
            return Ok(ler_sway(&s));
        }
    }
    if tem("WAYLAND_DISPLAY") && std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase().contains("kde") {
        if let Some(t) = rodar("kdotool", &["getactivewindow", "getwindowname"]) {
            let app = rodar("kdotool", &["getactivewindow", "getwindowclassname"]).unwrap_or_default();
            return Ok(Some(Janela { titulo: t, app }));
        }
    }
    if tem("DISPLAY") {
        if let Some(t) = rodar("xdotool", &["getactivewindow", "getwindowname"]) {
            let app = rodar("xdotool", &["getactivewindow", "getwindowclassname"]).unwrap_or_default();
            return Ok(Some(Janela { titulo: t, app }));
        }
        if let Some(raiz) = rodar("xprop", &["-root", "_NET_ACTIVE_WINDOW"]) {
            if let Some(id) = raiz.split_whitespace().last().filter(|x| x.starts_with("0x") && *x != "0x0") {
                if let Some(s) = rodar("xprop", &["-id", id, "_NET_WM_NAME", "WM_NAME", "WM_CLASS"]) {
                    return Ok(ler_xprop(&s));
                }
            }
        }
    }
    Err("não consegui ler a janela em foco: no Hyprland/Sway ela usa hyprctl/swaymsg; no KDE Wayland instale kdotool; no X11, xdotool (sudo pacman -S xdotool). No GNOME Wayland não há jeito sem extensão.".into())
}

#[cfg(not(target_os = "linux"))]
fn ativa() -> Result<Option<Janela>, String> {
    Err("ler a janela em foco só funciona no Linux por enquanto".into())
}

#[tauri::command]
pub async fn janela_ativa() -> Result<Option<Janela>, String> {
    // os programas externos bloqueiam: roda fora da thread principal
    tauri::async_runtime::spawn_blocking(ativa).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_o_hyprland() {
        let j = r#"{"address":"0x5","class":"firefox","title":"Aula 3 - Google Classroom — Mozilla Firefox","pid":42}"#;
        assert_eq!(ler_hyprctl(j), Some(Janela { titulo: "Aula 3 - Google Classroom — Mozilla Firefox".into(), app: "firefox".into() }));
        assert_eq!(ler_hyprctl("{}"), None);
    }

    #[test]
    fn le_o_sway() {
        let t = r#"{"type":"root","focused":false,"nodes":[{"type":"output","focused":false,"nodes":[{"type":"con","focused":false,"name":"x","nodes":[]},{"type":"con","focused":true,"name":"Lofi - YouTube — Mozilla Firefox","app_id":"firefox","nodes":[]}]}],"floating_nodes":[]}"#;
        assert_eq!(ler_sway(t).unwrap().titulo, "Lofi - YouTube — Mozilla Firefox");
        let x = r#"{"type":"root","nodes":[{"type":"con","focused":true,"name":"Discord","app_id":null,"window_properties":{"class":"discord"}}]}"#;
        assert_eq!(ler_sway(x).unwrap().app, "discord");
    }

    #[test]
    fn le_o_xprop() {
        let s = "_NET_WM_NAME(UTF8_STRING) = \"xQc - Twitch — Mozilla Firefox\"\nWM_CLASS(STRING) = \"Navigator\", \"firefox\"";
        assert_eq!(ler_xprop(s), Some(Janela { titulo: "xQc - Twitch — Mozilla Firefox".into(), app: "firefox".into() }));
    }

    #[test]
    fn programa_que_nao_existe_nao_trava() {
        assert_eq!(rodar("programa-que-nao-existe-123", &[]), None);
        assert_eq!(rodar("sh", &["-c", "echo oi"]).as_deref(), Some("oi"));
    }
}
