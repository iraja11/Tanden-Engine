//! Steam: qual jogo está rodando agora, para a Ânima reagir.
//!
//! Tudo local e sem chave. No Linux (Arch incluído, nativo ou Flatpak), o
//! jeito mais rápido é o próprio processo do jogo: a Steam põe `SteamAppId`
//! no ambiente de todo jogo que abre (nativo ou pelo Proton), e lemos isso em
//! `/proc/<pid>/environ` (só processos do seu usuário). Se não achar, vale o
//! `RunningAppID` que o cliente grava (no `registry.vdf`; no Windows, no
//! registro). O nome sai do manifesto da biblioteca (`appmanifest_<id>.acf`) e o
//! tipo do jogo (single, multi ou os dois) das categorias da API pública da
//! loja, guardadas em memória. Só lemos arquivos do próprio Steam; nada é
//! escrito fora do cofre.
//!
//! A chave da Web API é opcional: com ela (e o SteamID achado no
//! `loginusers.vdf`), dá para saber se você está num lobby ou servidor online
//! agora, não só se o jogo TEM multiplayer.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
pub struct JogoSteam {
    pub appid: u32,
    pub nome: String,
    /// "single", "multi", "misto" (os dois) ou "?" (sem informação)
    pub modo: String,
    pub generos: Vec<String>,
    /// numa partida, lobby ou servidor online agora (só com a chave da Web API)
    pub online: Option<bool>,
}

/// nome, modo e gêneros já consultados na loja, por AppID
#[derive(Default)]
pub struct SteamCache(Mutex<HashMap<u32, (String, String, Vec<String>)>>);

// ------------------------------------------------------------------ vdf

/// O valor de uma chave num arquivo VDF/ACF do Steam (`"chave" "valor"`), sem diferenciar maiúsculas.
pub fn vdf_valor(texto: &str, chave: &str) -> Option<String> {
    vdf_valores(texto, chave).into_iter().next()
}

/// Todos os valores de uma chave (ex.: os `"path"` do libraryfolders.vdf).
pub fn vdf_valores(texto: &str, chave: &str) -> Vec<String> {
    let alvo = format!("\"{}\"", chave.to_lowercase());
    let baixo = texto.to_lowercase();
    let mut out = Vec::new();
    let mut ini = 0;
    while let Some(p) = baixo[ini..].find(&alvo) {
        let depois = ini + p + alvo.len();
        let resto = &texto[depois..];
        let a = resto.find('"');
        if let Some(a) = a {
            // só vale se entre a chave e o valor houver só espaço (senão é um bloco)
            if resto[..a].trim().is_empty() {
                if let Some(b) = resto[a + 1..].find('"') {
                    out.push(resto[a + 1..a + 1 + b].replace("\\\\", "\\"));
                }
            }
        }
        ini = depois;
    }
    out
}

/// O SteamID64 da conta usada por último (`"MostRecent" "1"` no loginusers.vdf).
pub fn steamid_recente(texto: &str) -> Option<String> {
    let mut ultimo: Option<String> = None;
    let mut primeiro: Option<String> = None;
    let mut id_atual: Option<String> = None;
    for linha in texto.lines() {
        let l = linha.trim();
        let num = l.trim_matches('"');
        if num.len() == 17 && num.starts_with("7656") && num.chars().all(|c| c.is_ascii_digit()) {
            id_atual = Some(num.to_string());
            if primeiro.is_none() {
                primeiro = Some(num.to_string());
            }
        }
        let baixo = l.to_lowercase();
        if baixo.starts_with("\"mostrecent\"") && baixo.ends_with("\"1\"") {
            ultimo = id_atual.clone();
        }
    }
    ultimo.or(primeiro)
}

/// Single, multi ou os dois, pelas categorias da loja.
pub fn modo_de(categorias: &[u32]) -> &'static str {
    // 1 multijogador, 9 cooperativo, 27 multiplataforma, 36 PvP online, 38 coop online, 47/48 LAN, 49 PvP
    const MULTI: [u32; 8] = [1, 9, 27, 36, 38, 47, 48, 49];
    let multi = categorias.iter().any(|c| MULTI.contains(c));
    let single = categorias.contains(&2);
    match (single, multi) {
        (true, true) => "misto",
        (false, true) => "multi",
        (true, false) => "single",
        _ => "?",
    }
}

// ------------------------------------------------------------------ onde está o Steam

fn casa() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

#[cfg(windows)]
fn reg(valor: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: sem piscar um console a cada consulta
    let out = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", valor])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let linha = s.lines().find(|l| l.trim_start().to_lowercase().starts_with(&valor.to_lowercase()))?;
    // "    SteamPath    REG_SZ    c:/program files (x86)/steam": o valor vem depois do tipo
    let p = linha.find("REG_")?;
    let depois = &linha[p..];
    let fim_tipo = depois.find(char::is_whitespace)?;
    Some(depois[fim_tipo..].trim().to_string())
}

