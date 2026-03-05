#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Constantes — API privada de Threads (reverse-engineered, sin autenticación)
// Referencia: https://github.com/m1guelpf/threads-re
//
// doc_id: identificador de la query GraphQL compilada en el frontend de Threads.
// Puede cambiar en cualquier deploy de Meta — actualizar si la llamada empieza
// a devolver errores. x-ig-app-id es el App ID de Threads en la plataforma Meta.
// ---------------------------------------------------------------------------
const THREADS_GRAPHQL_URL: &str = "https://www.threads.net/api/graphql";
const THREADS_APP_ID: &str = "238260118697367";
const THREADS_DOC_ID: &str = "25944113985283083";

const THREADS_RELAY_PROVIDER_FLAGS: [&str; 29] = [
    "__relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider",
    "__relay_internal__pv__BarcelonaHasCommunitiesrelayprovider",
    "__relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider",
    "__relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider",
    "__relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider",
    "__relay_internal__pv__BarcelonaHasDeepDiverelayprovider",
    "__relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider",
    "__relay_internal__pv__BarcelonaHasEventBadgerelayprovider",
    "__relay_internal__pv__BarcelonaHasGameScoreSharerelayprovider",
    "__relay_internal__pv__BarcelonaHasGhostPostConsumptionrelayprovider",
    "__relay_internal__pv__BarcelonaHasGhostPostEmojiActivationrelayprovider",
    "__relay_internal__pv__BarcelonaHasMusicrelayprovider",
    "__relay_internal__pv__BarcelonaHasPodcastConsumptionrelayprovider",
    "__relay_internal__pv__BarcelonaHasSelfThreadCountrelayprovider",
    "__relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider",
    "__relay_internal__pv__BarcelonaHasTopicTagsrelayprovider",
    "__relay_internal__pv__BarcelonaImplicitTrendsGKrelayprovider",
    "__relay_internal__pv__BarcelonaIsCrawlerrelayprovider",
    "__relay_internal__pv__BarcelonaIsInternalUserrelayprovider",
    "__relay_internal__pv__BarcelonaIsLoggedInrelayprovider",
    "__relay_internal__pv__BarcelonaIsReplyApprovalEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaIsReplyApprovalsConsumptionEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaQuotedPostUFIEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider",
    "__relay_internal__pv__BarcelonaShouldShowFediverseM1Featuresrelayprovider",
    "__relay_internal__pv__IsTagIndicatorEnabledrelayprovider",
    "__relay_internal__pv__BarcelonaInlineComposerEnabledrelayprovider",
];

