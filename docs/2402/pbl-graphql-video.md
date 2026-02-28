# PBL — Descarga de vídeo con la API GraphQL privada de Threads

**Sesión**: 28 febrero 2026
**Archivos modificados**:
- `src-tauri/Cargo.toml` — añadido `serde_json` y feature `json` de reqwest
- `src-tauri/src/main.rs` — refactorizado con GraphQL resolver como primer intento

---

## El contexto: por qué este fix era necesario

En la sesión anterior (`pbl-video-embed.md`) descubrimos que:
1. Threads devuelve **503** a todas las peticiones automatizadas directas
2. La API oEmbed también devuelve 503
3. El único endpoint que respondía era Jina Reader (200), pero Jina devuelve markdown — no URLs de stream de vídeo

La investigación en GitHub reveló que existe una **API GraphQL privada** en `https://www.threads.net/api/graphql` que devuelve la URL directa del vídeo **sin autenticación** para posts públicos. Esta es la misma API que usa el frontend web de Threads internamente.

---

## Conceptos nuevos de esta sesión

### Qué es GraphQL

**REST** (el estilo que hemos visto hasta ahora) funciona así:
```
GET /api/posts/123     → datos del post 123
GET /api/users/456     → datos del usuario 456
```
Cada recurso tiene su propia URL, cada endpoint devuelve datos fijos.

**GraphQL** es un lenguaje de consulta alternativo donde hay **un solo endpoint** y tú defines exactamente qué datos quieres:
```
POST /api/graphql
Body: { query: "{ post(id:123) { title, video_url, author { name } } }" }
```
Ventaja: el cliente pide exactamente lo que necesita, sin más ni menos.

Threads usa GraphQL internamente, pero en lugar de queries escritas (que exponen la estructura), usa **queries compiladas** identificadas por un `doc_id` — un número que corresponde a una query predefinida en el servidor.

### Qué es un `doc_id`

Meta/Facebook compila las queries GraphQL de sus apps en el servidor. En lugar de enviar la query completa, el cliente envía solo el identificador (`doc_id`) de la query que quiere ejecutar.

```
POST https://www.threads.net/api/graphql
variables={"postID":"12345"}&doc_id=5587632691339264
               ↑ parámetros           ↑ "dame los datos del post" (query precompilada)
```

El `doc_id=5587632691339264` es el identificador de la query que devuelve los detalles de un post incluyendo `video_versions`. **Riesgo**: Meta puede cambiar este número en cualquier deploy del frontend de Threads — habría que actualizarlo.

### Qué es Base64url y por qué convertimos el shortcode

La URL de un post de Threads: `https://www.threads.com/@pabloparedes.mx/post/DVOvDwMCsCY`

El shortcode `DVOvDwMCsCY` es la representación en **Base64url** del ID numérico del post. Base64url es una variante de Base64 que usa:
- `A-Z` (26), `a-z` (26), `0-9` (10), `-`, `_` = **64 caracteres** (6 bits por carácter)
- Distinta del Base64 estándar que usa `+` y `/` (que conflictan con URLs)

Para llamar a la API GraphQL necesitamos el ID numérico, no el shortcode. La conversión es una decodificación Base64:

```
"DVOvDwMCsCY"
→ cada carácter tiene un valor 0-63 según su posición en la tabla
→ se construye un entero: D(3) * 64^10 + V(21) * 64^9 + O(14) * 64^8 + ...
→ = 3387195987943866705 (el ID numérico del post)
```

Este es el mismo algoritmo que Instagram — Threads heredó toda la infraestructura.

### Por qué u128 y no u64

Los tipos enteros en Rust tienen tamaño fijo. Si el número que intentas almacenar es más grande que el máximo del tipo, hay un **overflow** (desbordamiento):

```rust
let max_u64: u64 = 18_446_744_073_709_551_615;  // 2^64 - 1
// Un shortcode de 11 chars puede generar hasta 64^11 = 73_786_976_294_838_206_464
// Eso es mayor que u64::MAX → overflow → resultado incorrecto
```

Con u128 (2^128 ≈ 3.4 × 10^38) tenemos margen más que suficiente.