fn pasta_steam() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(p) = reg("SteamPath") {
            let p = PathBuf::from(p);
            if p.exists() {
                return Some(p);
            }
        }
        return ["C:/Program Files (x86)/Steam", "C:/Program Files/Steam"].iter().map(PathBuf::from).find(|p| p.exists());
    }
    #[cfg(not(windows))]
    {
        let h = casa()?;
        let candidatos = [
            h.join(".steam/steam"),
            h.join(".local/share/Steam"),
            h.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
            h.join("Library/Application Support/Steam"),
        ];
        candidatos.into_iter().find(|p| p.join("steamapps").exists())
    }
}

/// O `SteamAppId` do ambiente de um processo (conteúdo de /proc/<pid>/environ, separado por \0).
pub fn appid_do_environ(env: &[u8]) -> Option<u32> {
    env.split(|b| *b == 0).find_map(|kv| {
        let kv = std::str::from_utf8(kv).ok()?;
        let v = kv.strip_prefix("SteamAppId=").or_else(|| kv.strip_prefix("SteamGameId="))?;
        v.parse::<u32>().ok().filter(|n| *n > 0)
    })
}

/// Linux: procura em /proc um processo aberto pela Steam para um jogo.
#[cfg(target_os = "linux")]
fn appid_proc() -> Option<u32> {
    let mut contagem: HashMap<u32, u32> = HashMap::new();
    for e in std::fs::read_dir("/proc").ok()?.flatten() {
        let nome = e.file_name();
        if !nome.to_string_lossy().bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        if let Ok(env) = std::fs::read(e.path().join("environ")) {
            if let Some(id) = appid_do_environ(&env) {
                *contagem.entry(id).or_default() += 1;
            }
        }
    }
    // o jogo costuma ter vários processos (wine, runtime); o AppID mais comum é o dele
    contagem.into_iter().max_by_key(|(_, n)| *n).map(|(id, _)| id)
}

/// O AppID do jogo aberto agora (0 ou nada = nenhum).
fn appid_rodando() -> Option<u32> {
    #[cfg(target_os = "linux")]
    if let Some(id) = appid_proc() {
        return Some(id);
    }
    #[cfg(windows)]
    {
        let v = reg("RunningAppID")?;
        let v = v.trim();
        let n = if let Some(h) = v.strip_prefix("0x") { u32::from_str_radix(h, 16).ok()? } else { v.parse().ok()? };
        return (n > 0).then_some(n);
    }
    #[cfg(not(windows))]
    {
        let h = casa()?;
        let arquivos = [h.join(".steam/registry.vdf"), h.join(".var/app/com.valvesoftware.Steam/.steam/registry.vdf"), h.join("Library/Application Support/Steam/registry.vdf")];
        for a in arquivos {
            if let Ok(t) = std::fs::read_to_string(&a) {
                let n: u32 = vdf_valor(&t, "RunningAppID")?.parse().ok()?;
                return (n > 0).then_some(n);
            }
        }
        None
    }
}

fn nome_local(steam: &Path, appid: u32) -> Option<String> {
    let mut libs = vec![steam.to_path_buf()];
    if let Ok(t) = std::fs::read_to_string(steam.join("steamapps/libraryfolders.vdf")) {
        libs.extend(vdf_valores(&t, "path").into_iter().map(PathBuf::from));
    }
    libs.iter().find_map(|l| std::fs::read_to_string(l.join(format!("steamapps/appmanifest_{appid}.acf"))).ok().and_then(|t| vdf_valor(&t, "name")))
}

// ------------------------------------------------------------------ rede (loja e Web API)

fn cliente() -> Option<reqwest::Client> {
    reqwest::Client::builder().timeout(Duration::from_secs(8)).build().ok()
}

async fn loja(appid: u32) -> Option<(String, String, Vec<String>)> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=portuguese&filters=basic,categories,genres");
    let v: serde_json::Value = cliente()?.get(url).send().await.ok()?.json().await.ok()?;
    let d = v.get(appid.to_string())?.get("data")?;
    let nome = d.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let cats: Vec<u32> = d.get("categories").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|c| c.get("id")?.as_u64().map(|n| n as u32)).collect()).unwrap_or_default();
    let generos = d.get("genres").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|g| g.get("description")?.as_str().map(String::from)).collect()).unwrap_or_default();
    Some((nome, modo_de(&cats).to_string(), generos))
}

