//! Terminal embutido (só desktop). Roda o Claude Code, o Gemini CLI ou um
//! shell comum dentro da pasta do cofre, então a IA lê e escreve as notas
//! direto, usando as suas assinaturas.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::vault::VaultRoot;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals {
    next: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PtyEvent {
    Data { bytes: Vec<u8> },
    Exit { code: Option<u32> },
}

/// O programa roda pelo shell de login, para enxergar o mesmo PATH do seu
/// terminal (onde ficam `claude` e `gemini`).
fn command(program: &str) -> CommandBuilder {
    #[cfg(windows)]
    {
        let mut c = CommandBuilder::new("powershell.exe");
        c.arg("-NoLogo");
        if !program.is_empty() {
            c.args(["-NoExit", "-Command", program]);
        }
        c
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
        let mut c = CommandBuilder::new(&shell);
        if program.is_empty() {
            c.arg("-l");
        } else {
            // ao sair do programa, volta para o shell em vez de fechar o painel
            c.args(["-lic", &format!("{program}; exec \"{shell}\" -l")]);
        }
        c
    }
}

#[tauri::command]
pub fn pty_spawn(
    terms: State<Terminals>,
    root: State<VaultRoot>,
    program: String,
    cols: u16,
    rows: u16,
    events: Channel<PtyEvent>,
) -> Result<u32, String> {
    if !matches!(program.as_str(), "" | "claude" | "gemini") {
        return Err(format!("programa não permitido: {program}"));
    }
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut cmd = command(&program);
    cmd.cwd(&root.0);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = terms.next.fetch_add(1, Ordering::Relaxed);
    terms.sessions.lock().unwrap().insert(id, Session { master: pair.master, writer, child });

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if events.send(PtyEvent::Data { bytes: buf[..n].to_vec() }).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = events.send(PtyEvent::Exit { code: None });
    });
    Ok(id)
}

#[tauri::command]
pub fn pty_write(terms: State<Terminals>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = terms.sessions.lock().unwrap();
    let s = sessions.get_mut(&id).ok_or("terminal fechado")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(terms: State<Terminals>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = terms.sessions.lock().unwrap();
    let s = sessions.get(&id).ok_or("terminal fechado")?;
    s.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(terms: State<Terminals>, id: u32) {
    if let Some(mut s) = terms.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
}
