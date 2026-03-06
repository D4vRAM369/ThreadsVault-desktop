// PBL: 'video-link' = post tiene vídeo pero el CDN de Meta usa auth firmada —
// no podemos extraer el stream. Guardamos la URL del post original para abrir en Threads.
export type PostMediaType = 'image' | 'video' | 'video-link'

export interface PostMedia {
  id: string
  type: PostMediaType
  url: string
  cachedDataUrl?: string
  cachedAt?: number
}

export interface ThreadPost {
  id: string        // short ID del post en Threads (ej: "DVi0HYoDOYp")
  url: string       // URL canónica completa
  text?: string     // texto extraído (opcional)
  media?: PostMedia[]
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
  threadPosts?: ThreadPost[]   // sub-posts 2/N, 3/N, etc. del hilo
}

export interface Category {
  id: string
  name: string
  color: string         // hex: "#7C4DFF"
  emoji?: string        // opcional: "📌", "🔥", etc.
  order?: number        // posición para drag & drop
}

export type AppState = 'loading' | 'success' | 'empty' | 'error'
