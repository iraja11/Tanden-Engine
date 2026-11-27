//! A janela em foco: título e classe (o app). É o que a Ânima usa para
//! comentar o site aberto no navegador (o título da aba vai no título da
//! janela) e o app que você está usando. Só lê; nada sai do aparelho.
//!
//! No Linux não existe um jeito único: tenta, nesta ordem, Hyprland
//! (`hyprctl`), Sway (`swaymsg`), KDE no Wayland (`kdotool`) e X11
//! (`xdotool`, depois `xprop`). No KDE sem kdotool, pergunta ao próprio KWin:
//! carrega um script de uma linha pelo D-Bus e o script responde ao app pelo
//! próprio D-Bus (nada vai para o journal: os títulos são íntimos). No GNOME/Wayland nenhum funciona sem
//! extensão; aí o comando avisa.

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

/// O que o script do KWin manda de volta: `{"titulo":...,"app":...}`
pub fn ler_kwin(json: &str) -> Option<Janela> {
    let v: serde_json::Value = serde_json::from_str(json.trim()).ok()?;
    let titulo = v.get("titulo")?.as_str()?.to_string();
    let app = v.get("app").and_then(|a| a.as_str()).unwrap_or("").to_string();
    (!titulo.is_empty() || !app.is_empty()).then_some(Janela { titulo, app })
}

/// O script de uma linha que o KWin roda: responde direto ao app pelo D-Bus
/// (`callDBus`). Antes ele usava `print`, e o título de toda janela em foco
/// (inclusive as abas que ela comenta com discrição) ficava gravado no journal
/// do sistema a cada consulta. Agora nada passa por log nenhum.
pub fn script_kwin(destino: &str, marca: &str) -> String {
    let q = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into());
    format!(
        "const w = workspace.activeWindow || workspace.activeClient;\ncallDBus({}, \"/app/tanden/Janela\", \"app.tanden.Janela\", \"Recebe\", {}, JSON.stringify({{ titulo: w ? String(w.caption) : \"\", app: w ? String(w.resourceClass) : \"\" }}));\n",
        q(destino),
        q(marca)
    )
}

#[cfg(target_os = "linux")]
mod kde {
    use super::{ler_kwin, script_kwin, Janela};
    use std::collections::HashMap;
    use std::sync::{Arc, Condvar, Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use zbus::blocking::{connection, Connection};

    /// As respostas que chegaram, por marca (só as que o app pediu são aceitas).
    #[derive(Default)]
    struct Caixa {
        esperando: Mutex<HashMap<String, Option<Janela>>>,
        chegou: Condvar,
    }

    struct Receptor(Arc<Caixa>);

    #[zbus::interface(name = "app.tanden.Janela")]
    impl Receptor {
        fn recebe(&self, marca: String, json: String) {
            let mut m = self.0.esperando.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(v) = m.get_mut(&marca) {
                *v = ler_kwin(&json);
                self.0.chegou.notify_all();
            }
        }
    }

    /// Uma conexão só, aberta na primeira consulta, com o receptor publicado.
    fn conexao() -> Option<&'static (Connection, Arc<Caixa>)> {
        static C: OnceLock<Option<(Connection, Arc<Caixa>)>> = OnceLock::new();
        C.get_or_init(|| {
            let caixa = Arc::new(Caixa::default());
            let conn = connection::Builder::session()
                .ok()?
                .serve_at("/app/tanden/Janela", Receptor(caixa.clone()))
                .ok()?
                .method_timeout(Duration::from_millis(800))
                .build()
                .ok()?;
            Some((conn, caixa))
        })
        .as_ref()
    }