---

## El algoritmo shortcode → ID en Rust

```rust
const SHORTCODE_TABLE: &str =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn shortcode_to_post_id(shortcode: &str) -> String {
    // Vec<char>: convertimos el string de tabla a vector de caracteres
    // para poder usar .position() — índice del carácter en la tabla
    let table: Vec<char> = SHORTCODE_TABLE.chars().collect();

    let mut id: u128 = 0;

    for c in shortcode.chars() {
        // position() busca el índice del carácter en la tabla (0-63)
        // unwrap_or(0): si no se encuentra (carácter inválido), usa 0
        // as u128: convierte usize → u128 para la aritmética
        let pos = table.iter().position(|&x| x == c).unwrap_or(0) as u128;

        // Algoritmo de decodificación Base64: shift left 6 bits + nuevo valor
        // Equivalente a: id = id * 64 + pos
        id = id * 64 + pos;
    }

    // to_string() convierte u128 → String (ej: "3387195987943866705")
    id.to_string()
}
```

Paso a paso con "AB":
```
Iteración 1 (carácter 'A'):
  pos = 0  (A es el índice 0 en la tabla)
  id  = 0 * 64 + 0 = 0

Iteración 2 (carácter 'B'):
  pos = 1  (B es el índice 1)
  id  = 0 * 64 + 1 = 1

Resultado: "1"
```

Con "BA":
```
Iteración 1 ('B'): id = 0 * 64 + 1 = 1
Iteración 2 ('A'): id = 1 * 64 + 0 = 64
Resultado: "64"
```

### La misma lógica en TypeScript (para referencia)

```typescript
function shortcodeToId(shortcode: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let id = BigInt(0)                        // BigInt porque JS number no llega a 2^66
  for (const char of shortcode) {
    id = id * BigInt(64) + BigInt(table.indexOf(char))
  }
  return id.toString()
}
```

JavaScript usa `BigInt` por el mismo motivo que Rust usa `u128` — el tipo `number` de JS es un float64, que solo puede representar enteros exactos hasta 2^53.

---

## La llamada a la API GraphQL en Rust

