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

function isTrustedHtmlForPost(html: string | null | undefined, expectedPostId?: string | null): boolean {
  if (!html) return false
  if (!expectedPostId) return true

  const canonical = extractCanonical(html)
  const canonicalPostId = canonical ? extractPostId(canonical) : null
  return canonicalPostId === expectedPostId
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
export function extractPostSectionMedia(jinaMarkdown: string, postId: string | null): string[] {
  if (!jinaMarkdown) return []

  /*
    PBL: Bug fix — el header de Jina contiene la URL del post en la línea
    "URL Source: https://...threads.net/.../post/ID". Si buscamos /post/ID
    en todo el markdown, la PRIMERA aparición siempre es esa línea de header.
    El ancla quedaba en el header → los chars siguientes eran el contenido del
    POST RAÍZ (que aparece primero en el markdown del thread), no del sub-post.

    Fix: buscar /post/ID SOLO dentro del área de contenido, es decir,
    a partir de "Markdown Content:" (línea separadora que Jina incluye siempre).
    Así el ancla cae en el enlace real del sub-post dentro del hilo.
  */
  const contentMarker = /\nMarkdown Content:\s*\n?/i.exec(jinaMarkdown)
  const searchArea = contentMarker
    ? jinaMarkdown.slice(contentMarker.index + contentMarker[0].length)
    : jinaMarkdown

  if (postId) {
    // PBL: Jina suele incluir el URL del post en un enlace de servicio al inicio:
    // [Thread ------ 1.1K views](https://www.threads.com/@user/post/postId)
    // Ese enlace falso ancla la extracción al inicio del documento (solapando con el padre).
    // Omitimos esos enlaces de metadatos al buscar el ancla real.
    const serviceLinkRe = new RegExp(`^\\[[^\\]]*Thread[^\\]]*\\]\\(https?://[^)]+/post/${postId}[^)]*\\)`, 'im')

    // Si el postId es el principal (header), tomamos desde el inicio (para posts sueltos).
    const urlSourceMatch = /^URL Source:\s*(.+)$/im.exec(jinaMarkdown)
    const urlSource = urlSourceMatch?.[1]?.trim() ?? ''
    const isMainPost = urlSource.includes(`/post/${postId}`) || urlSource.includes(`/t/${postId}`)

    const postMatch = new RegExp(`/post/${postId}\\b`, 'i').exec(searchArea)
    const allPostIdMatches = Array.from(searchArea.matchAll(/\/post\/([A-Za-z0-9_-]+)\b/gi))
    const firstPostIdMatch = allPostIdMatches[0]
    const firstIdInContent = firstPostIdMatch?.[1]

    // PBL: Solo empezamos desde el inicio si somos el post principal Y además
    // no hay otro ID de post visible en los primeros 1000 chars que no sea un breadcrumb.
    const isTargetAtTop = !firstIdInContent || firstIdInContent.toLowerCase() === postId.toLowerCase()

    // Comprobar si el primer match de ID pertenece a un link de servicio (breadcrumb)
    let firstIdIsActuallyService = false
    if (firstPostIdMatch) {
      const lineStart = searchArea.lastIndexOf('\n', firstPostIdMatch.index)
      const lineEnd = searchArea.indexOf('\n', firstPostIdMatch.index!)
      const line = searchArea.slice(lineStart >= 0 ? lineStart : 0, lineEnd >= 0 ? lineEnd : searchArea.length)
      firstIdIsActuallyService = serviceLinkRe.test(line)
    }

    const shouldStartFromTop = isMainPost && isTargetAtTop && !firstIdIsActuallyService

    if (shouldStartFromTop || !postMatch) {
      const postSection = searchArea.slice(0, 4000)
      return [
        ...extractMediaFromText(postSection),
        ...extractEscapedMediaFromText(postSection),
      ]
    }

    if (firstPostIdMatch) {
      // Si el match es un link de servicio, buscamos el SIGUIENTE match
      let actualIndex = firstPostIdMatch.index!
      if (firstIdIsActuallyService) {
        const remaining = searchArea.slice(firstPostIdMatch.index! + firstPostIdMatch[0].length)
        const nextMatch = new RegExp(`/post/${postId}\\b`, 'i').exec(remaining)
        if (nextMatch) {
          actualIndex = firstPostIdMatch.index! + firstPostIdMatch[0].length + nextMatch.index
        }
      }

      const postSection = searchArea.slice(actualIndex, actualIndex + 4000)
      return [
        ...extractMediaFromText(postSection),
        ...extractEscapedMediaFromText(postSection),
      ]
    }
    return []
  }

  // Sin postId: primeros 3000 chars del área de contenido
  const postSection = searchArea.slice(0, 3000)
  return [
    ...extractMediaFromText(postSection),
    ...extractEscapedMediaFromText(postSection),
  ]
}

/*
  PBL: Extrae texto Y media de un sub-post a partir del markdown de Jina,
  acotando la sección del sub-post entre su ancla y el inicio del siguiente post.

  Problema que resuelve (en cadena):
  1. El header de Jina contiene la URL del sub-post → falso ancla resuelto buscando
     solo dentro de "Markdown Content:".
  2. "Related threads" aparece en la primera línea ÚTIL después del ancla del sub-post
     (antes del texto real). Resuelto: "Related threads" está en isGenericThreadsText.
  3. La ventana de 4000 chars se solapaba con la sección "Related threads", que
     incluye previews con CDN URLs del video del post raíz → video asignado al
     sub-post erróneamente. Resuelto: la sección se ACOTA entre el ancla del sub-post
     y la primera aparición de otro /post/ID (o "Related threads"/"Related posts"),
     lo que garantiza que solo se extrae media perteneciente a este sub-post.

  Retorna null si el postId no aparece en el área de contenido de Jina.
*/
interface PostSectionData {
  text: string | undefined
  mediaUrls: string[]
}

export function extractPostSectionFromJina(jinaMarkdown: string, postId: string): PostSectionData | null {
  if (!jinaMarkdown?.trim()) return null

  // 1. Saltar cabecera de Jina (Title / URL Source / Markdown Content)
  const contentMarker = /\nMarkdown Content:\s*\n?/i.exec(jinaMarkdown)
  const contentArea = contentMarker
    ? jinaMarkdown.slice(contentMarker.index + contentMarker[0].length)
    : jinaMarkdown

  // 2. Encontrar la línea ancla del sub-post en el área de contenido
  const serviceLinkRe = new RegExp(`^\\[[^\\]]*Thread[^\\]]*\\]\\(https?://[^)]+/post/${postId}[^)]*\\)`, 'im')

  const allPostIdMatches = Array.from(contentArea.matchAll(/\/post\/([A-Za-z0-9_-]+)\b/gi))
  const firstPostIdMatch = allPostIdMatches[0]
  const firstIdInContent = firstPostIdMatch?.[1]

  let firstIdIsActuallyService = false
  if (firstPostIdMatch) {
    const lineStart = contentArea.lastIndexOf('\n', firstPostIdMatch.index)
    const lineEnd = contentArea.indexOf('\n', firstPostIdMatch.index!)
    const line = contentArea.slice(lineStart >= 0 ? lineStart : 0, lineEnd >= 0 ? lineEnd : contentArea.length)
    firstIdIsActuallyService = serviceLinkRe.test(line)
  }

  const anchorRe = new RegExp(`/post/${postId}\\b`, 'i')
  const anchorMatch = anchorRe.exec(contentArea)

  // PBL: Si el postId es el del post principal (el que Jina reporta como URL Source),
  // tomamos desde el inicio. El ancla suele ser de una imagen o un enlace interno
  // que aparece DESPUÉS del texto del post principal.
  const urlSourceMatch = /^URL Source:\s*(.+)$/im.exec(jinaMarkdown)
  const urlSource = urlSourceMatch?.[1]?.trim() ?? ''
  const isMainPost = urlSource.includes(`/post/${postId}`) || urlSource.includes(`/t/${postId}`)

  let bodyFull: string
  const isTargetAtTop = !firstIdInContent || firstIdInContent.toLowerCase() === postId.toLowerCase()

  // 3. Decidir el punto de inicio (bodyFull)
  if (isMainPost && isTargetAtTop && !firstIdIsActuallyService) {
    // Caso A: Somos el post principal y estamos al inicio (sin breadcrumbs que nos precedan)
    bodyFull = contentArea
  } else {
    // Buscamos si existe un ancla REAL (una mención al post que no sea el breadcrumb térmico de Jina)
    let realAnchorIndex = -1
    if (anchorMatch) {
      if (!firstIdIsActuallyService || anchorMatch.index !== firstPostIdMatch?.index) {
        // El match encontrado no es el service link inicial, es un ancla real
        realAnchorIndex = anchorMatch.index
      } else {
        // El primer match era un breadcrumb, buscamos el siguiente (el real en el cuerpo)
        const remaining = contentArea.slice(anchorMatch.index + anchorMatch[0].length)
        const nextMatch = anchorRe.exec(remaining)
        if (nextMatch) {
          realAnchorIndex = anchorMatch.index + anchorMatch[0].length + nextMatch.index
        }
      }
    }

    if (realAnchorIndex >= 0) {
      // Caso B: Hemos encontrado el ancla real del sub-post
      const anchorLineEnd = contentArea.indexOf('\n', realAnchorIndex)
      const bodyStart = anchorLineEnd >= 0 ? anchorLineEnd + 1 : realAnchorIndex + anchorMatch![0].length
      bodyFull = contentArea.slice(bodyStart)
    } else if (isMainPost && allPostIdMatches.length > 0) {
      // Caso C: No hay ancla real pero hay hermanos. Somos el post "activo" (el que se está visitando).
      // Su contenido suele ir después del último hermano enlazado.
      const lastMatch = allPostIdMatches[allPostIdMatches.length - 1]
      const lastIndex = lastMatch.index!
      const lineEnd = contentArea.indexOf('\n', lastIndex)
      const bodyStart = lineEnd >= 0 ? lineEnd + 1 : lastIndex + lastMatch[0].length
      bodyFull = contentArea.slice(bodyStart)
    } else if (!isMainPost) {
      // Caso D: Sub-post cuyo ID no aparece en el área de contenido.
      // Jina sirvió una página diferente (normalmente el post raíz del hilo).
      // Devolvemos null para que extractSubPost use rootThreadJina como fallback,
      // que sí contiene el hilo completo con el ancla correcta del sub-post.
      return null
    } else {
      // Caso E: Post principal sin otros IDs de post → post suelto. Tomamos todo el área.
      bodyFull = contentArea
    }
  }

  // 4. Acotar el cuerpo hasta el SIGUIENTE /post/ID o sección "Related threads"
  //    o el login prompt del final.
  // PBL: Evitamos que el ID del post actual actúe como límite de fin de sección
  // si aparece más adelante (ej. en enlaces de imágenes).
  const nextPostRe = new RegExp(`\\/post\\/(?!${postId}\\b)[A-Za-z0-9_-]+\\b`, 'i')
  const sectionEndRe = new RegExp(
    // Siguiente post del hilo (ancla de fin más fiable)
    `${nextPostRe.source}` +
    // Bullets de UI: ·Author, ·Follow, etc.
    `|\\n·\\s*(?:Author|Autor)\\b` +
    // Encabezados de sección de replies/actividad
    `|\\n(?:#{1,3}\\s+)?(?:Destacadas|Ver actividad|Replies|More replies|Activity|Respuesta de|Replies from|Replying to|Ver respuestas|Show replies|See replies|All replies|Todas las respuestas)\\b` +
    // Sección "Related"
    `|\\nRelated threads\\b|\\nRelated posts\\b` +
    // Prompts de login
    `|\\nLog in or sign up\\b|\\nContinue with Instagram\\b|\\nLog in to see more replies\\b` +
    // Línea de métricas de engagement antes de la sección de replies:
    // Ej: "1.2K likes · 45 replies" o "1,234 likes · 45 respuestas"
    `|\\n[\\d.,]+ ?[KkMm]? (?:likes?|me gusta|reacciones)[\\s·•,]+[\\d.,]+ ?[KkMm]? (?:repl|respuesta)` +
    // Ver más respuestas / Show more replies (botones de UI)
    `|\\nVer (?:más |todas las )?respuestas\\b|\\nShow (?:all |more )?replies\\b|\\nSee (?:all |more )?replies\\b|\\nView (?:all |more )?replies\\b` +
    // "N replies" como línea sola (métricas antes de la sección)
    `|\\n[\\d.,]+[KkMm]?\\s+(?:repl(?:y|ies)|respuestas?)\\s*(?:\\n|$)` +
    // Contador de likes solitario: "4.5K" o "1.2M" solos en su línea.
    // Jina renderiza el like-count así justo antes de la sección de replies.
    `|\\n[\\d.,]+[KkMm]\\s*(?:\\n|$)`,
    'i'
  )
  const sectionEndMatch = sectionEndRe.exec(bodyFull)
  const body = sectionEndMatch ? bodyFull.slice(0, sectionEndMatch.index) : bodyFull.slice(0, 2500)

  // Restaurar saltos de línea que Jina colapsa (bullets en una sola línea)
  // Cubre los marcadores más comunes en posts de Threads: → • ·
  const BULLET = '[→•·]'
  /*
    PBL: Jina colapsa ítems con guión doble (--) en una sola línea.
    En Threads, "-- item" es un estilo de lista muy habitual. El editor guarda
    cada ítem en una línea separada, pero Jina los une con espacios:
      "-- Claude Mythos is a step change -- New Capybara tier sits..."
    Fix: si una línea EMPIEZA con "-- " y contiene más " -- " internos,
    son ítems colapsados → restaurarlos como líneas separadas.
    Solo afecta líneas que ya empiezan con "-- " para evitar falsos
    positivos con em-dashes en texto narrativo normal.
  */
  const bodyWithRestoredDashes = body.replace(/^-- .+$/gm, (line) =>
    line.includes(' -- ') ? line.replace(/ -- /g, '\n-- ') : line
  )
  const bodyRestored = bodyWithRestoredDashes
    .replace(new RegExp(`([.!?])\\s*(${BULLET}\\s)`, 'g'), '$1\n\n$2')
    .replace(new RegExp(`(${BULLET}[^\\n]+?[.!?])\\s*(${BULLET}\\s)`, 'g'), '$1\n$2')
    .replace(new RegExp(`(${BULLET}[^\\n]+?[.!?])\\s*(\\d)`, 'g'), '$1\n\n$2')

  // 5. Extraer texto preservando estructura de párrafos
  const paragraphBlocks = bodyRestored.replace(/\r/g, '').split(/\n{2,}/)
  const validParagraphs: string[] = []

  for (const block of paragraphBlocks) {
    const blockLines = block.split('\n').map((lineText: string) => lineText.trim())
    const validLines: string[] = []

    for (const line of blockLines) {
      if (!line) continue
      const candidate = normalizeCandidateLine(line)

      if (candidate.length < 3) continue // Bajamos el umbral para capturar texto corto/handles
      if (/^!\[/.test(candidate)) continue
      if (isImageAltNoise(candidate)) continue
      if (isGenericThreadsText(candidate)) continue
      if (isThreadPositionNoise(candidate)) continue
      if (/^\d+$/.test(candidate)) continue
      // Contador de likes/views solitario: "4.5K", "1.2M", "983K" — ruido de engagement
      if (/^[\d.,]+[KkMm]$/.test(candidate)) continue
      if (/^title:|^url source:|^markdown content:/i.test(candidate)) continue

      // URLs absolutas: en vez de filtrar completamente, intentar limpiar el protocolo.
      // Si es una URL externa (no threads/instagram/CDN), la incluimos sin el https://.
      // Ej: "https://awesome-copilot.github.com/" → "awesome-copilot.github.com"
      if (/^https?:\/\//i.test(candidate)) {
        const stripped = candidate.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('?')[0].split('#')[0]
        const isNoise = /(?:threads\.(?:net|com)|instagram\.com|cdninstagram\.com|l\.threads\.com|l\.instagram\.com|t\.co\/)/i.test(stripped)
        if (!isNoise && stripped.length >= 5 && stripped.includes('.') && !stripped.includes(' ')) {
          validLines.push(stripped)
        }
        continue
      }

      if (/^\[/.test(candidate)) {
        const fullMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(candidate)
        if (!fullMatch) continue
        const [, displayText, rawUrl] = fullMatch
        if (displayText?.startsWith('!')) continue

        const resolved = resolveThreadsTrackingUrl(rawUrl)
        const urlText = resolved ?? rawUrl.replace(/^https?:\/\//i, '')

        // Permitimos handles (@) si están en el cuerpo del mensaje
        if (urlText.length >= 2 && !/threads\.(?:net|com)/i.test(urlText)) {
          validLines.push(urlText)
          continue
        }
        if (displayText && displayText.length >= 2 && !/^\d+[kKmMbB]?$/.test(displayText)) {
          if (!isThreadPositionNoise(displayText)) {
            validLines.push(displayText)
            continue
          }
        }
        continue
      }

      validLines.push(candidate)
    }

    const para = validLines.join('\n').trim()
    if (para) validParagraphs.push(para)
  }

  const text = validParagraphs.join('\n\n').trim() || undefined

  // 6. Extraer media del cuerpo acotado deduplicando URLs
  const rawMediaUrls = [
    ...extractMediaFromText(body),
    ...extractEscapedMediaFromText(body),
  ]
  const mediaUrls = Array.from(new Set(rawMediaUrls.filter((u) => u && u.startsWith('http'))))

  return { text, mediaUrls }
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

/*
  Extrae URLs de imágenes embebidas en el JSON de React que Threads inyecta en el HTML.
  Independiente de Jina — útil cuando Jina falla o es rate-limited.
  Campos buscados: display_url (imagen principal), thumbnail_src (miniatura), og:image fallback.
*/
function extractQuotedImageUrls(source: string): string[] {
  const quoted = [
    ...extractJsonValue(source, 'display_url'),
    ...extractJsonValue(source, 'thumbnail_src'),
    ...extractJsonValue(source, 'image_url'),
  ]

  const unique = new Set<string>()
  return quoted.filter((url) => {
    if (!ABSOLUTE_URL_RE.test(url)) return false
    if (isLikelyAvatarUrl(url)) return false
    if (inferMediaType(url) !== 'image') return false
    if (unique.has(url)) return false
    unique.add(url)
    return true
  })
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
  const v = value.trim()
  // Etiquetas de metadatos de perfil/post que Jina renderiza
  if (/^(?:author|follow|followers?|following|published|likes?|reposts?|replies|related\s+threads|related\s+posts|destacadas|ver\s+actividad|translate|see\s+translation|see\s+original|traducir|ver\s+(?:original|traducci[oó]n))$/i.test(v)) return true
  // PBL: Jina renderiza bullets de navegación del tipo "·Author", "·Follow", etc.
  // El punto medio (·) indica que es un elemento de la UI de Threads, no texto del post.
  if (/^·\s*(?:author|autor|follow|like|reply|repost|share|views?|translate|traducir)/i.test(v)) return true
  // PBL: Error de reproductor de vídeo de Threads — aparece cuando Jina renderiza
  // una tarjeta con vídeo y el player falla al cargar. No es parte del texto del post.
  if (/^sorry,\s+we'?re having trouble/i.test(v)) return true
  // Strings de login/auth o navegación de hilos
  if (/log in to see more replies|sign in (?:with|to) (?:instagram|facebook|threads)|join threads to share ideas|threads\s*•\s*log in|log in or sign up|log in with (?:your\s+)?(?:instagram|facebook|username)|sign up for threads|continue with (?:instagram|facebook)|create (?:a )?new account|forgot (?:your )?password|don'?t have an account|join the conversation|see what people are talking about|what'?s on your mind/i.test(v)) return true
  // Botones / labels de la sección de replies de Threads
  if (/^(?:ver|show|see|view|load|load more)\s+(?:más\s+)?(?:respuestas?|replies|all replies|more replies)$/i.test(v)) return true
  // Métricas de engagement que aparecen antes de la sección de replies
  if (/^[\d.,]+\s*[KkMm]?\s+(?:likes?|me gusta|reacciones)\s*[·•,]\s*[\d.,]+\s*[KkMm]?\s+(?:repl|respuesta)/i.test(v)) return true
  // Etiquetas de hilo como "Thread 1/4" o "Post 2 de 5"
  if (/^(?:thread|hilo|post)\s+\d+\s*(?:of|de|\/)\s*\d+$/i.test(v)) return true
  return false
}

/*
  PBL: Detecta si Jina devolvió la login page de Threads en vez del post real.
  Cuando Threads rate-limita o bloquea a Jina, redirige al login. Jina renderiza
  esa página y la devuelve como si fuera el post solicitado.

  Descartamos esa respuesta (tratándola como null) para que la extracción falle
  limpiamente ("No se extrajo texto. Pulsa Refrescar") en vez de guardar el texto
  del UI del login como contenido del post.

  Señales:
  1. Title genérico — la login page tiene título "Threads", los posts tienen el texto real
  2. Frases del login UI en el área de contenido
*/
function isJinaLoginPage(jinaMarkdown: string): boolean {
  if (!jinaMarkdown) return false

  // Señal 1: Title de login page — "Threads", "Log in to Threads", "Log in • Threads", etc.
  const titleMatch = /^Title:\s*(.+)$/im.exec(jinaMarkdown)
  const title = titleMatch?.[1]?.trim() ?? ''

  // Si el título es genérico de Threads/Instagram, es muy probable que sea login page
  const isGenericTitle = /^(?:threads|instagram)$|^(?:log|sign)\s+in\b/i.test(title)

  // Señal 2: frases del login UI en los primeros 1500 chars del contenido
  const contentMarker = /\nMarkdown Content:\s*\n?/i.exec(jinaMarkdown)
  const contentArea = contentMarker
    ? jinaMarkdown.slice(contentMarker.index + contentMarker[0].length, contentMarker.index + 2500)
    : jinaMarkdown.slice(0, 2500)

  // Buscamos patrones de login explicitos
  const hasLoginPhrases = /log in or sign up|log in with username|continue with (?:instagram|facebook)|see what people are talking about/i.test(contentArea)

  // PBL: Decisión combinada. 
  // Si el título es genérico y hay frases de login → LOGIN PAGE.
  // Si el título NO es genérico (ej. tiene el texto del post), aceptamos el post 
  // incluso si Jina añade ruido de login al final.
  if (isGenericTitle && hasLoginPhrases) return true

  // Caso especial: si no hay título pero hay muchas frases de login al principio
  if (!title && hasLoginPhrases && contentArea.length < 1000) return true

  return false
}

function extractPostId(url: string): string | null {
  const match = /\/(?:post|t)\/([A-Za-z0-9_-]+)/i.exec(url)
  return match?.[1] ?? null
}

function normalizeCandidateLine(line: string): string {
  return line
    .trim()
}

function isThreadPositionNoise(line: string): boolean {
  return /^post\s+\d+\s+de\s+\d+$/i.test(line)
    || /^\d+\s+de\s+\d+$/i.test(line)
    || /^\d+\/\d+$/i.test(line)
    || /^Thread\s*[-—]+\s*[\d.kmb\s]+\s*views$/i.test(line)
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
    // Colapsar espacios extra (preservando saltos de línea)
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return cleaned.length >= 6 ? cleaned : undefined
}

function isImageAltNoise(line: string): boolean {
  return /^!?\[image\s*\d*:/i.test(line)
    || /profile picture/i.test(line)
}

/*
  PBL: Extrae texto con estructura de párrafos del HTML embed de oEmbed.

  Cuando Jina falla (login page, timeout, rate-limit), la única fuente
  disponible es og:description — que colapsa todos los párrafos en una
  sola línea. El API oEmbed de Threads devuelve un campo `html` con el
  blockquote del embed que SÍ preserva la estructura del post:

    <p dir="ltr">
      Primera línea del post.<br>Segunda línea.<br><br>Nuevo párrafo.
      <a href="l.threads.com/?u=...">enlace externo</a>
    </p>

  Convertimos:
    <br><br> → \n\n  (separación de párrafo)
    <br>     → \n    (salto de línea dentro del párrafo)
    <a href="tracking">texto</a> → URL real decodificada (o texto del enlace)

  El resultado se renderiza correctamente con white-space: pre-wrap en la UI.
*/
function processOembedParagraphHtml(raw: string): string | undefined {
  const text = raw
    .replace(/(<br\s*\/?>\s*){2,}/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, (_, href, linkText) => {
      return resolveThreadsTrackingUrl(href) ?? linkText
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return text.length >= 3 ? text : undefined
}

function extractTextFromOembedHtml(html: string): string | undefined {
  if (!html?.trim()) return undefined

  // Threads oEmbed: el texto está dentro de <blockquote> → buscar ahí primero
  // PBL: blockquote puede ser GREEDY aquí — el HTML del oEmbed solo tiene UN blockquote
  const blockquoteMatch = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i.exec(html)
  const searchArea = blockquoteMatch?.[1] ?? html

  /*
    PBL: un post puede tener múltiples párrafos, cada uno en su propio <p dir="ltr">.
    El .exec() anterior solo cogía el primer match. Ahora recogemos TODOS con matchAll
    y los reunimos con \n\n para preservar la separación entre párrafos.
    Fallback a <p> genérico si no hay dir="ltr".
  */
  const collectParagraphs = (re: RegExp): string[] => {
    const result: string[] = []
    for (const m of searchArea.matchAll(re)) {
      const processed = processOembedParagraphHtml(m[1])
      if (processed) result.push(processed)
    }
    return result
  }

  const ltrParagraphs = collectParagraphs(/<p[^>]*dir=["']ltr["'][^>]*>([\s\S]*?)<\/p>/gi)
  let paragraphs = ltrParagraphs.length > 0
    ? ltrParagraphs
    : collectParagraphs(/<p[^>]*>([\s\S]*?)<\/p>/gi)

  /*
    PBL: Fallback cuando el oEmbed no usa <p> en absoluto.
    Algunos embeds de Threads ponen el texto directamente en <a> o <div>, sin <p>.
    Estrategia: tomar el contenido del blockquote completo, quitar <script> y elementos
    de UI (avatars, timestamps), y procesar el texto restante como si fuera HTML plano.
    Solo se usa cuando no encontramos ningún <p>.
  */
  if (paragraphs.length === 0 && searchArea.length > 10) {
    const stripped = searchArea
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<time[^>]*>[^<]*<\/time>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<img[^>]*>/gi, '')
    const processed = processOembedParagraphHtml(stripped)
    if (processed && processed.length >= 10) {
      // Solo aceptar si no es solo metadata (autor, fecha, etc.) — debe tener algún texto real
      if (!isGenericThreadsText(processed)) {
        paragraphs = [processed]
      }
    }
  }

  /*
    PBL: Link attachments en oEmbed — cuando el post enlaza a una URL externa
    (tarjeta de enlace, "link post"), Threads la incluye en el blockquote como
    un <a href="l.threads.com/?u=URL_REAL"> FUERA de los <p> de texto.
    La extracción de párrafos la ignora porque solo busca dentro de <p>.
    Solución: buscar también <a> con tracking URLs en el searchArea completo,
    decodificarlos y añadirlos como párrafo final si no están ya en el texto.
  */
  const extractedParaText = paragraphs.join('\n\n')
  const linkRe = /<a[^>]+href=["']https?:\/\/l\.(?:threads|instagram)\.com\/[^"']*["'][^>]*>([^<]*)<\/a>/gi
  for (const m of searchArea.matchAll(linkRe)) {
    // Extraer la URL real del atributo href
    const hrefMatch = /href=["'](https?:\/\/l\.(?:threads|instagram)\.com\/[^"']+)["']/i.exec(m[0])
    if (!hrefMatch) continue
    const decoded = resolveThreadsTrackingUrl(hrefMatch[1])
    if (!decoded) continue
    // Añadir solo si la URL no aparece ya en el texto extraído
    if (!extractedParaText.includes(decoded)) {
      paragraphs.push(decoded)
    }
  }

  if (paragraphs.length === 0) return undefined
  const text = paragraphs.join('\n\n').trim()
  return text.length >= 6 ? text : undefined
}

/*
  PBL: Extrae texto estructurado (con \n) del HTML de la página de Threads.
  Estrategia: cuando Jina falla y oEmbed no tiene <br>, el HTML bruto de la
  página de Threads (que Tauri obtiene sin CORS) contiene el JSON de estado
  inicial de React. Ese JSON usa \\n para los saltos de línea reales del post.

  El campo relevante varía según el tipo de post, pero la clave "text" en los
  JSON embebidos (script type="application/json" o window.__data__) contiene
  el texto con \\n → decodificamos → \n preservando la estructura original.

  Precaución: hay muchos campos "text" en el JSON — solo aceptamos los que:
  1. Tengan al menos 20 chars (evita UI strings cortos)
  2. Contengan saltos de línea reales (el diferenciador clave)
  3. No sean texto genérico de UI de Threads
*/
function extractTextFromThreadsJson(html: string): string | undefined {
  if (!html) return undefined
  // Regex para capturar valores de "text":"..." en JSON embebido en el HTML
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  let bestCandidate: string | undefined
  let bestCandidateLen = 0

  while ((m = re.exec(html)) !== null) {
    const decoded = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .trim()
    if (decoded.length < 20) continue
    if (isGenericThreadsText(decoded)) continue
    // Preferir textos con saltos de línea (posts multilinea) o los más largos
    const hasNewlines = decoded.includes('\n')
    if (hasNewlines && decoded.length > bestCandidateLen) {
      bestCandidate = decoded
      bestCandidateLen = decoded.length
    } else if (!bestCandidate && decoded.length >= 50) {
      // Texto largo sin \n como candidato de respaldo (posts de un solo párrafo)
      bestCandidate = decoded
      bestCandidateLen = decoded.length
    }
  }
  return bestCandidate
}

/** Decodifica un string escapado de JSON a texto plano con saltos de línea reales. */
function decodeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim()
}

/*
  PBL: Extrae texto del post desde el estado React que Threads embebe en el HTML.
  Independiente de Jina — funciona en Tauri (fetch directo sin CORS) con el HTML
  crudo de la página.

  Threads usa campos específicos en su estado Relay/GraphQL para el texto del post:
    - "text_post_app_text":{"text":"CONTENT"}   → campo primario de post de texto
    - "caption":{"text":"CONTENT"}              → posts con media (imagen/vídeo)

  Estos campos son mucho más fiables que buscar cualquier campo "text" (que tiene
  miles de coincidencias con strings de UI). Recogemos todos los candidatos y
  devolvemos el más largo que pase los filtros, ya que el texto del post es
  generalmente el más largo de todos.

  Ventaja vs extractTextFromThreadsJson: no requiere \n — funciona para posts
  de un párrafo. Devuelve el candidato MÁS LARGO (no el primero), lo que lo hace
  más robusto para hilos donde el mismo estado contiene varios posts.
*/
function extractTextFromThreadsReactState(html: string): string | undefined {
  if (!html) return undefined

  const candidates: string[] = []

  // Campos específicos de Threads en su estado Relay/GraphQL
  const threadFields = [
    // Campo primario de posts de texto puro
    /"text_post_app_text"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gi,
    // Campo de caption para posts con media
    /"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gi,
  ]

  for (const re of threadFields) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const decoded = decodeJsonString(m[1])
      if (decoded.length >= 3 && !isGenericThreadsText(decoded)) {
        candidates.push(decoded)
      }
    }
  }

  if (candidates.length === 0) return undefined
  // Devolver el más largo: el texto del post principal tiende a ser el más largo
  return candidates.reduce((a, b) => a.length >= b.length ? a : b)
}

/*
  PBL: Construye un Map<postId, text> extrayendo todos los textos del estado React
  de Threads. Permite resolver el texto de sub-posts sin llamadas extra a Jina.

  Busca la secuencia ID + text_post_app_text dentro del mismo nodo JSON del estado
  Relay. La ventana de búsqueda es 2000 chars para no solapar con nodos vecinos.
*/
function extractPostTextMapFromReactState(html: string): Map<string, string> {
  const result = new Map<string, string>()
  if (!html) return result

  // Buscamos pares "pk":"POST_ID" o "id":"POST_ID" cerca de "text_post_app_text"
  // dentro de la misma sección del JSON (ventana de 2000 chars)
  const idRe = /"(?:pk|code)"\s*:\s*"([A-Za-z0-9_-]{6,})"/gi
  let idMatch: RegExpExecArray | null

  while ((idMatch = idRe.exec(html)) !== null) {
    const postId = idMatch[1]
    // Buscar text_post_app_text dentro de una ventana adelante y atrás
    const windowStart = Math.max(0, idMatch.index - 200)
    const windowEnd = Math.min(html.length, idMatch.index + 2000)
    const chunk = html.slice(windowStart, windowEnd)

    const textMatch = /"text_post_app_text"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(chunk)
    if (textMatch) {
      const text = decodeJsonString(textMatch[1])
      if (text.length >= 3 && !isGenericThreadsText(text) && !result.has(postId)) {
        result.set(postId, text)
      }
    }
  }

  return result
}

/*
  PBL: Detecta si un texto es una URL sin esquema (ej: "github.com/user/repo").
  Usado para identificar "link posts" — posts cuyo contenido ES un enlace externo.
  Criterios: al menos un punto, sin espacios, empieza por carácter de dominio.
  No detecta URLs relativas ni paths puros (sin dominio).
*/
function looksLikeUrlWithoutScheme(text: string): boolean {
  return /^[\w][\w.-]+\.[a-z]{2,}(\/|$)/i.test(text) && !text.includes(' ')
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

  /*
    PBL: Bug fix — el header de Jina contiene la URL del post:
      "URL Source: https://www.threads.net/@autor/post/DVo3xyVDtKL"
    Si buscamos /post/ID en todas las líneas, la primera coincidencia es
    SIEMPRE esa línea de header, no el enlace real del sub-post dentro del hilo.

    Resultado del bug: anchoredText = texto del POST RAÍZ (que aparece en las
    líneas siguientes al header: "Markdown Content:" → contenido del hilo desde
    el post 1) en vez del texto del sub-post.

    Fix: empezar a buscar el ancla solo DESPUÉS de "Markdown Content:"
    (el separador que Jina incluye siempre). Así la primera coincidencia de
    /post/ID en el área de contenido es el enlace real del sub-post.
  */
  const markdownContentIdx = lines.findIndex((l) => /^markdown content:/i.test(l))
  const contentSearchFrom = markdownContentIdx >= 0 ? markdownContentIdx + 1 : 0

  const postLineIndex = postId
    ? (() => {
      const rel = lines
        .slice(contentSearchFrom)
        .findIndex((line) => new RegExp(`/post/${postId}\\b`, 'i').test(line))
      return rel >= 0 ? contentSearchFrom + rel : -1
    })()
    : -1

  // BUG CORREGIDO: si tenemos postId pero no aparece en el área de contenido,
  // Jina devolvió otra página (perfil/feed). Retornar undefined es más seguro
  // que devolver texto del primer post visible (que puede ser otro post).
  if (postId && postLineIndex === -1) return undefined

  const start = postLineIndex >= 0 ? postLineIndex + 1 : 0
  /*
    PBL: Igual que extractPostSectionFromJina, preservamos párrafos tomando
    el fragmento de líneas y dividiéndolo por bloques de párrafo (\n\n).
    El fallback opera sobre `lines` (array), así que primero reconstruimos
    el fragmento y luego lo dividimos por párrafos.
  */
  const fragmentLines = lines.slice(start, Math.min(lines.length, start + 60))
  const fragmentText = fragmentLines.join('\n')
  const paragraphBlocks = fragmentText.split(/\n{2,}/)
  const validParagraphs: string[] = []

  for (const block of paragraphBlocks) {
    const blockLines = block.split('\n')
    const validLines: string[] = []

    for (const line of blockLines) {
      if (!line) continue
      const candidate = normalizeCandidateLine(line)
      if (candidate.length < 6) continue
      if (/^!\[/.test(candidate)) continue
      if (isImageAltNoise(candidate)) continue

      if (/^\[/.test(candidate)) {
        const fullMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(candidate)
        if (!fullMatch) continue
        const [, displayText, rawUrl] = fullMatch
        if (displayText?.startsWith('!')) continue
        const resolved = resolveThreadsTrackingUrl(rawUrl)
        const urlText = resolved ?? rawUrl.replace(/^https?:\/\//i, '')
        if (urlText.length >= 6 && !/^@/.test(urlText) && !/(?:threads\.(?:net|com)|instagram\.com)/i.test(urlText)) {
          validLines.push(urlText)
          continue
        }
        if (displayText && displayText.length >= 6 && !/^@/.test(displayText) && !/^\d+[kKmMbB]?$/.test(displayText)) {
          if (!isGenericThreadsText(displayText)) {
            validLines.push(displayText)
            continue
          }
        }
        continue
      }
      if (/^\d+$/.test(candidate)) continue
      if (/^title:|^url source:|^markdown content:/i.test(candidate)) continue
      if (isThreadPositionNoise(candidate)) continue
      if (isGenericThreadsText(candidate)) continue

      if (/^https?:\/\//i.test(candidate)) {
        const stripped = candidate.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('?')[0].split('#')[0]
        const isNoise = /(?:threads\.(?:net|com)|instagram\.com|cdninstagram\.com|l\.threads\.com|l\.instagram\.com|t\.co\/)/i.test(stripped)
        if (!isNoise && stripped.length >= 5 && stripped.includes('.') && !stripped.includes(' ')) {
          validLines.push(stripped)
        }
        continue
      }

      validLines.push(candidate)
    }

    const para = validLines.join('\n').trim()
    if (para) validParagraphs.push(para)
  }

  return validParagraphs.join('\n\n').trim() || undefined
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
  Usa extractPostSectionFromJina que acota la sección al bloque exacto del
  sub-post (entre su ancla y el siguiente /post/ID o "Related threads"),
  evitando contaminación de texto/media de otros posts del hilo.

  Pipeline de fallback para texto:
  1. Jina del sub-post propio  → extractPostSectionFromJina (sección acotada)
  2. Jina del post raíz        → extractPostSectionFromJina (mismo algoritmo)
  3. oEmbed HTML del sub-post  → solo el texto de este post, sin contexto de hilo
  4. og:description del HTML   → ÚLTIMO recurso; puede incluir texto del hilo completo
*/
async function extractSubPost(
  subPostId: string,
  authorHandle: string,
  rootThreadJina?: string,
): Promise<ThreadPost | null> {
  const handle = authorHandle.replace(/^@/, '')
  const url = `https://www.threads.net/@${handle}/post/${subPostId}`
  const [html, jinaMarkdown, subOembed] = await Promise.all([
    tryFetchText(url),
    tryFetchText(`https://r.jina.ai/${url}`),
    // PBL: oEmbed como fallback limpio — solo devuelve el texto de este sub-post,
    // sin el contexto del hilo. Evita que og:description (que a veces incluye
    // el texto del post raíz + el del sub-post concatenados) contamine el texto.
    tryFetchJson(`https://www.threads.net/oembed?url=${encodeURIComponent(url)}`),
  ])
  if (!html && !jinaMarkdown && !rootThreadJina) return null
  const trustedHtml = isTrustedHtmlForPost(html, subPostId) ? html : null
  const source = trustedHtml ?? jinaMarkdown ?? ''

  // Extraer sección acotada desde el Jina propio del sub-post
  const ownSection = jinaMarkdown
    ? extractPostSectionFromJina(jinaMarkdown, subPostId)
    : null

  // Fallback: sección acotada desde el Jina del post raíz
  const rootSection = (!ownSection || (!ownSection.text && ownSection.mediaUrls.length === 0)) && rootThreadJina
    ? extractPostSectionFromJina(rootThreadJina, subPostId)
    : null

  const jinaText = ownSection?.text ?? rootSection?.text

  // Fallback React state: busca el sub-post por ID en el JSON de estado de Threads
  // embebido en el HTML directo. Completamente independiente de Jina.
  const reactStateMap = !jinaText && trustedHtml
    ? extractPostTextMapFromReactState(trustedHtml)
    : null
  const reactStateText = reactStateMap?.get(subPostId)

  // Fallback oEmbed: texto estructurado del sub-post específico (sin hilo completo)
  const oembedText = !jinaText && !reactStateText && subOembed?.html
    ? extractTextFromOembedHtml(subOembed.html)
    : undefined

  // Último recurso: og:description — puede contener texto del hilo completo (1/2 + 2/2),
  // solo se usa si todos los anteriores fallaron.
  const metaText = !jinaText && !reactStateText && !oembedText && trustedHtml
    ? firstDefined(
      extractMetaTag(trustedHtml, 'og:description'),
      extractMetaTag(trustedHtml, 'twitter:description'),
    )
    : undefined
  const text = jinaText ?? reactStateText ?? oembedText ?? (metaText && !isGenericThreadsText(metaText) ? metaText : undefined)

  // Construir media
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

  // Media de Jina (sección acotada — sin solapamiento con otros posts)
  const jinaMedia = ownSection?.mediaUrls.length
    ? toMediaEntries(ownSection.mediaUrls)
    : rootSection?.mediaUrls.length
      ? toMediaEntries(rootSection.mediaUrls)
      : []
  addItem(jinaMedia)

  // og:video: único meta fiable (explicita el tipo, raramente aparece en el raíz)
  addItem(forceMediaEntries([extractMetaTag(source, 'og:video')], 'video'))

  // og:image solo si Jina no encontró imágenes (og:image = imagen del raíz normalmente)
  const hasJinaImages = media.some((m) => m.type === 'image')
  if (!hasJinaImages) {
    addItem(forceMediaEntries([
      extractMetaTag(source, 'og:image'),
      extractMetaTag(source, 'twitter:image'),
    ], 'image'))
  }

  const hasRealVideo = media.some((item) => item.type === 'video')
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
  /**
   * Prioriza oEmbed/React state sobre la sección acotada de Jina para el texto final.
   * Útil al refrescar un sub-post específico: oEmbed devuelve solo el texto de ese post,
   * mientras que la sección de Jina puede incluir texto del hilo completo si el anchor
   * detection falla. Con esta opción el texto es más limpio y preciso.
   */
  preferCleanText?: boolean
}

export async function extractPostData(rawUrl: string, options?: ExtractOptions): Promise<ExtractedPostData> {
  const sourceUrl = rawUrl.trim()
  const canonicalUrl = cleanThreadsUrl(sourceUrl)
  const postId = extractPostId(sourceUrl)
  // authorFromInputUrl es síncrono (parse de URL) → disponible antes del primer await
  const authorFromInputUrl = parseThreadsAuthor(canonicalUrl)

  /*
    PBL: 3 orígenes EN PARALELO con Promise.all.
    Orden de preferencia para el HTML fuente:
    1. directHtml  — fetch directo (funciona en Tauri, CORS en browser)
    2. jinaHtml    — Jina Reader (headless proxy, funciona en browser)

    BUG CORREGIDO: el 4º fetch (extractSubPost del post raíz) era un duplicado
    exacto del jinaHtml → 2 requests concurrentes a la MISMA URL de Jina →
    rate-limiting → Jina devolvía login page → extracción fallida en primera llamada.
    Fix: derivar specificPost de jinaHtml ya fetcheado (sin fetch extra).
  */
  // PBL: Añadimos cache-busting (?t=...) a la URL de Threads que le pasamos a Jina.
  // Esto asegura que si el usuario pulsa "Refrescar" tras un fallo anterior, 
  // Jina no nos devuelva su versión cacheada (que probablemente sea la login page).
  const timestamp = Date.now()
  const sep = canonicalUrl.includes('?') ? '&' : '?'
  const jinaTargetUrl = `${canonicalUrl}${sep}t=${timestamp}`

  const [oembed, directHtml, rawJinaHtml] = await Promise.all([
    tryFetchJson(`https://www.threads.net/oembed?url=${encodeURIComponent(sourceUrl)}`),
    tryFetchText(sourceUrl),
    tryFetchText(`https://r.jina.ai/${jinaTargetUrl}`),
  ])
  // Si Jina devolvió la login page de Threads, la descartamos (tratamos como null).
  // Así la extracción falla limpiamente en vez de guardar texto del UI de login.
  const jinaHtml = rawJinaHtml && !isJinaLoginPage(rawJinaHtml) ? rawJinaHtml : null
  const trustedDirectHtml = isTrustedHtmlForPost(directHtml, postId) ? directHtml : null
  const source = jinaHtml ?? trustedDirectHtml ?? ''

  const ogTitle = extractMetaTag(source, 'og:title')
  const ogDescription = extractMetaTag(source, 'og:description')
  const twitterDesc = extractMetaTag(source, 'twitter:description')
  const ogImage = extractMetaTag(source, 'og:image')
  const ogVideo = extractMetaTag(source, 'og:video')
  const ogVideoSecure = extractMetaTag(source, 'og:video:secure_url')
  const twitterImage = extractMetaTag(source, 'twitter:image')
  const twitterVideo = extractMetaTag(source, 'twitter:player:stream')
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
  // Fallback independiente de Jina: imágenes embebidas en el JSON de React del HTML directo.
  // Activo solo cuando Jina no encontró imágenes (CDN expirado, rate-limit, login page, etc.)
  if (!media.some((m) => m.type === 'image') && trustedDirectHtml) {
    addMedia(forceMediaEntries(extractQuotedImageUrls(trustedDirectHtml), 'image'))
  }

  /*
    PBL: Detección de vídeo por thumbnail CDN.
    Threads sirve vídeos via HLS/DASH con tokens de autenticación — no extraíbles.
    Pero el thumbnail del vídeo (t51.71878 en CDN de Meta) sí aparece en Jina.
    Si lo detectamos y no tenemos stream real → añadimos 'video-link' con la URL
    canónica del post para que el usuario pueda abrirlo en Threads desde la app.
  */
  const hasRealVideo = media.some((item) => item.type === 'video')
  const hasVideoThumb = media.some((item) => VIDEO_THUMB_CDN_RE.test(item.url))
  if (!hasRealVideo && hasVideoThumb) {
    media.push({ id: crypto.randomUUID(), type: 'video-link', url: canonicalUrl })
  }

  const previewVideo = media.find((item) => item.type === 'video')?.url
  const previewImage = media.find((item) => item.type === 'image')?.url
  // PBL: Preferir extracción multi-línea acotada de Jina si está disponible.
  //   Esto es mucho más preciso que og:description (que colapsa espacios)
  //   y que el fallback genérico (que recogía menos contexto).
  const jinaSection = jinaHtml && postId ? extractPostSectionFromJina(jinaHtml, postId) : null
  const jinaText = jinaSection?.text

  /*
    PBL: oEmbed HTML como fuente de texto estructurado cuando Jina falla.
    Cuando Jina devuelve login page o tiene timeout, jinaText = undefined y
    caemos en og:description — que colapsa todos los párrafos en una línea.
    El campo oembed.html contiene un <blockquote> con <br> preservando la
    estructura original del post. extractTextFromOembedHtml lo convierte a
    texto con \n y \n\n listos para white-space: pre-wrap.
    Prioridad: jinaText → oembedText → og:description → fallback
  */
  const oembedStructuredText = oembed?.html ? extractTextFromOembedHtml(oembed.html) : undefined

  /*
    PBL: Extracción desde el estado React que Threads embebe en el HTML directo.
    Solo usable en Tauri (fetch directo sin CORS). Busca campos específicos de
    Threads en el estado Relay: "text_post_app_text" y "caption".
    Completamente independiente de Jina — fuente nativa y sin intermediarios.
    Prioridad: oEmbed → reactState → jinaText → directJson (genérico) → og:description
  */
  const reactStateText = trustedDirectHtml
    ? extractTextFromThreadsReactState(trustedDirectHtml)
    : undefined

  const directJsonText = trustedDirectHtml
    ? extractTextFromThreadsJson(trustedDirectHtml)
    : undefined

  const metadataText = firstDefined(ogDescription, twitterDesc, oembed?.title)
  const fallbackText = extractFallbackTextFromSource(source, postId)

  /*
    Pipeline de texto (prioridad de más limpio a más ruidoso):
    1. oEmbed: solo el post, sin replies/comments (fuente oficial)
    2. React state: campos específicos de Threads en el HTML directo (sin Jina)
    3. Jina section: markdown acotado al post (puede incluir noise si boundary falla)
    4. directJson: búsqueda genérica de "text" en JSON (menos preciso)
    5. og:description: puede concatenar hilo completo (último recurso)
  */
  const extractedText = (oembedStructuredText && oembedStructuredText.length >= 20)
    ? oembedStructuredText
    : reactStateText
      ?? jinaText
      ?? oembedStructuredText
      ?? directJsonText
      ?? (isGenericThreadsText(metadataText)
        ? fallbackText
        : firstDefined(metadataText, fallbackText))

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

  /*
    PBL: specificPost derivado de jinaHtml (sin fetch extra).
    Antes: extractSubPost hacía un 2º request a r.jina.ai/misma-URL → rate-limiting.
    Ahora: extractPostSectionFromJina(jinaHtml, postId) reutiliza el markdown ya
    fetcheado → misma calidad de extracción, 0 requests adicionales.

    La sección acotada (hasta el siguiente /post/ID) garantiza que solo se extraen
    texto y media del post correcto, sin contaminación de posts adyacentes.
  */
  const specificPost: ThreadPost | null = (() => {
    if (!postId || !jinaHtml) return null
    const section = extractPostSectionFromJina(jinaHtml, postId)
    if (!section) return null

    const seen = new Set<string>()
    const items: PostMedia[] = []
    const addItem = (m: PostMedia) => {
      if (isLikelyAvatarUrl(m.url)) return
      if (seen.has(m.url)) return
      seen.add(m.url)
      items.push(m)
    }

    // 1. Vídeos de meta tags (tipo explícito, más fiables que inferencia)
    for (const m of forceMediaEntries([ogVideo, ogVideoSecure, twitterVideo], 'video')) addItem(m)
    // 2. CDN images/videos de la sección acotada de Jina
    for (const m of toMediaEntries(section.mediaUrls)) addItem(m)
    // 3. og:image solo si Jina no encontró imágenes (og:image puede ser del post raíz)
    if (!items.some((m) => m.type === 'image')) {
      for (const m of forceMediaEntries([ogImage, twitterImage], 'image')) addItem(m)
    }
    // 4. video-link si hay thumbnail de vídeo pero sin stream directo
    const hasSectionVideo = items.some((m) => m.type === 'video')
    const hasSectionThumb = items.some((m) => VIDEO_THUMB_CDN_RE.test(m.url))
    if (!hasSectionVideo && hasSectionThumb) {
      items.push({ id: crypto.randomUUID(), type: 'video-link', url: canonicalUrl })
    }

    // PBL: si Jina extrajo sección pero sin texto (post con solo media),
    // usamos oembedStructuredText como fallback antes de quedar en undefined.
    const sectionText = section.text ?? oembedStructuredText

    return {
      id: postId,
      url: canonicalUrl,
      text: cleanMarkdownLinks(sectionText),
      media: items.length ? items : undefined,
    }
  })()

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
      // PBL: pasamos jinaHtml (Jina del post raíz) como fuente de fallback.
      // El Jina del raíz contiene el hilo completo → permite extraer texto
      // y media del sub-post cuando su fetch individual devuelve el raíz.
      const results = await Promise.all(
        subIds.map((id) => extractSubPost(id, resolvedAuthor, jinaHtml ?? undefined))
      )
      const valid = results.filter((t): t is ThreadPost => t !== null)
      if (valid.length > 0) threadPosts = valid
    }
  }

  const safeSpecificText = specificPost && !isInvalidExtractedText(specificPost.text)
    ? specificPost.text : undefined
  const safeExtractedText = isInvalidExtractedText(extractedText) ? undefined : extractedText

  /*
    PBL: prioridad de texto final.
    Modo normal: safeSpecificText (sección Jina acotada) → safeExtractedText (oEmbed/React)
    Modo preferCleanText: safeExtractedText (oEmbed/React) → safeSpecificText (Jina)

    preferCleanText se activa al refrescar un sub-post directamente. oEmbed devuelve
    SOLO el texto de ese post — sin el contexto del hilo completo. La sección Jina puede
    fallar con el anchor detection y devolver texto del hilo raíz en vez del sub-post.
  */
  const jinaFinalText = options?.preferCleanText
    ? cleanMarkdownLinks(firstDefined(safeExtractedText, safeSpecificText))
    : cleanMarkdownLinks(firstDefined(safeSpecificText, safeExtractedText))

  const directHtmlDesc = !jinaFinalText && trustedDirectHtml
    ? firstDefined(
      extractMetaTag(trustedDirectHtml, 'og:description'),
      extractMetaTag(trustedDirectHtml, 'twitter:description'),
    )
    : undefined
  const finalText = jinaFinalText
    ?? (directHtmlDesc && !isGenericThreadsText(directHtmlDesc)
      ? cleanMarkdownLinks(directHtmlDesc)
      : undefined)

  let finalPreviewImage = specificPost?.media?.find((m) => m.type === 'image')?.url ?? previewImage

  /*
    PBL: Thumbnail para "link posts" — posts cuyo contenido ES un enlace externo.
    Si el texto extraído es una URL (ej: "github.com/user/repo") y no tenemos
    ninguna imagen de previsualización, intentamos obtener el og:image de la
    página enlazada. Esto mejora la UI mostrando el social preview del repositorio,
    artículo, o vídeo enlazado.

    Limitaciones:
    - Solo funciona en Tauri (fetch directo sin CORS). En browser mode falla
      silenciosamente (tryFetchText devuelve null).
    - Timeout heredado de tryFetchText: 8s. Si la página es lenta, el guardado
      total puede tardar más. Esto es un tradeoff aceptable para link posts.
    - Sitios sin og:image (o con imágenes que parecen avatares) → sin cambio.
  */
  if (finalText && looksLikeUrlWithoutScheme(finalText) && !finalPreviewImage) {
    const linkedHtml = await tryFetchText(`https://${finalText}`)
    if (linkedHtml) {
      const linkedOgImage = extractMetaTag(linkedHtml, 'og:image')
      if (linkedOgImage && !isLikelyAvatarUrl(linkedOgImage)) {
        finalPreviewImage = linkedOgImage
      }
    }
  }

  return {
    canonicalUrl: normalizedCanonical,
    author: resolvedAuthor || '@desconocido',
    title: firstDefined(oembed?.title, ogTitle),
    text: finalText,
    previewImage: finalPreviewImage,
    previewVideo: specificPost?.media?.find((m) => m.type === 'video')?.url ?? previewVideo,
    media: specificPost?.media?.length ? specificPost.media : media,
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
