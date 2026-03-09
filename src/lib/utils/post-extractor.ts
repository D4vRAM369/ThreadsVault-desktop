import type { PostMedia, PostMediaType, ThreadPost } from '../types'
import { cleanThreadsUrl, parseThreadsAuthor } from './url-parser'

export interface ExtractedPostData {
  canonicalUrl: string
  author: string
  title?: string
  text?: string
  previewImage?: string
  previewVideo?: string
  media: PostMedia[]
  threadPosts?: ThreadPost[]
}

interface OEmbedPayload {
  title?: string
  author_name?: string
  thumbnail_url?: string
  html?: string
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i
const VIDEO_RE = /\.(mp4|mov|webm|m3u8)(\?.*)?$/i
const ABSOLUTE_URL_RE = /^https?:\/\//i
const THREADS_POST_PATH_RE = /\/(?:@[\w.]+\/post\/|post\/|t\/)[A-Za-z0-9_-]+/i
const AVATAR_CDN_RE = /\/t51\.2885-19\//i
// PBL: t51.71878 = tipo CDN de Meta para thumbnails de vídeo (preview image del vídeo)
const VIDEO_THUMB_CDN_RE = /\/t51\.71878[-_]/

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function extractMetaTag(html: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  )
  const match = pattern.exec(html)
  return match?.[1] ? decodeHtml(match[1]) : undefined
}

function extractCanonical(html: string): string | undefined {
  const pattern = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
  const match = pattern.exec(html)
  return match?.[1] ? decodeHtml(match[1]) : undefined
}

function normalizeExtractedUrl(value: string): string {
  return decodeHtml(
    value
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\')
  )
}

function isLikelyAvatarUrl(url: string): boolean {
  const value = url.toLowerCase()
  return AVATAR_CDN_RE.test(url)
    || /profile(?:_pic|pic)|avatar/i.test(value)
    || /[?&](?:stp|set)=dst-jpg_s(?:72|96|100|120|150|180|200|240|320)x(?:72|96|100|120|150|180|200|240|320)/i.test(value)
    || /[?&]type=profile/i.test(value)
}

function inferMediaType(url: string): PostMediaType | null {
  if (VIDEO_RE.test(url)) return 'video'
  if (IMAGE_RE.test(url)) return 'image'
  const value = url.toLowerCase()
  if (/(\bvideo\b|\/video\/|mime_type=video|_video|_vid|dash_manifest|\.mp4\b|\.webm\b|\.m3u8\b)/i.test(value)) {
    return 'video'
  }
  if (/(\bimage\b|\/image\/|dst-jpg|dst-webp|dst-png|_n\.jpg|_n\.png|_n\.webp|scontent)/i.test(value)) {
    return 'image'
  }
  return null
}

function toMediaEntries(urls: string[]): PostMedia[] {
  const unique = new Set<string>()
  const result: PostMedia[] = []

  for (const url of urls) {
    if (!ABSOLUTE_URL_RE.test(url)) continue
    if (unique.has(url)) continue

    const type = inferMediaType(url)
    if (!type) continue

    unique.add(url)
    result.push({
      id: crypto.randomUUID(),
      type,
      url,
    })
  }

  return result
}

function extractMediaFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"')<>]+/gi) ?? []
  return matches.filter((url) => inferMediaType(url) !== null)
}

