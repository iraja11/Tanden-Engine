use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
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
    fn recusa_caminhos_que_saem_do_cofre() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["../fora.md", "/etc/passwd", "a/../../b", ""] {
            assert!(write(dir.path(), bad, b"x").is_err(), "deveria recusar {bad}");
            assert!(read(dir.path(), bad).is_err(), "deveria recusar {bad}");
        }
    }
}
