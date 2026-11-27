//! A ponte com o Minecraft: com o poder ligado, o Tanden escuta em
//! 127.0.0.1 (porta livre qualquer) e anota a porta e uma chave nova em
//! `<config>/tanden/minecraft.json`, legível só por você. O mod (Vanilla
//! Remix) lê esse arquivo, conecta e se apresenta com a chave; aí a Ânima
//! entra no mundo. Fechou o Tanden ou desligou o poder, a ligação cai e ela
//! sai do jogo.
//!
//! O protocolo é JSON, uma mensagem por linha, nos dois sentidos. Este lado
//! não interpreta nada: repassa cada linha à interface no evento
//! `minecraft` e escreve no socket o que a interface mandar. Quem pensa é o
//! núcleo (`cerebro/minecraft.ts`).

use rand::RngCore;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Uma linha maior que isso é lixo (ninguém fala tanto no chat).
const MAX_LINHA: usize = 64 * 1024;

#[derive(Default)]
pub struct Ponte {
    inner: Mutex<Option<Ligada>>,
}

struct Ligada {
    porta: u16,
    parar: Arc<AtomicBool>,
    /// a conexão atual com o jogo (uma por vez) e o número dela
    conexao: Arc<Mutex<Option<(u64, TcpStream)>>>,
}

/// Onde o mod procura a porta e a chave (o mesmo caminho do lado Java).
pub fn arquivo() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }?;
    Some(base.join("tanden").join("minecraft.json"))
}

fn gravar(porta: u16, chave: &str) -> std::io::Result<()> {
    let p = arquivo().ok_or_else(|| std::io::Error::other("sem pasta de configuração"))?;
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d)?;
    }
    let txt = json!({ "porta": porta, "chave": chave, "versao": 1 }).to_string();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&p)?;
        f.write_all(txt.as_bytes())
    }
    #[cfg(not(unix))]
    std::fs::write(&p, txt)
}

fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// A primeira linha tem de ser `{"t":"ola","chave":"..."}` com a chave certa.
pub fn apresentacao_ok(linha: &str, chave: &str) -> Option<Value> {
    let v: Value = serde_json::from_str(linha).ok()?;
    (v.get("t")?.as_str()? == "ola" && same(v.get("chave")?.as_str()?, chave)).then_some(v)
}

fn atender(app: AppHandle, stream: TcpStream, chave: String, conexao: Arc<Mutex<Option<(u64, TcpStream)>>>, n: u64) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut leitor = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut linha = String::new();
    if leitor.read_line(&mut linha).unwrap_or(0) == 0 || linha.len() > MAX_LINHA {
        return;
    }
    let Some(mut ola) = apresentacao_ok(linha.trim(), &chave) else {
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };
    // a chave não sobe para a interface
    if let Some(o) = ola.as_object_mut() {
        o.remove("chave");
    }
    // o jogo manda "estado" a cada poucos segundos; 60 s em silêncio = caiu
    let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));
    {
        let mut c = conexao.lock().unwrap();
        if let Some((_, antiga)) = c.take() {
            let _ = antiga.shutdown(Shutdown::Both);
        }
        *c = stream.try_clone().ok().map(|s| {
            // o jogo travado não pode travar o app
            let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
            (n, s)
        });
    }
    let _ = app.emit("minecraft", ola);
    loop {
        linha.clear();
        match leitor.read_line(&mut linha) {
            Ok(0) | Err(_) => break,
            Ok(_) if linha.len() > MAX_LINHA => break,
            Ok(_) => {
                if let Ok(v) = serde_json::from_str::<Value>(linha.trim()) {
                    if v.get("t").and_then(|t| t.as_str()).is_some() {
                        let _ = app.emit("minecraft", v);
                    }
                }
            }
        }
    }
    let mut c = conexao.lock().unwrap();
    // só avisa se ainda era a conexão atual (não uma substituída por outra)
    if c.as_ref().map(|(m, _)| *m) == Some(n) {
        *c = None;
        drop(c);
        let _ = app.emit("minecraft", json!({ "t": "desconectou" }));
    }
}