### Dependencias añadidas a Cargo.toml

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
serde_json = "1"
```

**¿Qué es cada feature de reqwest?**
- `default-features = false` → desactiva todas las features por defecto (reduce el tamaño del binario)
- `rustls-tls` → implementación de TLS (HTTPS) en Rust puro, sin OpenSSL del sistema
- `json` → habilita el método `.json()` en las respuestas, que deserializa JSON automáticamente

**¿Qué es serde_json?**
`serde` (SERialization/DEserialization) es el framework estándar de Rust para convertir entre estructuras de datos y formatos (JSON, TOML, YAML, etc.). `serde_json` es su implementación para JSON. Ofrece `serde_json::Value`, un enum que puede representar cualquier valor JSON válido.

### El código completo de la función

```rust
async fn fetch_graphql_video_url(post_url: &str) -> Option<String> {
    // 1. Extraer shortcode de la URL
    let shortcode = extract_shortcode_from_url(post_url)?;
    // ? aquí: si extract_shortcode_from_url devuelve None, la función retorna None

    // 2. Convertir shortcode → ID numérico
    let post_id = shortcode_to_post_id(&shortcode);

    // 3. Crear cliente HTTP con user-agent que Threads acepta
    let client = reqwest::Client::builder()
        .user_agent("threads-client")
        .build()
        .ok()?;
    // .ok() convierte Result<Client, Error> → Option<Client>
    // ? propaga None si la construcción falló

    // 4. Construir el body en formato application/x-www-form-urlencoded
    // (el mismo formato que usan los formularios HTML)
    let body = format!(
        "variables={{\"postID\":\"{post_id}\"}}&doc_id={THREADS_DOC_ID}"
    );
    // format!() con {{ y }} → escapa las llaves literales en el string
    // Las llaves simples { } se usan para interpolar variables

    // 5. Hacer la petición POST
    let response = client
        .post(THREADS_GRAPHQL_URL)
        .header("x-ig-app-id", THREADS_APP_ID)   // App ID de Threads en Meta
        .header("content-type", "application/x-www-form-urlencoded")
        .header("accept", "application/json")
        .body(body)
        .send()
        .await    // .await: espera a que la petición async complete
        .ok()?;   // .ok()?: convierte Err → None y propaga

    // 6. Verificar que la respuesta es 2xx
    if !response.status().is_success() {
        return None;
    }

    // 7. Parsear el body como JSON en serde_json::Value
    // Value es un enum que puede ser: Object, Array, String, Number, Bool, Null
    let json: serde_json::Value = response.json().await.ok()?;

    // 8. Navegar el árbol JSON con JSON Pointer (RFC 6901)
    // pointer() toma un path con "/" como separador de niveles
    // Los arrays se indexan con números: "/thread_items/0" = primer elemento
    let raw_url = json
        .pointer("/data/data/containing_thread/thread_items/0/post/video_versions/0/url")?
        .as_str()?;
    // .as_str(): extrae el &str del Value::String, o None si no es un string

    // 9. Normalizar caracteres escapados en URLs de Meta CDN
    let url = normalize_html_value(raw_url);

    // 10. Validar que es una URL absoluta antes de devolver
    if url.starts_with("http") {
        Some(url)
    } else {
        None
    }
}
```

### La estructura JSON de respuesta que esperamos

```json
{
  "data": {
    "data": {
      "containing_thread": {
        "thread_items": [
          {
            "post": {
              "pk": "3387195987943866705",
              "media_type": 2,
              "video_versions": [
                {
                  "type": 101,
                  "url": "https://scontent-mad1-1.cdninstagram.com/v/..."
                }
              ]
            }
          }
        ]
      }
    }
  }
}
```

El JSON Pointer `/data/data/containing_thread/thread_items/0/post/video_versions/0/url`:
- `/data` → campo "data" del objeto raíz
- `/data` → campo "data" del objeto anidado
- `/containing_thread` → campo "containing_thread"
- `/thread_items` → array de items del hilo
- `/0` → primer elemento del array (el post principal)
- `/post` → el objeto post
- `/video_versions` → array de versiones del vídeo
- `/0` → primera versión (mayor calidad, type 101)
- `/url` → la URL del vídeo

### Qué es `media_type: 2`

Meta usa códigos numéricos para el tipo de media:
- `1` = imagen
- `2` = vídeo
- `8` = carrusel (múltiples imágenes/vídeos)

El campo `video_versions[0].type: 101` indica la calidad: 101 = máxima resolución disponible.

---

## El orden de intentos en `resolve_threads_video`

```rust
#[tauri::command]
async fn resolve_threads_video(post_url: String) -> Result<VideoResolution, String> {
    // ── Intento 1: API GraphQL (rápido, ~1-2s) ──────────────────────────────
    if let Some(video_url) = fetch_graphql_video_url(&post_url).await {
        return Ok(VideoResolution {
            playable_url: Some(video_url.clone()),
            download_url: Some(video_url),
            reason: None,
            source: "desktop",
        });
    }

    // ── Intento 2: Extracción de HTML (lento, fallback) ──────────────────────
    let direct_html = fetch_text(&post_url).await.unwrap_or_default();
    if let Some(playable) = extract_video_candidate(&direct_html) {
        return Ok(VideoResolution { ... });
    }

    // ── Sin resultado ────────────────────────────────────────────────────────
    Ok(VideoResolution { playable_url: None, reason: Some("..."), ... })
}
```

**`if let Some(value) = expression`** — pattern matching: si `expression` es `Some(value)`, ejecuta el bloque y liga `value`. Si es `None`, salta el bloque. Es la forma idiomática de Rust de manejar `Option` sin `unwrap()` (que causaría panic si es None).

**`#[tauri::command]`** — macro de Tauri que registra la función para que el frontend JavaScript pueda invocarla con `invoke('resolve_threads_video', { postUrl: "..." })`. Tauri maneja automáticamente:
- La serialización de los parámetros (JS → Rust)
- La deserialización del resultado (Rust → JS)
- La conversión de `Result<T, E>` a Promise que puede ser `.catch()`ada en JS