function extractEscapedMediaFromText(text: string): string[] {
  const matches = text.match(/https?:\\u002F\\u002F[^"'\\\s<>()]+/gi) ?? []
  return matches
    .map(normalizeExtractedUrl)
    .filter((url) => inferMediaType(url) !== null)
}

/*
  PBL: Extrae media SOLO de la sección del post en la respuesta markdown de Jina.
  Jina puede devolver la página completa (post + posts relacionados/perfil del usuario).

  BUG CORREGIDO: cuando Jina sirve el perfil de @usuario en vez del post específico,
  el primer post visible es el más reciente del usuario (que puede ser otro post distinto).
  Sin anclaje al postId, cogemos media del post equivocado.

  Fix: si tenemos postId, buscamos su primera aparición en el markdown y extraemos
  media desde ese punto. Si el postId no aparece → Jina sirvió otra página → retornamos [].
*/
function extractPostSectionMedia(jinaMarkdown: string, postId: string | null): string[] {
  if (!jinaMarkdown) return []

  if (postId) {
    const postMatch = new RegExp(`/post/${postId}\\b`, 'i').exec(jinaMarkdown)
    if (postMatch) {
      // 4000 chars cubre posts con 2-4 imágenes (cada URL CDN ~300-500 chars)
      const postSection = jinaMarkdown.slice(postMatch.index, postMatch.index + 4000)
      return [
        ...extractMediaFromText(postSection),
        ...extractEscapedMediaFromText(postSection),
      ]
    }
    // postId no encontrado → Jina sirvió perfil/feed en vez del post → no extraer media
    return []
  }

  // Sin postId: comportamiento original (primeros 3000 chars tras "Markdown Content:")
  const contentMatch = /Markdown Content:\s*/i.exec(jinaMarkdown)
  const start = contentMatch ? contentMatch.index + contentMatch[0].length : 0
  const postSection = jinaMarkdown.slice(start, start + 3000)
  return [
    ...extractMediaFromText(postSection),
    ...extractEscapedMediaFromText(postSection),
  ]
}

/*
  PBL: Asigna tipo explícito sin inferir por URL.
  Usado para og:video / og:image — la fuente ya indica el tipo correctamente.
*/
function forceMediaEntries(urls: Array<string | undefined>, type: PostMediaType): PostMedia[] {
  const result: PostMedia[] = []
  for (const url of urls) {
    if (!url || !ABSOLUTE_URL_RE.test(url)) continue
    if (type === 'image' && isLikelyAvatarUrl(url)) continue
    result.push({ id: crypto.randomUUID(), type, url })
  }
  return result
}

function extractPlayableVideoUrls(source: string): string[] {
  if (!source) return []
  const urls = [
    ...extractMediaFromText(source),
    ...extractEscapedMediaFromText(source),
  ]

  const unique = new Set<string>()
  return urls.filter((url) => {
    if (inferMediaType(url) !== 'video') return false
    if (unique.has(url)) return false
    unique.add(url)
    return true
  })
}

function extractJsonValue(source: string, key: string): string[] {
  if (!source) return []
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'gi')
  const results: string[] = []
  let match: RegExpExecArray | null = null

  while ((match = pattern.exec(source)) !== null) {
    const value = normalizeExtractedUrl(match[1])
    if (value) results.push(value)
  }

  return results
}

function extractQuotedPlayableVideoUrls(source: string): string[] {
  const quoted = [
    ...extractJsonValue(source, 'video_url'),
    ...extractJsonValue(source, 'playback_video_url'),
    ...extractJsonValue(source, 'video_versions'),
    ...extractJsonValue(source, 'content_url'),
  ]

  const unique = new Set<string>()
  return quoted.filter((url) => {
    if (!ABSOLUTE_URL_RE.test(url)) return false
    if (inferMediaType(url) !== 'video') return false
    if (unique.has(url)) return false
    unique.add(url)
    return true
  })
}

// PBL: timeout individual por fetch — si un origen falla lento no bloquea a los demás
async function tryFetchJson(url: string): Promise<OEmbedPayload | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as OEmbedPayload
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function tryFetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'es,en;q=0.9',
        // PBL: sin User-Agent Threads detecta el request como bot y devuelve
        // HTML vacío o 403. Con UA de browser real supera el bot-detection
        // y devuelve el HTML completo con los og: meta tags.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function selectAuthor(oembed: OEmbedPayload | null, canonicalUrl: string): string {
  if (oembed?.author_name?.trim()) {
    const raw = oembed.author_name.trim()
    return raw.startsWith('@') ? raw : `@${raw}`
  }
  return parseThreadsAuthor(canonicalUrl)
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value?.trim()) return value.trim()
  }
  return undefined
}

function isLikelyThreadsPostUrl(url?: string): boolean {
  if (!url) return false
  return THREADS_POST_PATH_RE.test(url)
}

function isGenericThreadsText(value?: string): boolean {
  if (!value) return false
  return /join threads to share ideas|threads\s*•\s*log in|log in with your instagram/i.test(value)
}

