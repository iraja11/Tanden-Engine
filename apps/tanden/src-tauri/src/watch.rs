//! Vigia a pasta do cofre. Quando outro programa muda uma nota (Claude Code,
//! Gemini CLI, Obsidian), a interface fica sabendo na hora e funde a mudança,
//! sem esperar o sync periódico.

use std::path::Path;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

pub struct VaultWatcher(#[allow(dead_code)] RecommendedWatcher);

/// Só interessa o que é conteúdo: arquivos internos do Tanden ficam de fora.
fn relevant(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?.to_string_lossy().replace('\\', "/");
    let hidden = rel.split('/').any(|part| part.starts_with('.'));
    (!hidden && !rel.is_empty()).then_some(rel)
}

pub fn start(app: AppHandle, root: &Path) -> notify::Result<VaultWatcher> {
    let base = root.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
            return;
        }
        let paths: Vec<String> = event.paths.iter().filter_map(|p| relevant(&base, p)).collect();
        if !paths.is_empty() {
            let _ = app.emit("vault-changed", paths);
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(VaultWatcher(watcher))
}

#[cfg(test)]
mod tests {
    use super::relevant;
    use std::path::Path;

    #[test]
    fn ignora_arquivos_internos() {
        let root = Path::new("/c");
        assert_eq!(relevant(root, Path::new("/c/mundo/aurath.md")), Some("mundo/aurath.md".into()));
        assert_eq!(relevant(root, Path::new("/c/.tanden/crdt/x/dev.bin")), None);
        assert_eq!(relevant(root, Path::new("/c/.obsidian/workspace.json")), None);
        assert_eq!(relevant(root, Path::new("/c/nota.md.tmp")), Some("nota.md.tmp".into()));
    }
}
