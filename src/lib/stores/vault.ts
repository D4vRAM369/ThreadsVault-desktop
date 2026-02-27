import { writable, derived } from 'svelte/store'
import type { Post, Category, AppState } from '../types'
import { getStorage } from '../storage/index'

// Estado global reactivo
export const posts          = writable<Post[]>([])
export const categories     = writable<Category[]>([])
export const appState       = writable<AppState>('loading')
export const searchQuery    = writable<string>('')
export const activeCategory = writable<string | null>(null)

// Posts filtrados — se recalcula automáticamente cuando cambia posts, query o categoría
export const filteredPosts = derived(
  [posts, searchQuery, activeCategory],
  ([$posts, $query, $category]) => {
    let result = $posts

    if ($category) {
      result = result.filter(p => p.categoryId === $category)
    }

    if ($query.trim()) {
      const q = $query.toLowerCase()
      result = result.filter(p =>
        p.url.toLowerCase().includes(q)    ||
        p.author.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q)
      )
    }

    return result
  }
)

// Acciones
export async function loadVault() {
  appState.set('loading')
  try {
    const storage = await getStorage()
    const [loadedPosts, loadedCats] = await Promise.all([
      storage.getPosts(),
      storage.getCategories(),
    ])
    posts.set(loadedPosts)
    categories.set(loadedCats)
    appState.set(loadedPosts.length === 0 ? 'empty' : 'success')
  } catch (e) {
    console.error(e)
    appState.set('error')
  }
}

export async function savePost(post: Post) {
  const storage = await getStorage()
  await storage.savePost(post)
  await loadVault()
}

export async function deletePost(id: string) {
  const storage = await getStorage()
  await storage.deletePost(id)
  await loadVault()
}