function extractPostId(url: string): string | null {
  const match = /\/(?:post|t)\/([A-Za-z0-9_-]+)/i.exec(url)
  return match?.[1] ?? null
}

function normalizeCandidateLine(line: string): string {
  return line
    .replace(/^\s*(?:\d+\.)\s*/, '')    // "1. texto"
    .replace(/^\s*[-*•·]\s*/, '')       // "- texto" / "* texto"
    .replace(/^\s*\.\s*/, '')           // ".texto"
    .trim()
}

function isThreadPositionNoise(line: string): boolean {
  return /^post\s+\d+\s+de\s+\d+$/i.test(line)
    || /^\d+\s+de\s+\d+$/i.test(line)
}

/*
  PBL: Jina Reader convierte los enlaces de posts a markdown con URL de tracking:
    "GitHub repo: github.com/hipocap" →
    "GitHub repo: [github.com/hipoc...](https://l.threads.com/?u=https%3A%2F%2Fgithub.com%2Fhipocap)"
  Sin limpieza guardamos la sintaxis de corchetes y URLs de tracking.

  Problemas resueltos:
    1. [texto truncado](l.threads.com/?u=URL_REAL) → URL_REAL sin https://
       (Threads muestra "hipoc..." pero el parámetro ?u= tiene la URL completa)
    2. [texto](url_cualquiera) → texto (fallback genérico)
    3. URLs de tracking l.threads.com / l.instagram.com sueltas → eliminadas
    4. og:description concatena párrafos sin espacio: "frase.Siguiente" → "frase. Siguiente"
*/
function resolveThreadsTrackingUrl(url: string): string | null {
  // "https://l.threads.com/?u=ENCODED_URL&e=TOKEN" → "github.com/hipocap/hipocap"
  try {
    const parsed = new URL(url)
    if (/l\.(threads|instagram)\.com/i.test(parsed.hostname)) {
      const inner = parsed.searchParams.get('u')
      if (inner) return decodeURIComponent(inner).replace(/^https?:\/\//i, '')
    }
  } catch { /* URL inválida — ignorar */ }
  return null
}

function cleanMarkdownLinks(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined
  const cleaned = text
    // [texto](tracking_url) → URL real decodificada (o texto si no es tracking)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, displayText, url) => {
      return resolveThreadsTrackingUrl(url) ?? displayText
    })
    // Eliminar URLs de tracking sueltas que hayan quedado
    .replace(/https?:\/\/l\.(?:threads|instagram)\.com\/\S*/gi, '')
    // og:description concatena párrafos: "frase.OtraPalabra" → "frase. OtraPalabra"
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    // Colapsar espacios extra y limpiar
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned.length >= 6 ? cleaned : undefined
}