// Tabla de caracteres Base64 de Instagram/Threads (distinta del Base64 estándar:
// usa '-' y '_' en lugar de '+' y '/', mismo esquema que Base64url de RFC 4648)
const SHORTCODE_TABLE: &str =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// ---------------------------------------------------------------------------
// Tipos de datos serializados para la respuesta al frontend JS (via invoke)
// #[serde(rename_all = "camelCase")] convierte snake_case → camelCase en JSON:
//   playable_url → playableUrl  (lo que espera el TypeScript en desktop-video.ts)
// ---------------------------------------------------------------------------
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoResolution {
    playable_url: Option<String>,
    download_url: Option<String>,
    reason: Option<String>,
    source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoDownloadResult {
    file_path: String,
    file_name: String,
    download_dir: String,
    source: &'static str,
}

// ---------------------------------------------------------------------------
// shortcode_to_post_id
//
// Convierte el shortcode de la URL (ej: "DVOvDwMCsCY") al ID numérico del post.
// Mismo algoritmo que Instagram: decodificación Base64url → entero u128.
//
// ¿Por qué u128 y no u64?
// Los shortcodes de 11 chars representan hasta 64^11 = 2^66 valores.
// El máximo de u64 es 2^64 ≈ 1.84×10^19, insuficiente para algunos IDs.
// u128 tiene capacidad hasta 2^128, más que suficiente.
// ---------------------------------------------------------------------------
fn shortcode_to_post_id(shortcode: &str) -> String {
    let table: Vec<char> = SHORTCODE_TABLE.chars().collect();
    let mut id: u128 = 0;
    for c in shortcode.chars() {
        let pos = table.iter().position(|&x| x == c).unwrap_or(0) as u128;
        id = id * 64 + pos;
    }
    id.to_string()
}

// ---------------------------------------------------------------------------
// extract_shortcode_from_url
//
// Extrae el shortcode del path de la URL de Threads.
// Patrones soportados:
//   https://www.threads.com/@usuario/post/DVOvDwMCsCY
//   https://www.threads.net/@usuario/post/DVOvDwMCsCY
//   https://www.threads.net/t/DVOvDwMCsCY
// ---------------------------------------------------------------------------
fn extract_shortcode_from_url(url: &str) -> Option<String> {
    let re = Regex::new(r"/(?:post|t)/([A-Za-z0-9_-]+)").ok()?;
    re.captures(url)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

// ---------------------------------------------------------------------------
// normalize_html_value
//
// Normaliza valores escapados que aparecen en respuestas JSON de Meta:
//   \u002F → /   (slash unicode escapado)
//   \u0026 → &   (ampersand unicode escapado)
//   \/     → /   (slash con backslash, común en JSON de Meta)
// ---------------------------------------------------------------------------
fn normalize_html_value(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("\\u002F", "/")
        .replace("\\u0026", "&")
        .replace("\\/", "/")
}

// ---------------------------------------------------------------------------
// extract_graphql_video_url_from_value
//
// Función pura: recibe el JSON GraphQL ya parseado y busca la primera URL de
// vídeo absoluta disponible en thread_items[*].post.video_versions[0].url.
// Se mantiene separada del fetch HTTP para poder probarla con tests unitarios.
// ---------------------------------------------------------------------------
fn extract_graphql_video_url_from_value(json: &serde_json::Value) -> Option<String> {
    // Formato legacy (doc_id viejo) de Threads.
    if let Some(thread_items) = json
        .pointer("/data/data/containing_thread/thread_items")
        .and_then(|value| value.as_array())
    {
        for item in thread_items {
            let raw_url = item.pointer("/post/video_versions/0/url").and_then(|value| value.as_str());
            let Some(raw_url) = raw_url else {
                continue;
            };

            let url = normalize_html_value(raw_url);
            if url.starts_with("http") {
                return Some(url);
            }
        }
    }

    // Formato actual (Relay web). Busca cualquier video_versions[*].url
    fn collect_urls(value: &serde_json::Value, out: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, inner) in map {
                    if key == "video_versions" {
                        if let Some(entries) = inner.as_array() {
                            for entry in entries {
                                let raw_url = entry.get("url").and_then(|url| url.as_str());
                                if let Some(raw_url) = raw_url {
                                    let normalized = normalize_html_value(raw_url);
                                    if normalized.starts_with("http") {
                                        out.push(normalized);
                                    }
                                }
                            }
                        }
                    }
                    collect_urls(inner, out);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect_urls(item, out);
                }
            }
            _ => {}
        }
    }

    let mut urls: Vec<String> = Vec::new();
    collect_urls(json, &mut urls);
    if !urls.is_empty() {
        return Some(urls[0].clone());
    }

    None
}