fn ligar(app: AppHandle, ponte: &Ponte) -> Result<u16, String> {
    let mut g = ponte.inner.lock().unwrap();
    if let Some(l) = g.as_ref() {
        return Ok(l.porta);
    }
    let escuta = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("não consegui abrir a porta: {e}"))?;
    let porta = escuta.local_addr().map_err(|e| e.to_string())?.port();
    let mut b = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut b);
    let chave: String = b.iter().map(|x| format!("{x:02x}")).collect();
    gravar(porta, &chave).map_err(|e| format!("não consegui gravar {:?}: {e}", arquivo()))?;
    escuta.set_nonblocking(true).map_err(|e| e.to_string())?;
    let parar = Arc::new(AtomicBool::new(false));
    let conexao: Arc<Mutex<Option<(u64, TcpStream)>>> = Arc::default();
    let (p2, c2) = (parar.clone(), conexao.clone());
    std::thread::spawn(move || {
        let contador = AtomicU64::new(0);
        while !p2.load(Ordering::Relaxed) {
            match escuta.accept() {
                Ok((s, addr)) if addr.ip().is_loopback() => {
                    let _ = s.set_nonblocking(false);
                    let n = contador.fetch_add(1, Ordering::Relaxed) + 1;
                    let (app, chave, c) = (app.clone(), chave.clone(), c2.clone());
                    std::thread::spawn(move || atender(app, s, chave, c, n));
                }
                Ok(_) => {}
                Err(_) => std::thread::sleep(Duration::from_millis(250)),
            }
        }
    });
    *g = Some(Ligada { porta, parar, conexao });
    Ok(porta)
}

fn desligar(ponte: &Ponte) {
    if let Some(l) = ponte.inner.lock().unwrap().take() {
        l.parar.store(true, Ordering::Relaxed);
        if let Some((_, s)) = l.conexao.lock().unwrap().take() {
            let _ = s.shutdown(Shutdown::Both);
        }
        if let Some(p) = arquivo() {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// Liga ou desliga a ponte. Devolve a porta (0 = desligada).
/// Os dois comandos rodam fora da thread principal: socket e trava nunca congelam a janela.
#[tauri::command(async)]
pub fn minecraft_ligar(app: AppHandle, ponte: tauri::State<'_, Ponte>, ligado: bool) -> Result<u16, String> {
    if ligado {
        ligar(app, &ponte)
    } else {
        desligar(&ponte);
        Ok(0)
    }
}

/// Manda uma mensagem ao jogo. `false` = não há jogo conectado.
#[tauri::command(async)]
pub fn minecraft_enviar(ponte: tauri::State<'_, Ponte>, msg: Value) -> Result<bool, String> {
    let g = ponte.inner.lock().unwrap();
    let Some(l) = g.as_ref() else { return Ok(false) };
    let mut c = l.conexao.lock().unwrap();
    let Some((_, s)) = c.as_mut() else { return Ok(false) };
    let mut txt = msg.to_string();
    txt.push('\n');
    if s.write_all(txt.as_bytes()).and_then(|_| s.flush()).is_err() {
        *c = None;
        return Ok(false);
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apresentacao_precisa_da_chave() {
        assert!(apresentacao_ok(r#"{"t":"ola","chave":"abc","mundo":"Novo"}"#, "abc").is_some());
        assert!(apresentacao_ok(r#"{"t":"ola","chave":"abd"}"#, "abc").is_none());
        assert!(apresentacao_ok(r#"{"t":"chat","chave":"abc"}"#, "abc").is_none());
        assert!(apresentacao_ok("lixo", "abc").is_none());
    }

    #[test]
    fn arquivo_fica_na_pasta_do_tanden() {
        let p = arquivo().unwrap();
        assert!(p.ends_with("tanden/minecraft.json"));
    }
}