function isImageAltNoise(line: string): boolean {
  return /^!?\[image\s*\d*:/i.test(line)
    || /profile picture/i.test(line)
}

function isInvalidExtractedText(value?: string): boolean {
  if (!value?.trim()) return true
  const line = normalizeCandidateLine(value.trim())
  if (line.length < 6) return true
  if (isThreadPositionNoise(line)) return true
  if (isImageAltNoise(line)) return true
  if (isGenericThreadsText(line)) return true
  return false
}

function extractFallbackTextFromSource(source: string, postId: string | null): string | undefined {
  if (!source?.trim()) return undefined
  const lines = source.replace(/\r/g, '').split('\n').map((line) => line.trim())
  if (!lines.length) return undefined

  const postLineIndex = postId
    ? lines.findIndex((line) => new RegExp(`/post/${postId}\\b`, 'i').test(line))
    : -1

  // BUG CORREGIDO: si tenemos postId pero no aparece en la fuente, Jina devolvió
  // otra página (perfil/feed del usuario). Es más seguro retornar undefined que
  // devolver texto del primer post visible, que puede ser un post diferente.
  if (postId && postLineIndex === -1) return undefined

  const start = postLineIndex >= 0 ? postLineIndex + 1 : 0
  for (let index = start; index < Math.min(lines.length, start + 28); index += 1) {
    const line = lines[index]
    if (!line) continue
    const candidate = normalizeCandidateLine(line)
    if (candidate.length < 6) continue
    if (/^!\[/.test(candidate)) continue
    if (isImageAltNoise(candidate)) continue
    /*
      PBL: Bug fix — Jina convierte los enlaces embebidos en posts a markdown:
        [github.com/ripienaar/free-for-dev](https://github.com/...)
      Sin este fix, saltábamos TODAS las líneas que empiezan con "[", dejando
      sin texto los posts cuyo único contenido es un enlace.
      Fix: extraemos el texto visible del enlace [texto](url) si tiene ≥6 chars
      y no es una mención de usuario (@handle) ni un número de interacciones.
    */
    if (/^\[/.test(candidate)) {
      const linkText = /^\[([^\]]+)\]/.exec(candidate)?.[1]
      // Imagen enlazada: [![alt](img_url)](link_url) → linkText empieza con "!"
      // Sin este check, devolvemos "![image 0: diagrama" como texto extraído.
      if (linkText?.startsWith('!')) continue
      if (linkText && linkText.length >= 6 && !/^@/.test(linkText) && !/^\d+[kKmMbB]?$/.test(linkText)) {
        return linkText
      }
      continue
    }
    if (/^\d+$/.test(candidate)) continue
    if (/^https?:\/\//i.test(candidate)) continue
    if (/^title:|^url source:|^markdown content:/i.test(candidate)) continue
    if (/^sorry,\s*we'?re having trouble/i.test(candidate)) continue
    if (isThreadPositionNoise(candidate)) continue
    if (isGenericThreadsText(candidate)) continue
    return candidate
  }

  return undefined
}

/*
  PBL: Detecta IDs de sub-posts del hilo parseando el HTML del post principal.
  Threads embebe en el HTML los enlaces a los posts del hilo con el patrón:
    /@handle/post/ID  o  /post/ID
  Extraemos todos los IDs distintos al mainPostId, en orden de aparición.

  BUG CORREGIDO: el HTML de Threads incluye URLs en JSON-blobs con escapes
  Unicode (\\u002F en lugar de /) y JSON (\\/ en lugar de /). El regex
  necesita que normalicemos esos escapes antes de buscar el patrón.
  Ejemplo de raw HTML que fallaba:
    "url":"https:\\u002F\\u002Fwww.threads.net\\u002F@handle\\u002Fpost\\u002FID"
*/
function detectThreadPostIds(html: string, author: string, mainPostId: string): string[] {
  if (!html || !author || !mainPostId) return []
  // Normalizar escapes comunes en JSON-blobs embebidos en el HTML
  const normalized = html
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
  const handle = author.replace(/^@/, '')
  const pattern = new RegExp(`/@?${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/post/([A-Za-z0-9_-]+)`, 'gi')
  const found = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(normalized)) !== null) {
    const id = match[1]
    if (id !== mainPostId) found.add(id)
  }
  return Array.from(found)
}

/*
  PBL: Extrae datos básicos de un sub-post del hilo (texto + media).
  Reutilizamos las mismas funciones que extractPostData pero devuelve
  un ThreadPost más compacto (sin oEmbed para reducir latencia).
*/
async function extractSubPost(subPostId: string, authorHandle: string): Promise<ThreadPost | null> {
  const handle = authorHandle.replace(/^@/, '')
  const url = `https://www.threads.net/@${handle}/post/${subPostId}`
  const [html, jinaMarkdown] = await Promise.all([
    tryFetchText(url),
    tryFetchText(`https://r.jina.ai/${url}`),
  ])
  if (!html && !jinaMarkdown) return null
  const source = html ?? jinaMarkdown ?? ''

  const ogDescription = extractMetaTag(source, 'og:description')
  const twitterDesc   = extractMetaTag(source, 'twitter:description')
  const ogImage       = extractMetaTag(source, 'og:image')
  const ogVideo       = extractMetaTag(source, 'og:video')
  const twitterImage  = extractMetaTag(source, 'twitter:image')

  const metadataText = firstDefined(ogDescription, twitterDesc)
  const markdownText = extractFallbackTextFromSource(jinaMarkdown ?? '', subPostId)
  const htmlText = extractFallbackTextFromSource(source, subPostId)
  const text = isInvalidExtractedText(metadataText)
    ? firstDefined(markdownText, htmlText)
    : firstDefined(metadataText, markdownText, htmlText)

  const seenUrls = new Set<string>()
  const media: PostMedia[] = []
  const addItem = (items: PostMedia[]) => {
    for (const item of items) {
      if (item.type === 'image' && isLikelyAvatarUrl(item.url)) continue
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url)
        media.push(item)
      }
    }
  }
  addItem(forceMediaEntries([ogVideo], 'video'))
  addItem(forceMediaEntries([ogImage, twitterImage], 'image'))
  addItem(toMediaEntries(extractPostSectionMedia(jinaMarkdown ?? '', subPostId)))

  const hasRealVideo  = media.some((item) => item.type === 'video')
  const hasVideoThumb = media.some((item) => VIDEO_THUMB_CDN_RE.test(item.url))
  if (!hasRealVideo && hasVideoThumb) {
    media.push({ id: crypto.randomUUID(), type: 'video-link', url })
  }

  return { id: subPostId, url, text: cleanMarkdownLinks(text), media: media.length > 0 ? media : undefined }
}