/// Pela Web API: está num lobby ou servidor online agora?
async fn online(chave: &str, steamid: &str) -> Option<bool> {
    let url = format!("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={chave}&steamids={steamid}");
    let v: serde_json::Value = cliente()?.get(url).send().await.ok()?.json().await.ok()?;
    let p = v.get("response")?.get("players")?.as_array()?.first()?;
    let tem = |k: &str| p.get(k).and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty() && s != "0" && s != "0.0.0.0:0");
    Some(tem("lobbysteamid") || tem("gameserverip") || tem("gameserversteamid"))
}

// ------------------------------------------------------------------ comando

/// O jogo da Steam aberto agora (ou nada). `chave`: a chave da Web API, opcional.
#[tauri::command]
pub async fn steam_jogo(cache: tauri::State<'_, SteamCache>, chave: Option<String>) -> Result<Option<JogoSteam>, String> {
    let Some(appid) = appid_rodando() else { return Ok(None) };
    let guardado = cache.0.lock().map_err(|e| e.to_string())?.get(&appid).cloned();
    let (mut nome, modo, generos) = match guardado {
        Some(x) => x,
        None => {
            let x = loja(appid).await.unwrap_or_default();
            let x = (x.0, if x.1.is_empty() { "?".into() } else { x.1 }, x.2);
            cache.0.lock().map_err(|e| e.to_string())?.insert(appid, x.clone());
            x
        }
    };
    let steam = pasta_steam();
    if let Some(local) = steam.as_deref().and_then(|s| nome_local(s, appid)) {
        nome = local;
    }
    if nome.is_empty() {
        nome = format!("jogo {appid}");
    }
    let mut on = None;
    if let (Some(k), Some(s)) = (chave.as_deref().filter(|k| !k.trim().is_empty()), steam.as_deref()) {
        if let Some(id) = std::fs::read_to_string(s.join("config/loginusers.vdf")).ok().and_then(|t| steamid_recente(&t)) {
            on = online(k.trim(), &id).await;
        }
    }
    Ok(Some(JogoSteam { appid, nome, modo, generos, online: on }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_valores_do_vdf() {
        let reg = "\"Registry\"\n{\n\t\"HKCU\"\n\t{\n\t\t\"Software\"\n\t\t{\n\t\t\t\"Valve\"\n\t\t\t{\n\t\t\t\t\"Steam\"\n\t\t\t\t{\n\t\t\t\t\t\"RunningAppID\"\t\t\"367520\"\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}";
        assert_eq!(vdf_valor(reg, "runningappid").as_deref(), Some("367520"));
        let acf = "\"AppState\"\n{\n\t\"appid\"\t\t\"367520\"\n\t\"name\"\t\t\"Hollow Knight\"\n}";
        assert_eq!(vdf_valor(acf, "name").as_deref(), Some("Hollow Knight"));
        let libs = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t}\n}";
        assert_eq!(vdf_valores(libs, "path"), vec!["C:\\Program Files (x86)\\Steam".to_string(), "D:\\SteamLibrary".to_string()]);
        // chave que abre um bloco não tem valor
        assert_eq!(vdf_valor("\"apps\"\n{\n\"1\" \"x\"\n}", "apps"), None);
    }

    #[test]
    fn acha_a_conta_mais_recente() {
        let t = "\"users\"\n{\n\t\"76561198000000001\"\n\t{\n\t\t\"AccountName\"\t\t\"a\"\n\t\t\"MostRecent\"\t\t\"0\"\n\t}\n\t\"76561198000000002\"\n\t{\n\t\t\"AccountName\"\t\t\"b\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}";
        assert_eq!(steamid_recente(t).as_deref(), Some("76561198000000002"));
    }

    #[test]
    fn le_o_appid_do_ambiente_do_processo() {
        assert_eq!(appid_do_environ(b"HOME=/home/x\0SteamAppId=1245620\0DISPLAY=:0\0"), Some(1245620));
        assert_eq!(appid_do_environ(b"SteamGameId=730\0"), Some(730));
        assert_eq!(appid_do_environ(b"SteamAppId=0\0PATH=/usr/bin\0"), None);
        assert_eq!(appid_do_environ(b"PATH=/usr/bin\0"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn acha_o_jogo_aberto_pelo_proc() {
        // um "jogo" de mentira: um processo com o ambiente que a Steam põe
        let mut filho = std::process::Command::new("sleep").arg("5").env("SteamAppId", "424242").spawn().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(150));
        let achou = appid_proc();
        let _ = filho.kill();
        let _ = filho.wait();
        assert_eq!(achou, Some(424242));
    }

    #[test]
    fn single_multi_ou_os_dois() {
        assert_eq!(modo_de(&[2, 22, 28]), "single");
        assert_eq!(modo_de(&[1, 36, 49]), "multi");
        assert_eq!(modo_de(&[2, 1, 38]), "misto");
        assert_eq!(modo_de(&[]), "?");
    }
}