// ---------------------------------------------------------------------------
// fetch_with_client
//
// Helper genérico para GET. Crea un cliente reqwest con el user-agent indicado
// y devuelve el body como String, o None si falla o el status no es 2xx.
// ---------------------------------------------------------------------------
async fn fetch_with_client(url: &str, user_agent: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .user_agent(user_agent)
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

// Shortcut: fetch con el user-agent legacy de la app (para el fallback HTML)
async fn fetch_text(url: &str) -> Option<String> {
    fetch_with_client(url, "ThreadsVaultDesktop/0.0.0").await
}

// ---------------------------------------------------------------------------
// fetch_graphql_video_url
//
// Consulta la API GraphQL privada de Threads para obtener la URL directa
// del vídeo. No requiere autenticación para posts públicos.
//
// Flujo:
//   1. Extrae shortcode de la URL del post
//   2. Convierte shortcode → postID numérico (Base64url decode)
//   3. POST a /api/graphql con el postID y el doc_id de la query
//   4. Parsea el JSON con serde_json::Value::pointer() (JSON Pointer RFC 6901)
//   5. Devuelve la primera video_versions[0].url normalizada
//
// Estructura de respuesta esperada:
// {
//   "data": {
//     "data": {
//       "containing_thread": {
//         "thread_items": [{
//           "post": {
//             "video_versions": [{ "type": 101, "url": "https://scontent..." }]
//           }
//         }]
//       }
//     }
//   }
// }
// ---------------------------------------------------------------------------
async fn fetch_graphql_video_url(post_url: &str) -> Option<String> {
    let shortcode = extract_shortcode_from_url(post_url)?;
    let post_id = shortcode_to_post_id(&shortcode);

    let client = reqwest::Client::builder()
        .user_agent("threads-client")
        .build()
        .ok()?;

    let mut variables = serde_json::Map::new();
    variables.insert("postID".to_string(), serde_json::Value::String(post_id));
    for key in THREADS_RELAY_PROVIDER_FLAGS {
        variables.insert(key.to_string(), serde_json::Value::Bool(false));
    }

    // El body es application/x-www-form-urlencoded, no JSON
    let body = format!(
        "variables={}&doc_id={THREADS_DOC_ID}",
        serde_json::Value::Object(variables)
    );

    let response = client
        .post(THREADS_GRAPHQL_URL)
        .header("x-ig-app-id", THREADS_APP_ID)
        .header("content-type", "application/x-www-form-urlencoded")
        .header("accept", "application/json")
        .body(body)
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    // serde_json::Value es un enum que representa cualquier valor JSON válido:
    // Value::Object, Value::Array, Value::String, Value::Number, Value::Bool, Value::Null
    let json: serde_json::Value = response.json().await.ok()?;

    extract_graphql_video_url_from_value(&json)
}

// ---------------------------------------------------------------------------
// extract_video_candidate — fallback: extrae URL de vídeo del HTML del post
//
// Busca patrones conocidos en el HTML estático (og:video, json blob, etc.)
// Rara vez funciona para Threads (SPA React, HTML sin datos), pero se mantiene
// como segundo fallback por si Meta cambia el doc_id de la query GraphQL.
// ---------------------------------------------------------------------------
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

fn build_embed_url(post_url: &str) -> Option<String> {
    let base = post_url.split('#').next()?.split('?').next()?;
    let trimmed = base.trim_end_matches('/');
    Some(format!("{trimmed}/embed/"))
}

fn extract_oembed_permalink_from_html(oembed_html: &str) -> Option<String> {
    let pattern =
        Regex::new(r#"data-text-post-permalink=["']([^"']+)["']"#).ok()?;
    extract_first(&pattern, oembed_html)
}

fn is_video_like_url(candidate: &str) -> bool {
    let lower = candidate.to_lowercase();
    lower.starts_with("http")
        && (lower.contains(".mp4")
            || lower.contains(".m3u8")
            || lower.contains("mime_type=video")
            || (lower.contains("cdninstagram.com") && lower.contains("/t16/")))
}

fn extract_video_candidate_from_embed(source: &str) -> Option<String> {
    let embed_patterns = [
        Regex::new(r#"<source[^>]+src=["']([^"']+)["']"#).ok()?,
        Regex::new(r#"<video[^>]+src=["']([^"']+)["']"#).ok()?,
        Regex::new(r#""(?:video_url|playback_video_url|content_url)"\s*:\s*"([^"]+)""#).ok()?,
    ];

    for pattern in embed_patterns {
        if let Some(candidate) = extract_first(&pattern, source) {
            if is_video_like_url(&candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

async fn fetch_oembed_permalink(post_url: &str) -> Option<String> {
    let endpoint = reqwest::Url::parse_with_params(
        "https://www.threads.net/api/v1/oembed/",
        &[("url", post_url)],
    )
    .ok()?
    .to_string();
    let body = fetch_with_client(
        &endpoint,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    )
    .await?;

    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let html = json.get("html")?.as_str()?;
    extract_oembed_permalink_from_html(html)
}

fn has_video_thumbnail(source: &str) -> bool {
    source.contains("/t51.71878-")
        || source.contains("/t51.71878_")
        || source.contains("barcelona://media?shortcode=")
}

fn is_supported_threads_url(post_url: &str) -> bool {
    let re = Regex::new(r"^https?://(www\.)?threads\.(net|com)/").ok();
    re.map(|pattern| pattern.is_match(post_url)).unwrap_or(false)
}

fn user_home_dir() -> Result<PathBuf, String> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|_| String::from("No se encontro el directorio de usuario"))
}

fn threadsvault_downloads_dir() -> Result<PathBuf, String> {
    Ok(user_home_dir()?.join("Downloads").join("ThreadsVault"))
}

// ---------------------------------------------------------------------------
// resolve_threads_video — comando Tauri invocado desde el frontend JS
//
// Orden de intentos (del más al menos fiable):
//   1. GraphQL API privada → URL directa del CDN (sin autenticación, ~1s)
//   2. Extracción HTML     → fallback si cambia el doc_id de GraphQL (~3-8s)
//
// Devuelve VideoResolution con playableUrl si tiene éxito, o reason si falla.
// El frontend en desktop-video.ts recibe este resultado via invoke().
// ---------------------------------------------------------------------------
#[tauri::command]
async fn resolve_threads_video(post_url: String) -> Result<VideoResolution, String> {
    // ── Intento 1: API GraphQL privada ──────────────────────────────────────
    if let Some(video_url) = fetch_graphql_video_url(&post_url).await {
        return Ok(VideoResolution {
            playable_url: Some(video_url.clone()),
            download_url: Some(video_url),
            reason: None,
            source: "desktop",
        });
    }

    // ── Intento 2: Extracción de HTML ───────────────────────────────────────
    let direct_html = fetch_text(&post_url).await.unwrap_or_default();

    if let Some(playable) = extract_video_candidate(&direct_html) {
        return Ok(VideoResolution {
            playable_url: Some(playable.clone()),
            download_url: Some(playable),
            reason: None,
            source: "desktop",
        });
    }

    // -- Intento 3: /embed/ directo y permalink canónico de oEmbed --
    let mut embed_candidates: Vec<String> = Vec::new();
    if let Some(embed_url) = build_embed_url(&post_url) {
        embed_candidates.push(embed_url);
    }

    if let Some(permalink) = fetch_oembed_permalink(&post_url).await {
        if let Some(embed_url) = build_embed_url(&permalink) {
            if !embed_candidates.contains(&embed_url) {
                embed_candidates.push(embed_url);
            }
        }
    }

    for embed_url in embed_candidates {
        if let Some(embed_html) = fetch_with_client(
            &embed_url,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        )
        .await
        {
            if let Some(playable) = extract_video_candidate_from_embed(&embed_html) {
                return Ok(VideoResolution {
                    playable_url: Some(playable.clone()),
                    download_url: Some(playable),
                    reason: None,
                    source: "desktop",
                });
            }
        }
    }

    // ── Sin resultado ───────────────────────────────────────────────────────
    let reason = if has_video_thumbnail(&direct_html) {
        Some(String::from(
            "Threads no expone el stream publico de este video (CDN firmado)",
        ))
    } else {
        Some(String::from(
            "No se encontro metadata de video en la respuesta del post",
        ))
    };

    Ok(VideoResolution {
        playable_url: None,
        download_url: None,
        reason,
        source: "desktop",
    })
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_threads_video(
    _app: tauri::AppHandle,
    post_url: String,
) -> Result<VideoDownloadResult, String> {
    if !is_supported_threads_url(&post_url) {
        return Err(String::from("Solo se permiten URLs de Threads (threads.net o threads.com)."));
    }

    let download_dir = threadsvault_downloads_dir()?;
    std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;

    let shortcode = extract_shortcode_from_url(&post_url).unwrap_or_else(|| String::from("post"));
    let unix_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let output_prefix = format!("threadsvault-{shortcode}-{unix_ts}");
    // Flujo principal: usa el mismo resolver completo de la app
    // (GraphQL + fallback HTML) para evitar depender del extractor de yt-dlp.
    let resolved = resolve_threads_video(post_url.clone()).await?;
    if let Some(video_url) = resolved.download_url.or(resolved.playable_url) {
        let direct_output = download_dir.join(format!("{output_prefix}.mp4"));

        let client = reqwest::Client::builder()
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            )
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(&video_url)
            .header("Referer", "https://www.threads.net/")
            .header("Accept", "*/*")
            .send()
            .await
            .map_err(|e| format!("No se pudo iniciar la descarga directa: {e}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "No se pudo descargar el stream directo (HTTP {}).",
                response.status()
            ));
        }

        let body = response
            .bytes()
            .await
            .map_err(|e| format!("Error leyendo datos del video: {e}"))?;

        std::fs::write(&direct_output, &body).map_err(|e| e.to_string())?;

        let file_name = direct_output
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("video.mp4")
            .to_string();

        return Ok(VideoDownloadResult {
            file_path: direct_output.to_string_lossy().to_string(),
            file_name,
            download_dir: download_dir.to_string_lossy().to_string(),
            source: "seal-plus",
        });
    }

    Err(format!(
        "No se pudo resolver una URL de video descargable para este post. {}",
        resolved
            .reason
            .unwrap_or_else(|| String::from("Threads no expone stream publico en este caso."))
    ))
}

// ---------------------------------------------------------------------------
// save_backup — guarda el JSON de backup en la carpeta Descargas del usuario
//
// WebView2 descarta silenciosamente los downloads via <a download> + Blob URL.
// Este comando lo resuelve desde Rust nativo con std::fs::write, que tiene
// permisos OS completos sin necesitar plugins adicionales.
// Devuelve la ruta completa del archivo para mostrarla al usuario.
// ---------------------------------------------------------------------------
#[tauri::command]
fn save_backup(content: String, filename: String) -> Result<String, String> {
    let downloads = user_home_dir()?.join("Downloads");
    std::fs::create_dir_all(&downloads).ok();

    let file_path = downloads.join(&filename);
    std::fs::write(&file_path, content.as_bytes()).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            resolve_threads_video,
            download_threads_video,
            open_url,
            save_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running ThreadsVault desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_video_url_from_first_thread_item() {
        let payload = json!({
            "data": {
                "data": {
                    "containing_thread": {
                        "thread_items": [
                            {
                                "post": {
                                    "video_versions": [
                                        {
                                            "url": "https:\\/\\/cdn.example.com\\/video.mp4?x=1\\u0026y=2"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        });

        assert_eq!(
            extract_graphql_video_url_from_value(&payload),
            Some(String::from("https://cdn.example.com/video.mp4?x=1&y=2"))
        );
    }

    #[test]
    fn extracts_video_url_from_later_thread_item_when_first_has_no_video() {
        let payload = json!({
            "data": {
                "data": {
                    "containing_thread": {
                        "thread_items": [
                            {
                                "post": {
                                    "video_versions": []
                                }
                            },
                            {
                                "post": {
                                    "video_versions": [
                                        {
                                            "url": "https://cdn.example.com/fallback.mp4"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        });

        assert_eq!(
            extract_graphql_video_url_from_value(&payload),
            Some(String::from("https://cdn.example.com/fallback.mp4"))
        );
    }

    #[test]
    fn extracts_video_url_from_current_relay_graphql_shape() {
        let payload = json!({
            "data": {
                "media": {
                    "pk": "3846232660482048762",
                    "video_versions": [
                        {
                            "type": 101,
                            "url": "https://scontent.cdninstagram.com/o1/v/t16/example.mp4?_nc_sid=5e9851"
                        }
                    ]
                }
            }
        });

        assert_eq!(
            extract_graphql_video_url_from_value(&payload),
            Some(String::from("https://scontent.cdninstagram.com/o1/v/t16/example.mp4?_nc_sid=5e9851"))
        );
    }

    #[test]
    fn returns_none_when_video_url_is_not_absolute() {
        let payload = json!({
            "data": {
                "data": {
                    "containing_thread": {
                        "thread_items": [
                            {
                                "post": {
                                    "video_versions": [
                                        {
                                            "url": "/relative/video.mp4"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        });

        assert_eq!(extract_graphql_video_url_from_value(&payload), None);
    }

    #[test]
    fn extracts_video_url_from_embed_html() {
        let html = r#"
            <video controls="1">
              <source src="https://cdn.example.com/path/video.mp4?x=1&amp;y=2" />
            </video>
        "#;

        assert_eq!(
            extract_video_candidate_from_embed(html),
            Some(String::from("https://cdn.example.com/path/video.mp4?x=1&y=2"))
        );
    }

    #[test]
    fn builds_embed_url_from_post_url() {
        assert_eq!(
            build_embed_url("https://www.threads.com/@user/post/ABC123?foo=bar"),
            Some(String::from("https://www.threads.com/@user/post/ABC123/embed/"))
        );
    }

    #[test]
    fn extracts_permalink_from_oembed_html() {
        let html = r#"<blockquote data-text-post-permalink="https://www.threads.com/@user/post/ABC123"></blockquote>"#;
        assert_eq!(
            extract_oembed_permalink_from_html(html),
            Some(String::from("https://www.threads.com/@user/post/ABC123"))
        );
    }
}