---

## Flujo completo de la app para un post con vídeo

```
Usuario guarda post de Threads con vídeo
  │
  ↓
extractPostData() [post-extractor.ts]
  ├─ Detecta thumbnail t51.71878 en CDN de Meta
  └─ Crea media con type: 'video-link', url: canonical_url

Usuario abre PostDetailScreen
  │
  ↓
onMount → loadInlineVideo(media) [PostDetailScreen.svelte]
  │
  ↓
Promise.all([                          ← PARALELO, ~8s máximo
  resolveDesktopVideo(postUrl),        ← invoca Rust: GraphQL → HTML fallback
  resolvePlayableVideoUrl(postUrl),    ← JS: oEmbed + fetch directo + Jina
  fetchOEmbedHtml(postUrl),            ← JS: oEmbed iframe HTML
])
  │
  ├─ Si desktopResolution.playableUrl → <video src="..."> (descargable)
  ├─ Si resolvedUrl                   → <video src="...">
  ├─ Si oembedHtml                    → <iframe srcdoc="...">
  └─ Si todo falla                    → "Vídeo en Threads" + "Ver en Threads ↗"

En Tauri desktop (app real, no localhost:5173):
  resolveDesktopVideo invoca Rust →
    fetch_graphql_video_url →
      POST /api/graphql con postID →
        video_versions[0].url →
          URL directa del CDN de Meta →
            <video controls src="https://scontent..."> ✓
```

---

## Por qué la API GraphQL no devuelve 503

A diferencia de los fetch directos a la página del post (`/post/DVOvDwMCsCY`), el endpoint GraphQL acepta peticiones programáticas porque:
1. Es la misma API que usa el frontend de Threads — está diseñada para peticiones automatizadas
2. No hay mecanismo de bot-detection en `/api/graphql` para posts públicos
3. El user-agent `threads-client` es suficiente (sin cookies de sesión para posts públicos)

Sin embargo, **puede fallar si**:
- El `doc_id` cambia (Meta deploya una nueva versión del frontend)
- El post es privado (requeriría token Bearer)
- Meta añade rate-limiting en el futuro

---

## Riesgos legales y técnicos

**Legales**: Esta API es privada (no documentada oficialmente). Meta envió cartas de cese y desistimiento a los proyectos `junhoyeo/threads-api` y `dmytrostriletskyi/threads-net` en septiembre 2023. El ToS de Meta prohíbe el acceso automatizado a sus APIs no oficiales.

ThreadsVault es una app **personal, no-comercial, offline-first** — el riesgo es distinto al de servicios que exponían la API públicamente. Sin embargo, tenerlo presente es importante.

**Técnicos**:
- El `doc_id` puede cambiar en cualquier release de Threads → actualizar la constante `THREADS_DOC_ID` en `main.rs`
- Las URLs CDN tienen TTL (expiran) → deben reproducirse/descargarse inmediatamente tras obtenerlas, no almacenarse indefinidamente
- Si Meta añade autenticación obligatoria al endpoint → el GraphQL dejará de funcionar para posts sin sesión

---

## Cómo verificar que funciona (en la app Tauri, no en el navegador)

La API GraphQL solo es invocada desde el backend Rust via `resolveDesktopVideo`. En el navegador (localhost:5173) devuelve `null` inmediatamente (no hay Tauri). Solo funciona en la app desktop compilada.

Para testear:
1. Ejecutar `npm run tauri dev` (compila Rust + inicia frontend)
2. Abrir un post con vídeo en la app desktop
3. El vídeo debería cargar automáticamente en ~1-2s con controles de reproducción
4. El botón "Descargar" aparece cuando la URL es directa (source: 'desktop')

Para verificar que la llamada GraphQL funciona desde cualquier entorno:
```bash
curl -X POST https://www.threads.net/api/graphql \
  -H "user-agent: threads-client" \
  -H "x-ig-app-id: 238260118697367" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'variables={"postID":"3387195987943866705"}&doc_id=5587632691339264' | jq '.data.data.containing_thread.thread_items[0].post.video_versions[0].url'
```
