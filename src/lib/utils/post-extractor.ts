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

async function tryFetchJson(url: string): Promise<OEmbedPayload | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4500)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
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
  const timer = setTimeout(() => controller.abort(), 4500)
  try {
    const res = await fetch(url, { signal: controller.signal })
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

  const oembed = await tryFetchJson(
    `https://www.threads.net/oembed?url=${encodeURIComponent(sourceUrl)}`
  )

  const htmlFromSource = await tryFetchText(sourceUrl)
  const html = htmlFromSource ?? (sourceUrl !== canonicalUrl ? await tryFetchText(canonicalUrl) : null)
  const proxiedSource = html ? null : await tryFetchText(`https://r.jina.ai/http://${sourceUrl.replace(/^https?:\/\//, '')}`)
  const proxiedCanonical = proxiedSource || sourceUrl === canonicalUrl
    ? null
    : await tryFetchText(`https://r.jina.ai/http://${canonicalUrl.replace(/^https?:\/\//, '')}`)
  const source = html ?? proxiedSource ?? proxiedCanonical ?? ''

  const ogTitle = extractMetaTag(source, 'og:title')
  const ogDescription = extractMetaTag(source, 'og:description')
  const twitterDescription = extractMetaTag(source, 'twitter:description')
  const ogImage = extractMetaTag(source, 'og:image')
  const ogVideo = extractMetaTag(source, 'og:video')
  const twitterImage = extractMetaTag(source, 'twitter:image')
  const twitterVideo = extractMetaTag(source, 'twitter:player:stream')
  const canonicalFromHtml = extractCanonical(source)
  const postId = extractPostId(sourceUrl)

  const media = toMediaEntries([
    ...(oembed?.thumbnail_url ? [oembed.thumbnail_url] : []),
    ...(oembed?.html ? extractMediaFromText(oembed.html) : []),
    ...extractMediaFromText(source),
    ...[ogImage, ogVideo, twitterImage, twitterVideo].filter(Boolean) as string[],
  ])

  const previewVideo = media.find((item) => item.type === 'video')?.url
  const previewImage = media.find((item) => item.type === 'image')?.url
  const metadataText = firstDefined(ogDescription, twitterDescription, oembed?.title)
  const fallbackText = extractFallbackTextFromSource(source, postId)
  const extractedText = isGenericThreadsText(metadataText)
    ? fallbackText
    : firstDefined(metadataText, fallbackText)
  const normalizedCanonical = isLikelyThreadsPostUrl(canonicalFromHtml)
    ? cleanThreadsUrl(canonicalFromHtml!)
    : canonicalUrl

  return {
    canonicalUrl: normalizedCanonical,
    author: selectAuthor(oembed, normalizedCanonical),
    title: firstDefined(oembed?.title, ogTitle),
    text: extractedText,
    previewImage,
    previewVideo,
    media,
  }
}
