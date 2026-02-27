export interface Post {
  id: string            // crypto.randomUUID()
  url: string
  author: string        // "@usuario" extraído de URL
  note: string
  categoryId: string
  savedAt: number       // Date.now() — timestamp Unix ms
  previewTitle?: string
  previewImage?: string
}

export interface Category {
  id: string
  name: string
  color: string         // hex: "#7C4DFF"
}

export type AppState = 'loading' | 'success' | 'empty' | 'error'