interface ExtractOptions {
  /**
   * Omite la detección automática de sub-posts del hilo.
   * Usar en modo multi-post: el usuario ya especificó todas las URLs,
   * así que no hace falta inferir más — y ahorramos ~8s de fetches extra.
   */
  skipThreadDetection?: boolean
}

export async function extractPostData(rawUrl: string, options?: ExtractOptions): Promise<ExtractedPostData> {
  const sourceUrl = rawUrl.trim()
  const canonicalUrl = cleanThreadsUrl(sourceUrl)
  const postId = extractPostId(sourceUrl)
  // authorFromInputUrl es síncrono (parse de URL) → disponible antes del primer await
  const authorFromInputUrl = parseThreadsAuthor(canonicalUrl)

  /*
    PBL: Ejecutamos los 4 orígenes EN PARALELO con Promise.all.
    Antes: 3 fetches paralelos + extractSubPost secuencial = hasta 8s + 8s = 16s.
    Ahora: 4 fetches paralelos = max(cada uno) = ~8s total.
    El 4º fetch es extractSubPost para el post específico (threads.net).
    Esto es especialmente importante para sub-posts: threads.com puede devolver
    el og:image del post RAÍZ, mientras threads.net tiene el og:image correcto
    del sub-post.

    Orden de preferencia para el HTML fuente:
    1. directHtml  — fetch directo (funciona en Tauri, CORS en browser)
    2. jinaHtml    — Jina Reader (headless proxy, funciona en browser)

    BUG CORREGIDO: antes el Jina URL usaba `http://` en lugar de
    `https://`, forzando una redirección en Threads que añadía latencia
    y podía fallar. Ahora usamos `https://r.jina.ai/${canonicalUrl}`.
  */
  const [oembed, directHtml, jinaHtml, specificPostEarly] = await Promise.all([
    tryFetchJson(`https://www.threads.net/oembed?url=${encodeURIComponent(sourceUrl)}`),
    tryFetchText(sourceUrl),
    tryFetchText(`https://r.jina.ai/${canonicalUrl}`),
    postId && authorFromInputUrl
      ? extractSubPost(postId, authorFromInputUrl)
      : Promise.resolve(null),
  ])

  const source = directHtml ?? jinaHtml ?? ''

  const ogTitle        = extractMetaTag(source, 'og:title')
  const ogDescription  = extractMetaTag(source, 'og:description')
  const twitterDesc    = extractMetaTag(source, 'twitter:description')
  const ogImage        = extractMetaTag(source, 'og:image')
  const ogVideo        = extractMetaTag(source, 'og:video')
  const ogVideoSecure  = extractMetaTag(source, 'og:video:secure_url')
  const twitterImage   = extractMetaTag(source, 'twitter:image')
  const twitterVideo   = extractMetaTag(source, 'twitter:player:stream')
  const canonicalFromHtml = extractCanonical(source)
  const playableVideoUrls = [
    ...extractPlayableVideoUrls(directHtml ?? source),
    ...extractQuotedPlayableVideoUrls(directHtml ?? source),
  ]

  /*
    PBL: Construcción de media con tipos correctos y sin imágenes ajenas.

    Problema anterior: `extractMediaFromText(source)` escaneaba TODA la respuesta
    de Jina (~25KB) incluyendo posts relacionados/sugeridos → 24 items de otros posts.

    Solución: pipeline ordenado con deduplicación global.
      1. og:video / twitter:player:stream  → 'video' forzado
      2. oEmbed thumbnail                  → tipo inferido (casi siempre imagen)
      3. og:image / twitter:image          → 'image' forzado
      4. oEmbed HTML                       → tipo inferido
      5. Jina — solo primeros 3000 chars   → solo el post, no posts relacionados
  */
  const seenMediaUrls = new Set<string>()
  const media: PostMedia[] = []
  const addMedia = (items: PostMedia[]) => {
    for (const item of items) {
      if (item.type === 'image' && isLikelyAvatarUrl(item.url)) continue
      if (!seenMediaUrls.has(item.url)) {
        seenMediaUrls.add(item.url)
        media.push(item)
      }
    }
  }

  addMedia(forceMediaEntries([ogVideo, ogVideoSecure, twitterVideo], 'video'))
  addMedia(forceMediaEntries(playableVideoUrls, 'video'))
  addMedia(toMediaEntries(oembed?.thumbnail_url ? [oembed.thumbnail_url] : []))
  addMedia(forceMediaEntries([ogImage, twitterImage], 'image'))
  if (oembed?.html) addMedia(toMediaEntries(extractMediaFromText(oembed.html)))
  // PBL: jinaHtml (markdown limpio del post) en vez de source (HTML completo con otros posts)
  // postId ancla la extracción al bloque correcto — evita coger media de otros posts del feed
  addMedia(toMediaEntries(extractPostSectionMedia(jinaHtml ?? '', postId)))

  /*
    PBL: Detección de vídeo por thumbnail CDN.
    Threads sirve vídeos via HLS/DASH con tokens de autenticación — no extraíbles.
    Pero el thumbnail del vídeo (t51.71878 en CDN de Meta) sí aparece en Jina.
    Si lo detectamos y no tenemos stream real → añadimos 'video-link' con la URL
    canónica del post para que el usuario pueda abrirlo en Threads desde la app.
  */
  const hasRealVideo  = media.some((item) => item.type === 'video')
  const hasVideoThumb = media.some((item) => VIDEO_THUMB_CDN_RE.test(item.url))
  if (!hasRealVideo && hasVideoThumb) {
    media.push({ id: crypto.randomUUID(), type: 'video-link', url: canonicalUrl })
  }

  const previewVideo  = media.find((item) => item.type === 'video')?.url
  const previewImage  = media.find((item) => item.type === 'image')?.url
  const metadataText  = firstDefined(ogDescription, twitterDesc, oembed?.title)
  const fallbackText  = extractFallbackTextFromSource(source, postId)
  const extractedText = isGenericThreadsText(metadataText)
    ? fallbackText
    : firstDefined(metadataText, fallbackText)
  /*
    PBL: Bug fix — Threads pone <link rel="canonical"> al POST RAÍZ del hilo
    para todos los sub-posts (estrategia SEO). Sin este check, guardábamos la URL
    del post 1 como canonicalUrl aunque el usuario hubiese pegado la URL del post 2,
    haciendo que "Refrescar" extrajese siempre el texto del post equivocado.
    Fix: si el canonical del HTML apunta a un postId diferente al de la URL original,
    ignoramos el canonical y mantenemos la URL que el usuario pegó.
  */
  const htmlPostId = canonicalFromHtml ? extractPostId(canonicalFromHtml) : null
  const canonicalMismatch = Boolean(postId && htmlPostId && htmlPostId !== postId)
  const normalizedCanonical = isLikelyThreadsPostUrl(canonicalFromHtml) && !canonicalMismatch
    ? cleanThreadsUrl(canonicalFromHtml!)
    : canonicalUrl

  const author = selectAuthor(oembed, normalizedCanonical)
  // authorFromInputUrl ya fue calculado antes del Promise.all inicial (línea ~442)
  // specificPost ya fue obtenido en paralelo con oEmbed/directHtml/jinaHtml
  const specificPost = specificPostEarly

  /*
    PBL: Detección de hilo — si el HTML contiene enlaces a sub-posts del mismo autor,
    los extraemos en paralelo con Promise.all para no añadir latencia acumulada.
    Solo intentamos si tenemos postId y autor válidos.
    resolvedAuthor: consolida oEmbed author y author de la URL pegada por el usuario.

    skipThreadDetection=true se usa en modo multi-post: el usuario ya especificó todas
    las URLs manualmente, así que inferir sub-posts es redundante y añade ~8s de latencia
    innecesaria. Con el skip, cada extractPostData extra toma ~8s en vez de ~16s.
  */
  const resolvedAuthor = author || authorFromInputUrl
  let threadPosts: ThreadPost[] | undefined
  if (!options?.skipThreadDetection && postId && resolvedAuthor) {
    const subIds = detectThreadPostIds(source, resolvedAuthor, postId)
    if (subIds.length > 0) {
      const results = await Promise.all(subIds.map((id) => extractSubPost(id, resolvedAuthor)))
      const valid = results.filter((t): t is ThreadPost => t !== null)
      if (valid.length > 0) threadPosts = valid
    }
  }

  const safeSpecificText  = specificPost && !isInvalidExtractedText(specificPost.text)
    ? specificPost.text : undefined
  const safeExtractedText = isInvalidExtractedText(extractedText) ? undefined : extractedText

  return {
    canonicalUrl:  normalizedCanonical,
    author:        resolvedAuthor || '@desconocido',
    title:         firstDefined(oembed?.title, ogTitle),
    text:          cleanMarkdownLinks(firstDefined(safeSpecificText, safeExtractedText)),
    previewImage:  specificPost?.media?.find((m) => m.type === 'image')?.url ?? previewImage,
    previewVideo:  specificPost?.media?.find((m) => m.type === 'video')?.url ?? previewVideo,
    media:         specificPost?.media?.length ? specificPost.media : media,
    threadPosts,
  }
}

