use std::fs;
use std::io::ErrorKind;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

pub struct VaultRoot(pub PathBuf);

/// Junta um caminho relativo à raiz do cofre, recusando qualquer coisa que saia dela.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("caminho inválido: {rel}"));
    }
    Ok(root.join(p))
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            walk(root, &path, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
            out.push(parts.join("/"));
        }
    }
    Ok(())
}

pub fn list(root: &Path, prefix: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    walk(root, root, &mut out).map_err(|e| e.to_string())?;
    out.retain(|p| p.starts_with(prefix));
    out.sort();
    Ok(out)
}

pub fn read(root: &Path, path: &str) -> Result<Option<Vec<u8>>, String> {
    match fs::read(resolve(root, path)?) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn write(root: &Path, path: &str, data: &[u8]) -> Result<(), String> {
    let full = resolve(root, path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // grava num arquivo temporário e renomeia, para nunca deixar um arquivo pela metade
    let tmp = full.with_extension(format!("{}.tmp", full.extension().and_then(|e| e.to_str()).unwrap_or("")));
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &full).map_err(|e| e.to_string())
}

pub fn remove(root: &Path, path: &str) -> Result<(), String> {
    match fs::remove_file(resolve(root, path)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Tamanho e data de modificação de cada arquivo: (assinatura, data em ms).
/// O replicador usa isso para não reler PDFs e imagens que não mudaram.
pub fn stat(root: &Path) -> Result<HashMap<String, (String, u64)>, String> {
    let mut out = HashMap::new();
    for rel in list(root, "")? {
        let Ok(meta) = fs::metadata(root.join(&rel)) else { continue };
        let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).unwrap_or_default();
        let sig = format!("{}:{}.{:09}", meta.len(), modified.as_secs(), modified.subsec_nanos());
        out.insert(rel, (sig, modified.as_millis() as u64));
    }
    Ok(out)
}

/// Desfaz o %XX do cabeçalho (o caminho vai codificado porque cabeçalhos só aceitam ASCII).
fn percent_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| format!("caminho mal codificado: {s}"))?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_root(root: State<VaultRoot>) -> String {
    root.0.to_string_lossy().into_owned()
}

#[tauri::command]
pub fn vault_list(root: State<VaultRoot>, prefix: String) -> Result<Vec<String>, String> {
    list(&root.0, &prefix)
}

#[tauri::command]
pub fn vault_read(root: State<VaultRoot>, path: String) -> Result<Option<Vec<u8>>, String> {
    read(&root.0, &path)
}

#[tauri::command]
pub fn vault_write(root: State<VaultRoot>, path: String, data: Vec<u8>) -> Result<(), String> {
    write(&root.0, &path, &data)
}

/// Leitura binária direta (sem passar os bytes por JSON): rápida para PDFs grandes.
#[tauri::command]
pub fn vault_read_raw(root: State<VaultRoot>, path: String) -> Result<Response, String> {
    match read(&root.0, &path)? {
        Some(b) => Ok(Response::new(b)),
        None => Err("ENOENT".into()),
    }
}

/// Gravação binária direta: o conteúdo vai no corpo e o caminho no cabeçalho `path`.
#[tauri::command]
pub fn vault_write_raw(root: State<VaultRoot>, request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("faltou o caminho")
        .and_then(|p| percent_decode(p).map_err(|_| "caminho mal codificado"))?;
    match request.body() {
        InvokeBody::Raw(data) => write(&root.0, &path, data),
        InvokeBody::Json(_) => Err("esperava bytes".into()),
    }
}

/// Abre um arquivo do cofre no programa padrão do sistema (Word, LibreOffice...).
#[cfg(desktop)]
#[tauri::command]
pub fn vault_open_external(app: tauri::AppHandle, root: State<VaultRoot>, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let full = resolve(&root.0, &path)?;
    app.opener().open_path(full.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_stat(root: State<VaultRoot>) -> Result<HashMap<String, (String, u64)>, String> {
    stat(&root.0)
}

#[tauri::command]
pub fn vault_remove(root: State<VaultRoot>, path: String) -> Result<(), String> {
    remove(&root.0, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grava_le_lista_e_apaga() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "mundo/aurath.md", b"Capital: Veyra").unwrap();
        write(root, ".tanden/crdt/abc/arch.bin", &[1, 2, 3]).unwrap();
        assert_eq!(read(root, "mundo/aurath.md").unwrap().unwrap(), b"Capital: Veyra");
        assert_eq!(list(root, "").unwrap(), vec![".tanden/crdt/abc/arch.bin", "mundo/aurath.md"]);
        assert_eq!(list(root, "mundo/").unwrap(), vec!["mundo/aurath.md"]);
        remove(root, "mundo/aurath.md").unwrap();
        assert_eq!(read(root, "mundo/aurath.md").unwrap(), None);
        remove(root, "mundo/aurath.md").unwrap();
    }

    #[test]
    fn assinatura_muda_quando_o_arquivo_muda() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "PDFs/livro.pdf", b"%PDF-1.7 um").unwrap();
        let a = stat(dir.path()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        write(dir.path(), "PDFs/livro.pdf", b"%PDF-1.7 dois").unwrap();
        let b = stat(dir.path()).unwrap();
        assert_ne!(a["PDFs/livro.pdf"].0, b["PDFs/livro.pdf"].0);
        assert!(b["PDFs/livro.pdf"].0.starts_with("13:"));
    }

    #[test]
    fn decodifica_o_caminho_do_cabecalho() {
        assert_eq!(percent_decode("Anexos%2FRelat%C3%B3rio%20final.pdf").unwrap(), "Anexos/Relatório final.pdf");
        assert_eq!(percent_decode("a%").unwrap(), "a%");
        assert!(percent_decode("%ZZ").is_err());
    }

    #[test]
    fn recusa_caminhos_que_saem_do_cofre() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["../fora.md", "/etc/passwd", "a/../../b", ""] {
            assert!(write(dir.path(), bad, b"x").is_err(), "deveria recusar {bad}");
            assert!(read(dir.path(), bad).is_err(), "deveria recusar {bad}");
        }
    }
}