    /// KDE Plasma (Wayland) sem kdotool: um script de KWin diz a janela ativa.
    pub fn kwin() -> Option<Janela> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let (conn, caixa) = conexao()?;
        let destino = conn.unique_name()?.to_string();
        let n = N.fetch_add(1, Ordering::Relaxed);
        let ns = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0);
        let marca = format!("{}-{n}-{ns:x}", std::process::id());
        let nome = format!("tanden-janela-{marca}");
        let arq = std::env::temp_dir().join(format!("{nome}.js"));
        std::fs::write(&arq, script_kwin(&destino, &marca)).ok()?;
        caixa.esperando.lock().unwrap_or_else(|e| e.into_inner()).insert(marca.clone(), None);
        let caminho = arq.to_string_lossy().to_string();
        let id: Option<i32> = conn
            .call_method(Some("org.kde.KWin"), "/Scripting", Some("org.kde.kwin.Scripting"), "loadScript", &(caminho.as_str(), nome.as_str()))
            .ok()
            .and_then(|m| m.body().deserialize::<i32>().ok());
        let mut achou = None;
        if let Some(id) = id.filter(|i| *i >= 0) {
            // Plasma 6 usa /Scripting/Script<id>; o 5, /<id>
            let p6 = format!("/Scripting/Script{id}");
            if conn.call_method(Some("org.kde.KWin"), p6.as_str(), Some("org.kde.kwin.Script"), "run", &()).is_err() {
                let p5 = format!("/{id}");
                let _ = conn.call_method(Some("org.kde.KWin"), p5.as_str(), Some("org.kde.kwin.Script"), "run", &());
            }
            let fim = Instant::now() + Duration::from_millis(500);
            let mut m = caixa.esperando.lock().unwrap_or_else(|e| e.into_inner());
            loop {
                if let Some(Some(j)) = m.get(&marca) {
                    achou = Some(j.clone());
                    break;
                }
                let agora = Instant::now();
                if agora >= fim {
                    break;
                }
                m = caixa.chegou.wait_timeout(m, fim - agora).map(|(g, _)| g).unwrap_or_else(|e| e.into_inner().0);
            }
            m.remove(&marca);
        } else {
            caixa.esperando.lock().unwrap_or_else(|e| e.into_inner()).remove(&marca);
        }
        let _ = conn.call_method(Some("org.kde.KWin"), "/Scripting", Some("org.kde.kwin.Scripting"), "unloadScript", &(nome.as_str(),));
        let _ = std::fs::remove_file(&arq);
        achou
    }
}

#[cfg(target_os = "linux")]
use kde::kwin;

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
    if tem("WAYLAND_DISPLAY") && std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase().contains("kde") {
        if let Some(j) = kwin() {
            return Ok(Some(j));
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
    Err("não consegui ler a janela em foco: no Hyprland/Sway ela usa hyprctl/swaymsg; no KDE Wayland, o KWin pelo D-Bus (ou o kdotool); no X11, xdotool (sudo pacman -S xdotool). No GNOME Wayland não há jeito sem extensão.".into())
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
    fn le_o_kwin() {
        let j = "{\"titulo\":\"Novo chat - Claude - Brave\",\"app\":\"brave-browser\"}";
        assert_eq!(ler_kwin(j), Some(Janela { titulo: "Novo chat - Claude - Brave".into(), app: "brave-browser".into() }));
        assert_eq!(ler_kwin("{}"), None);
        assert_eq!(ler_kwin("lixo"), None);
    }

    #[test]
    fn o_script_do_kwin_nao_escreve_em_log() {
        let js = script_kwin(":1.42", "9-1-ab");
        assert!(!js.contains("print("), "nada de print: iria para o journal");
        assert!(js.contains("callDBus(\":1.42\", \"/app/tanden/Janela\", \"app.tanden.Janela\", \"Recebe\", \"9-1-ab\""));
    }

    #[test]
    #[ignore = "precisa de uma sessão KDE Plasma"]
    fn kwin_de_verdade() {
        let j = kwin().expect("o KWin respondeu");
        assert!(!j.app.is_empty() || !j.titulo.is_empty());
    }

    #[test]
    fn programa_que_nao_existe_nao_trava() {
        assert_eq!(rodar("programa-que-nao-existe-123", &[]), None);
        assert_eq!(rodar("sh", &["-c", "echo oi"]).as_deref(), Some("oi"));
    }
}
