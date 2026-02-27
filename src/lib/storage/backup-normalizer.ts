import type { Category, Post, PostMedia } from '../types'
import { cleanThreadsUrl, parseThreadsAuthor } from '../utils/url-parser'

interface NormalizedBackup {
  categories: Category[]
  posts: Post[]
}

const FALLBACK_COLORS = [
  '#7C4DFF',
  '#00BCD4',
  '#26A69A',
  '#FF5252',
  '#FF9800',
  '#3F51B5',
  '#E040FB',
]

function safeString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function safeId(value: unknown, prefix: string): string {
  const id = safeString(value)
  if (id) return id
  const token = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${token}`
}

function normalizeColor(value: unknown, index: number): string {
  const color = safeString(value)
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function mediaTypeFromUrl(url: string): 'image' | 'video' {
  return /\.(mp4|mov|webm|m3u8)(\?.*)?$/i.test(url) ? 'video' : 'image'
}

function extractUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') return safeString((item as { url?: unknown }).url)
        return ''
      })
      .filter(Boolean)
  }

  const text = safeString(value)
  if (!text) return []

  const matches = text.match(/https?:\/\/[^\s,]+/gi)
  return matches ?? []
}

function createMedia(urls: string[]): PostMedia[] {
  const unique = new Set<string>()
  const media: PostMedia[] = []

  urls.forEach((url) => {
    if (!url || unique.has(url)) return
    unique.add(url)
    media.push({
      id: safeId(undefined, 'media'),
      type: mediaTypeFromUrl(url),
      url,
    })
  })

  return media
}

export function normalizeBackupPayload(raw: unknown): NormalizedBackup {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato de backup inválido')
  }

  const root = raw as {
    categories?: unknown[]
    posts?: unknown[]
    exportedAt?: unknown
    exportedAtMillis?: unknown
  }

  if (!Array.isArray(root.categories) || !Array.isArray(root.posts)) {
    throw new Error('Formato de backup inválido: faltan categorías o posts')
  }

  const categories: Category[] = []
  const categoryNameToId = new Map<string, string>()
  const categoryIds = new Set<string>()

  root.categories.forEach((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const name = safeString(item.name ?? item.nombre ?? item.categoryName)
    if (!name) return

    let id = safeId(item.id ?? item.categoryId, 'cat')
    while (categoryIds.has(id)) id = safeId(undefined, 'cat')
    categoryIds.add(id)

    const category: Category = {
      id,
      name,
      color: normalizeColor(item.color, index),
      emoji: safeString(item.emoji ?? item.icon) || undefined,
      order: index,
    }

    categories.push(category)
    categoryNameToId.set(normalizeName(name), id)
  })

  const pendingCategoryNames = new Set<string>()
  root.posts.forEach((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const catName = safeString(item.categorias ?? item.categoryName ?? item.category)
    if (catName) pendingCategoryNames.add(catName)
  })

  pendingCategoryNames.forEach((catName) => {
    const key = normalizeName(catName)
    if (categoryNameToId.has(key)) return

    const index = categories.length
    const category: Category = {
      id: safeId(undefined, 'cat'),
      name: catName,
      color: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      emoji: undefined,
      order: index,
    }
    categories.push(category)
    categoryNameToId.set(key, category.id)
  })

  if (categories.length === 0) {
    const fallback: Category = {
      id: 'cat-default-1',
      name: 'General',
      color: '#7C4DFF',
      emoji: '📌',
      order: 0,
    }
    categories.push(fallback)
    categoryNameToId.set(normalizeName(fallback.name), fallback.id)
  }

  const firstCategoryId = categories[0].id
  const exportedAtFallback = Number(root.exportedAt ?? root.exportedAtMillis ?? Date.now())

  const posts = root.posts
    .map((entry): Post | null => {
      const item = (entry ?? {}) as Record<string, unknown>
      const url = safeString(item.url ?? item.link ?? item.postUrl)
      if (!url) return null

      const categoryIdFromId = safeString(item.categoryId)
      const catName = safeString(item.categorias ?? item.categoryName ?? item.category)
      const categoryIdFromName = catName ? categoryNameToId.get(normalizeName(catName)) : undefined
      const categoryId = categoryIdFromId || categoryIdFromName || firstCategoryId

      const note = safeString(item.note ?? item.notas)
      const extractedText = safeString(item.extractedText ?? item.contenido ?? item.content)
      const previewTitle = safeString(item.previewTitle ?? item.titulo) || undefined
      const previewImage = safeString(item.previewImage ?? item.imagenPath ?? item.imagePath) || undefined
      const previewVideo = safeString(item.previewVideo ?? item.videoPath) || undefined

      const media = createMedia([
        ...extractUrls(item.media ?? item.mediaUrls),
        ...(previewImage ? [previewImage] : []),
        ...(previewVideo ? [previewVideo] : []),
      ])

      const rawSavedAt = Number(item.savedAt ?? item.fechaGuardado ?? item.fechaPost ?? exportedAtFallback)
      const savedAt = Number.isFinite(rawSavedAt) && rawSavedAt > 0 ? rawSavedAt : Date.now()
      const canonicalUrl = cleanThreadsUrl(url)

      const author =
        safeString(item.author ?? item.autor) ||
        parseThreadsAuthor(url) ||
        '@desconocido'

      const post: Post = {
        id: safeId(item.id, 'post'),
        url,
        author,
        note,
        categoryId,
        savedAt,
        extractedText: extractedText || undefined,
        canonicalUrl,
        media: media.length ? media : undefined,
      }

      if (previewTitle) post.previewTitle = previewTitle
      if (previewImage) post.previewImage = previewImage
      if (previewVideo) post.previewVideo = previewVideo

      return post
    })
    .filter((post): post is Post => Boolean(post))

  return { categories, posts }
}
