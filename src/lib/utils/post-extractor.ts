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
  return matches.filter((url) => IMAGE_RE.test(url) || VIDEO_RE.test(url))
}

async function tryFetchJson(url: string): Promise<OEmbedPayload | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as OEmbedPayload
  } catch {
    return null
  }
}

async function tryFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
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

export async function extractPostData(rawUrl: string): Promise<ExtractedPostData> {
  const canonicalUrl = cleanThreadsUrl(rawUrl.trim())

  const oembed = await tryFetchJson(
    `https://www.threads.net/oembed?url=${encodeURIComponent(canonicalUrl)}`
  )

  const html = await tryFetchText(canonicalUrl)
  const proxied = html ? null : await tryFetchText(`https://r.jina.ai/http://${canonicalUrl.replace(/^https?:\/\//, '')}`)
  const source = html ?? proxied ?? ''

  const ogTitle = extractMetaTag(source, 'og:title')
  const ogDescription = extractMetaTag(source, 'og:description')
  const twitterDescription = extractMetaTag(source, 'twitter:description')
  const ogImage = extractMetaTag(source, 'og:image')
  const ogVideo = extractMetaTag(source, 'og:video')
  const twitterImage = extractMetaTag(source, 'twitter:image')
  const twitterVideo = extractMetaTag(source, 'twitter:player:stream')
  const canonicalFromHtml = extractCanonical(source)

  const media = toMediaEntries([
    ...(oembed?.thumbnail_url ? [oembed.thumbnail_url] : []),
    ...(oembed?.html ? extractMediaFromText(oembed.html) : []),
    ...extractMediaFromText(source),
    ...[ogImage, ogVideo, twitterImage, twitterVideo].filter(Boolean) as string[],
  ])

  const previewVideo = media.find((item) => item.type === 'video')?.url
  const previewImage = media.find((item) => item.type === 'image')?.url

  return {
    canonicalUrl: canonicalFromHtml ?? canonicalUrl,
    author: selectAuthor(oembed, canonicalUrl),
    title: firstDefined(oembed?.title, ogTitle),
    text: firstDefined(ogDescription, twitterDescription, oembed?.title),
    previewImage,
    previewVideo,
    media,
  }
}
