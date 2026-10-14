//! Atualização no Android. O atualizador do Tauri só funciona no desktop, então
//! no celular o app lê o `android.json` da última release do GitHub e, se houver
//! versão nova, abre o APK no navegador para o Android instalar por cima.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// "usuario/repositorio", embutido pelo build do GitHub Actions.
const REPO: Option<&str> = option_env!("TANDEN_REPO");

#[derive(Serialize)]
pub struct ReleaseInfo {
    os: &'static str,
    version: String,
    repo: Option<&'static str>,
}

#[derive(Serialize, Deserialize)]
pub struct AndroidRelease {
    pub version: String,
    pub url: String,
}

#[tauri::command]
pub fn release_info(app: AppHandle) -> ReleaseInfo {
    ReleaseInfo {
        os: std::env::consts::OS,
        version: app.package_info().version.to_string(),
        repo: REPO,
    }
}

/// Devolve a release mais nova se ela for mais nova que este app.
#[tauri::command]
pub async fn release_android_check(app: AppHandle) -> Result<Option<AndroidRelease>, String> {
    let Some(repo) = REPO else { return Ok(None) };
    let url = format!("https://github.com/{repo}/releases/latest/download/android.json");
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None); // release ainda sem APK
    }
    let latest: AndroidRelease = res.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let current = app.package_info().version.to_string();
    Ok(is_newer(&latest.version, &current).then_some(latest))
}

/// Abre o APK no navegador; o Android baixa e oferece instalar por cima.
#[tauri::command]
pub fn release_open_apk(app: AppHandle, url: String) -> Result<(), String> {
    let repo = REPO.ok_or("repositório desconhecido")?;
    if !url.starts_with(&format!("https://github.com/{repo}/releases/")) {
        return Err("endereço fora das releases do Tanden".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

fn parts(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

fn is_newer(candidate: &str, current: &str) -> bool {
    parts(candidate) > parts(current)
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn compara_versoes_por_numero() {
        assert!(is_newer("0.1.10", "0.1.9"));
        assert!(is_newer("v0.2.0", "0.1.99"));
        assert!(!is_newer("0.1.9", "0.1.9"));
        assert!(!is_newer("0.1.8", "0.1.9"));
    }
}
