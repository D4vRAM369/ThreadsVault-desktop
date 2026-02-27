export type PostMediaType = 'image' | 'video'

export interface PostMedia {
  id: string
  type: PostMediaType
  url: string
  cachedDataUrl?: string
  cachedAt?: number
}

export interface Post {
  id: string            // crypto.randomUUID()
  url: string
  author: string        // "@usuario" extraído de URL
  note: string
  categoryId: string
  savedAt: number       // Date.now() — timestamp Unix ms
  previewTitle?: string
  previewImage?: string
  previewVideo?: string
  extractedText?: string
  canonicalUrl?: string
  media?: PostMedia[]
}

export interface Category {
  id: string
  name: string
  color: string         // hex: "#7C4DFF"
  emoji?: string        // opcional: "📌", "🔥", etc.
  order?: number        // posición para drag & drop
}

export type AppState = 'loading' | 'success' | 'empty' | 'error'
