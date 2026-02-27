import { writable, derived } from 'svelte/store'
import type { Post, Category, AppState } from '../types'
import { getStorage } from '../storage/index'

// ── Estado global reactivo ────────────────────────────────
export const posts          = writable<Post[]>([])
export const categories     = writable<Category[]>([])
export const appState       = writable<AppState>('loading')
export const searchQuery    = writable<string>('')
export const activeCategory = writable<string | null>(null)
export const activeHashtag  = writable<string | null>(null)

/*
  PBL: derived() crea stores de solo-lectura que se recalculan
  automáticamente cuando cambian sus dependencias.
  Definimos DOS derived stores:
  1. allHashtags — extrae etiquetas #tag únicas de las notas
  2. filteredPosts — aplica todos los filtros activos
*/

/** Extrae todos los hashtags únicos de las notas de los posts */
export const allHashtags = derived(posts, ($posts) => {
  const set = new Set<string>()
  $posts.forEach(p => {
    // PBL: \B#[\w...] = boundary no-inicial + # + caracteres con tildes.
    const matches = (p.note ?? '').match(/\B#[\wáéíóúüñÁÉÍÓÚÜÑ]+/gi) ?? []
    matches.forEach(tag => set.add(tag.toLowerCase()))
  })
  return Array.from(set).sort()
})

/** Posts filtrados por categoría, hashtag y búsqueda de texto */
export const filteredPosts = derived(
  [posts, searchQuery, activeCategory, activeHashtag],
  ([$posts, $query, $category, $hashtag]) => {
    let result = $posts

    if ($category) {
      result = result.filter(p => p.categoryId === $category)
    }

    if ($hashtag) {
      result = result.filter(p =>
        (p.note ?? '').toLowerCase().includes($hashtag.toLowerCase())
      )
    }

    if ($query.trim()) {
      const q = $query.toLowerCase()
      result = result.filter(p =>
        p.url.toLowerCase().includes(q)    ||
        p.author.toLowerCase().includes(q) ||
        (p.note ?? '').toLowerCase().includes(q)
      )
    }

    return result
  }
)

// ── Acciones: Vault ──────────────────────────────────────
export async function loadVault() {
  appState.set('loading')
  try {
    const storage = await getStorage()
    const [loadedPosts, loadedCats] = await Promise.all([
      storage.getPosts(),
      storage.getCategories(),
    ])
    posts.set(loadedPosts)
    categories.set(loadedCats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
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

// ── Acciones: Categorías ─────────────────────────────────
export async function saveCategoryAction(cat: Category) {
  const storage = await getStorage()
  await storage.saveCategory(cat)
  const cats = await storage.getCategories()
  categories.set(cats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
}

export async function deleteCategoryAction(id: string) {
  const storage = await getStorage()
  await storage.deleteCategory(id)
  const cats = await storage.getCategories()
  categories.set(cats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
}

/**
 * PBL: Promise.all() ejecuta múltiples promesas EN PARALELO.
 * Guardar 10 categorías con Promise.all es ~10x más rápido
 * que hacerlo secuencialmente con for/await.
 */
export async function reorderCategories(ordered: Category[]) {
  const storage = await getStorage()
  await Promise.all(
    ordered.map((cat, i) => storage.saveCategory({ ...cat, order: i }))
  )
  categories.set(ordered.map((cat, i) => ({ ...cat, order: i })))
}