/*
  PBL: fetchOEmbedHtml — obtiene el HTML del reproductor oficial de Threads.
  La API oEmbed de Threads devuelve un JSON con:
    - author_name: "@usuario"
    - html: '<blockquote class="text-post-media" ...>...</blockquote>
             <script src="https://www.threads.net/embed/embed.js"></script>'

  Ese HTML (blockquote + embed.js) es el reproductor oficial de Threads.
  Podemos inyectarlo en un <iframe srcdoc="..."> para reproducir el vídeo
  dentro de la app usando el player nativo de Threads.

  El campo OEmbedPayload ya tiene `html?: string`, así que reutilizamos
  tryFetchJson directamente.
*/
export async function fetchOEmbedHtml(postUrl: string): Promise<string | null> {
  const data = await tryFetchJson(
    `https://www.threads.net/oembed?url=${encodeURIComponent(postUrl)}`
  )
  return data?.html ?? null
}

export async function resolvePlayableVideoUrl(rawUrl: string): Promise<string | null> {
  const sourceUrl = rawUrl.trim()
  const canonicalUrl = cleanThreadsUrl(sourceUrl)

  const [directHtml, canonicalHtml, jinaHtml] = await Promise.all([
    tryFetchText(sourceUrl),
    sourceUrl === canonicalUrl ? Promise.resolve<string | null>(null) : tryFetchText(canonicalUrl),
    tryFetchText(`https://r.jina.ai/${canonicalUrl}`),
  ])

  const source = directHtml ?? canonicalHtml ?? jinaHtml ?? ''
  const forced = [
    extractMetaTag(source, 'og:video'),
    extractMetaTag(source, 'og:video:secure_url'),
    extractMetaTag(source, 'twitter:player:stream'),
  ].filter((value): value is string => Boolean(value))

  const candidates = [
    ...forced,
    ...extractPlayableVideoUrls(source),
    ...extractQuotedPlayableVideoUrls(source),
  ]
  const unique = new Set<string>()

  for (const candidate of candidates) {
    const url = normalizeExtractedUrl(candidate)
    if (!ABSOLUTE_URL_RE.test(url)) continue
    if (inferMediaType(url) !== 'video') continue
    if (unique.has(url)) continue
    unique.add(url)
    return url
  }

  return null
}
