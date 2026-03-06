import type { Post, PostMedia } from '../types'

interface CacheOptions {
  maxItems?: number
  maxImageBytes?: number
  maxVideoBytes?: number
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  maxItems: Number.POSITIVE_INFINITY,
  maxImageBytes: 25 * 1024 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
}

/*
  PBL: images.weserv.nl es un proxy de imágenes (no de texto como Jina).
  Añade CORS headers propios → fetch() puede descargar imágenes desde CDNs
  que bloquean CORS (*.cdninstagram.com, *.fbcdn.net).
  Formato: ?url=host/path-sin-scheme (la librería acepta ambos formatos).
*/
function toImageProxyUrl(url: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//i, ''))}`
}

function isLikelyTextResponse(contentType: string): boolean {
  return /text\/|application\/json|application\/xml|application\/javascript/i.test(contentType)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function downloadMediaBlob(url: string, mediaType: PostMedia['type']): Promise<Blob | null> {
  /*
    PBL: Para imágenes intentamos dos estrategias:
      1. Directo — falla si el CDN no tiene CORS headers (cdninstagram, fbcdn)
      2. Proxy weserv.nl — añade CORS, puede cachear cualquier imagen pública

    Para vídeos solo el intento directo: weserv.nl no sirve vídeos.
    El timeout es 6s por intento — 12s máximo para imágenes, 6s para vídeos.
  */
  const attempts = mediaType === 'image' ? [url, toImageProxyUrl(url)] : [url]

  for (const attempt of attempts) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const response = await fetch(attempt, {
        headers: {
          Accept: mediaType === 'video'
            ? 'video/*,application/octet-stream,*/*'
            : 'image/*,application/octet-stream,*/*',
        },
        signal: controller.signal,
      })
      if (!response.ok) continue

      const contentType = response.headers.get('content-type') ?? ''
      if (isLikelyTextResponse(contentType)) continue

      const blob = await response.blob()
      if (!blob.size) continue
      return blob
    } catch {
      // continuar con siguiente estrategia
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}

async function cacheMediaItem(media: PostMedia, options: Required<CacheOptions>): Promise<PostMedia> {
  if (media.cachedDataUrl) return media
  // PBL: video-link no es un archivo — es la URL del post original. No se descarga.
  if (media.type === 'video-link') return media

  const blob = await downloadMediaBlob(media.url, media.type)
  if (!blob) return media

  const limit = media.type === 'video' ? options.maxVideoBytes : options.maxImageBytes
  if (blob.size > limit) return media

  try {
    const cachedDataUrl = await blobToDataUrl(blob)
    return {
      ...media,
      cachedDataUrl,
      cachedAt: Date.now(),
    }
  } catch {
    return media
  }
}

export async function cachePostMediaLocally(post: Post, opts: CacheOptions = {}): Promise<Post> {
  if (!post.media?.length) return post

  const options = { ...DEFAULT_OPTIONS, ...opts }
  const maxItems = Number.isFinite(options.maxItems) ? Math.max(0, options.maxItems) : post.media.length

  const updatedMedia: PostMedia[] = []
  let changed = false

  for (let i = 0; i < post.media.length; i += 1) {
    const media = post.media[i]
    if (i >= maxItems) {
      updatedMedia.push(media)
      continue
    }

    const cached = await cacheMediaItem(media, options)
    if (cached !== media) changed = true
    updatedMedia.push(cached)
  }

  if (!changed) return post
  return { ...post, media: updatedMedia }
}
