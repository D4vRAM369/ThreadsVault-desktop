#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use regex::Regex;
use serde::Serialize;

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
const THREADS_DOC_ID: &str = "5587632691339264";

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
    let thread_items = json
        .pointer("/data/data/containing_thread/thread_items")?
        .as_array()?;

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

    // El body es application/x-www-form-urlencoded, no JSON
    let body = format!(
        "variables={{\"postID\":\"{post_id}\"}}&doc_id={THREADS_DOC_ID}"
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

fn has_video_thumbnail(source: &str) -> bool {
    source.contains("/t51.71878-")
        || source.contains("/t51.71878_")
        || source.contains("barcelona://media?shortcode=")
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![resolve_threads_video])
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
}
