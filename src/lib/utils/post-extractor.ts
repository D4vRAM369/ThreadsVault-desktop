import type { PostMedia, PostMediaType } from '../types'
import { cleanThreadsUrl, parseThreadsAuthor } from './url-parser'

export interface ExtractedPostData {
  canonicalUrl: string
  author: string
  title?: string
  text?: string
  previewImage?: string
  previewVideo?: string
  media: PostMedia[]
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
  Jina devuelve la página completa (post + posts relacionados/sugeridos).
  Limitamos a los primeros 3000 chars del bloque "Markdown Content:" para
  quedarnos con el post objetivo y evitar imágenes de otros posts.
*/
function extractPostSectionMedia(jinaMarkdown: string): string[] {
  if (!jinaMarkdown) return []
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

function extractFallbackTextFromSource(source: string, postId: string | null): string | undefined {
  if (!source?.trim()) return undefined
  const lines = source.replace(/\r/g, '').split('\n').map((line) => line.trim())
  if (!lines.length) return undefined

  const postLineIndex = postId
    ? lines.findIndex((line) => new RegExp(`/post/${postId}\\b`, 'i').test(line))
    : -1

  const start = postLineIndex >= 0 ? postLineIndex + 1 : 0
  for (let index = start; index < Math.min(lines.length, start + 28); index += 1) {
    const line = lines[index]
    if (!line) continue
    if (line.length < 6) continue
    if (/^\[/.test(line)) continue
    if (/^!\[/.test(line)) continue
    if (/^\d+$/.test(line)) continue
    if (/^https?:\/\//i.test(line)) continue
    if (/^title:|^url source:|^markdown content:/i.test(line)) continue
    if (/^sorry,\s*we'?re having trouble/i.test(line)) continue
    if (isGenericThreadsText(line)) continue
    return line
  }

  return undefined
}

export async function extractPostData(rawUrl: string): Promise<ExtractedPostData> {
  const sourceUrl = rawUrl.trim()
  const canonicalUrl = cleanThreadsUrl(sourceUrl)
  const postId = extractPostId(sourceUrl)

  /*
    PBL: Ejecutamos los 3 orígenes EN PARALELO con Promise.all.
    Antes eran secuenciales (await + await + await) = hasta 13.5s.
    Ahora el tiempo total = max(cada timeout individual) = ~8s.
    Esto garantiza que Jina siempre tiene tiempo de responder antes
    del timeout exterior de ShareScreen.

    Orden de preferencia para el HTML fuente:
    1. directHtml  — fetch directo (funciona en Tauri, CORS en browser)
    2. jinaHtml    — Jina Reader (headless proxy, funciona en browser)

    BUG CORREGIDO: antes el Jina URL usaba `http://` en lugar de
    `https://`, forzando una redirección en Threads que añadía latencia
    y podía fallar. Ahora usamos `https://r.jina.ai/${canonicalUrl}`.
  */
  const [oembed, directHtml, jinaHtml] = await Promise.all([
    tryFetchJson(`https://www.threads.net/oembed?url=${encodeURIComponent(sourceUrl)}`),
    tryFetchText(sourceUrl),
    tryFetchText(`https://r.jina.ai/${canonicalUrl}`),
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
  addMedia(toMediaEntries(extractPostSectionMedia(jinaHtml ?? '')))

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
  const normalizedCanonical = isLikelyThreadsPostUrl(canonicalFromHtml)
    ? cleanThreadsUrl(canonicalFromHtml!)
    : canonicalUrl

  return {
    canonicalUrl: normalizedCanonical,
    author:       selectAuthor(oembed, normalizedCanonical),
    title:        firstDefined(oembed?.title, ogTitle),
    text:         extractedText,
    previewImage,
    previewVideo,
    media,
  }
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
