#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use regex::Regex;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoResolution {
    playable_url: Option<String>,
    download_url: Option<String>,
    reason: Option<String>,
    source: &'static str,
}

fn normalize_html_value(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("\\u002F", "/")
        .replace("\\u0026", "&")
        .replace("\\/", "/")
}

fn extract_first(pattern: &Regex, source: &str) -> Option<String> {
    pattern
        .captures(source)
        .and_then(|captures| captures.get(1))
        .map(|matched| normalize_html_value(matched.as_str()))
}

fn extract_video_candidate(source: &str) -> Option<String> {
    let forced_patterns = [
        Regex::new(r#"<meta[^>]+(?:property|name)=["']og:video["'][^>]+content=["']([^"']+)["']"#).ok()?,
        Regex::new(r#"<meta[^>]+(?:property|name)=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']"#).ok()?,
        Regex::new(r#"<meta[^>]+(?:property|name)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']"#).ok()?,
        Regex::new(r#""video_url"\s*:\s*"([^"]+)""#).ok()?,
        Regex::new(r#""playback_video_url"\s*:\s*"([^"]+)""#).ok()?,
        Regex::new(r#""content_url"\s*:\s*"([^"]+)""#).ok()?,
    ];

    for pattern in forced_patterns {
        if let Some(candidate) = extract_first(&pattern, source) {
            let lower = candidate.to_lowercase();
            if lower.starts_with("http")
                && (lower.contains(".mp4")
                    || lower.contains(".m3u8")
                    || lower.contains(".webm")
                    || lower.contains("mime_type=video")
                    || lower.contains("dash_manifest"))
            {
                return Some(candidate);
            }
        }
    }

    None
}

fn has_video_thumbnail(source: &str) -> bool {
    source.contains("/t51.71878-")
        || source.contains("/t51.71878_")
        || source.contains("barcelona://media?shortcode=")
}

async fn fetch_text(url: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .user_agent("ThreadsVaultDesktop/0.0.0")
        .build()
        .ok()?;

    let response = client
        .get(url)
        .header("Accept-Language", "en,es;q=0.9")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    response.text().await.ok()
}

#[tauri::command]
async fn resolve_threads_video(post_url: String) -> Result<VideoResolution, String> {
    let direct_html = fetch_text(&post_url).await.unwrap_or_default();

    if let Some(playable) = extract_video_candidate(&direct_html) {
        return Ok(VideoResolution {
            playable_url: Some(playable.clone()),
            download_url: Some(playable),
            reason: None,
            source: "desktop",
        });
    }

    let reason = if has_video_thumbnail(&direct_html) {
        Some(String::from(
            "Threads no expone un stream publico reutilizable para este video en el HTML del post",
        ))
    } else {
        Some(String::from(
            "No se encontro metadata de video util en la respuesta publica del post",
        ))
    };

    Ok(VideoResolution {
        playable_url: None,
        download_url: None,
        reason,
        source: "desktop",
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![resolve_threads_video])
        .run(tauri::generate_context!())
        .expect("error while running ThreadsVault desktop");
}
