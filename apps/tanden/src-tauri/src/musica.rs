//! A música tocando agora no programa do Spotify (e, se ele não estiver
//! aberto, em outro player de música do computador).
//!
//! No Linux os players publicam o que tocam no D-Bus (MPRIS). Isso funciona
//! com a janela minimizada ou em outra área de trabalho, ao contrário do
//! título da janela, que só aparece quando ela está em foco. Usa o
//! `dbus-send`, que vem com o próprio D-Bus (não precisa do playerctl).
//! Navegadores ficam de fora: a aba já é lida pela janela em foco.

use serde::Serialize;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Debug, PartialEq, Default, Clone)]
pub struct Faixa {
    /// "spotify", "vlc", "elisa"...
    pub player: String,
    pub artista: String,
    pub titulo: String,
    pub album: String,
    /// identificador da faixa (muda a cada música)
    pub id: String,
    pub tocando: bool,
    pub duracao_ms: u64,
}

fn rodar(args: &[&str]) -> Option<String> {
    let mut filho = Command::new("dbus-send").args(args).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
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
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Tira as aspas de `string "..."` (o dbus-send não escapa aspas internas).
fn texto(l: &str) -> Option<String> {
    let a = l.find("string \"")? + 8;
    let b = l.rfind('"')?;
    (b >= a).then(|| l[a..b].to_string())
}

/// Lê a saída de `Properties.GetAll` do `org.mpris.MediaPlayer2.Player`.
pub fn ler_mpris(saida: &str, player: &str) -> Option<Faixa> {
    let mut f = Faixa { player: player.to_string(), ..Default::default() };
    let linhas: Vec<&str> = saida.lines().map(str::trim).collect();
    let mut i = 0;
    while i < linhas.len() {
        let l = linhas[i];
        let chave = if l.starts_with("string \"") && !l.contains("variant") { texto(l) } else { None };
        if let Some(k) = chave {
            // o valor vem na linha seguinte ("variant string ...") ou numa lista logo abaixo
            let v = linhas.get(i + 1).copied().unwrap_or("");
            match k.as_str() {
                "PlaybackStatus" => f.tocando = texto(v).as_deref() == Some("Playing"),
                "xesam:title" => f.titulo = texto(v).unwrap_or_default(),
                "xesam:album" => f.album = texto(v).unwrap_or_default(),
                "mpris:trackid" => f.id = texto(v).or_else(|| v.split_whitespace().last().map(|x| x.trim_matches('"').to_string())).unwrap_or_default(),
                "mpris:length" => f.duracao_ms = v.split_whitespace().last().and_then(|x| x.parse::<u64>().ok()).unwrap_or(0) / 1000,
                "xesam:artist" => {
                    let mut nomes = vec![];
                    let mut j = i + 2;
                    while let Some(x) = linhas.get(j) {
                        if x.starts_with(']') {
                            break;
                        }
                        if let Some(n) = texto(x) {
                            nomes.push(n);
                        }
                        j += 1;
                    }
                    f.artista = nomes.join(", ");
                }
                _ => {}
            }
        }
        i += 1;
    }
    if f.id.is_empty() {
        f.id = format!("{}|{}", f.artista, f.titulo);
    }
    (!f.titulo.is_empty()).then_some(f)
}

/// Os players MPRIS abertos, Spotify primeiro; navegadores e o KDE Connect ficam de fora.
pub fn players(lista: &str) -> Vec<String> {
    let mut xs: Vec<String> = lista
        .lines()
        .filter_map(texto)
        .filter(|n| n.starts_with("org.mpris.MediaPlayer2."))
        .filter(|n| !["firefox", "chrom", "brave", "vivaldi", "opera", "edge", "plasma-browser-integration", "kdeconnect", "zen", "librewolf", "floorp"].iter().any(|b| n.contains(b)))
        .collect();
    xs.sort_by_key(|n| !n.contains("spotify"));
    xs
}

#[cfg(target_os = "linux")]
fn tocando() -> Result<Option<Faixa>, String> {
    let lista = rodar(&["--session", "--print-reply", "--dest=org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.ListNames"])
        .ok_or("não consegui falar com o D-Bus (o pacote dbus está instalado?)")?;
    let mut pausada = None;
    for nome in players(&lista) {
        let dest = format!("--dest={nome}");
        let Some(s) = rodar(&["--session", "--print-reply", &dest, "/org/mpris/MediaPlayer2", "org.freedesktop.DBus.Properties.GetAll", "string:org.mpris.MediaPlayer2.Player"]) else { continue };
        let curto = nome.trim_start_matches("org.mpris.MediaPlayer2.").split('.').next().unwrap_or("").to_string();
        if let Some(f) = ler_mpris(&s, &curto) {
            if f.tocando {
                return Ok(Some(f));
            }
            pausada.get_or_insert(f);
        }
    }
    Ok(pausada)
}

#[cfg(not(target_os = "linux"))]
fn tocando() -> Result<Option<Faixa>, String> {
    Err("ler a música tocando só funciona no Linux por enquanto".into())
}

#[tauri::command]
pub async fn musica_tocando() -> Result<Option<Faixa>, String> {
    tauri::async_runtime::spawn_blocking(tocando).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAIDA: &str = r#"method return time=1 sender=:1.1 -> destination=:1.2 serial=49 reply_serial=2
   array [
      dict entry(
         string "PlaybackStatus"
         variant             string "Playing"
      )
      dict entry(
         string "Metadata"
         variant             array [
               dict entry(
                  string "mpris:trackid"
                  variant                      string "/com/spotify/track/6vRk"
               )
               dict entry(
                  string "mpris:length"
                  variant                      uint64 282626000
               )
               dict entry(
                  string "xesam:album"
                  variant                      string "LiTTLE DEViL PARADE"
               )
               dict entry(
                  string "xesam:artist"
                  variant                      array [
                        string "LiSA"
                        string "Aimer"
                     ]
               )
               dict entry(
                  string "xesam:title"
                  variant                      string "Catch the Moment"
               )
            ]
      )
   ]"#;

    #[test]
    fn le_o_spotify() {
        let f = ler_mpris(SAIDA, "spotify").unwrap();
        assert_eq!(f.titulo, "Catch the Moment");
        assert_eq!(f.artista, "LiSA, Aimer");
        assert_eq!(f.album, "LiTTLE DEViL PARADE");
        assert_eq!(f.id, "/com/spotify/track/6vRk");
        assert_eq!(f.duracao_ms, 282626);
        assert!(f.tocando);
    }

    #[test]
    fn spotify_primeiro_e_sem_navegador() {
        let l = "   array [\n      string \"org.freedesktop.DBus\"\n      string \"org.mpris.MediaPlayer2.brave.instance1418\"\n      string \"org.mpris.MediaPlayer2.vlc\"\n      string \"org.mpris.MediaPlayer2.spotify\"\n      string \"org.mpris.MediaPlayer2.plasma-browser-integration\"\n   ]";
        assert_eq!(players(l), vec!["org.mpris.MediaPlayer2.spotify".to_string(), "org.mpris.MediaPlayer2.vlc".to_string()]);
    }

    #[test]
    fn sem_titulo_nao_e_faixa() {
        assert_eq!(ler_mpris("string \"PlaybackStatus\"\nvariant string \"Stopped\"", "spotify"), None);
    }
}
