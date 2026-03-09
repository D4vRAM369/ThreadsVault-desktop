import { writable, derived } from 'svelte/store'
import type { Post, Category, AppState } from '../types'
import { getStorage } from '../storage/index'
import { extractPostData } from '../utils/post-extractor'
import { cachePostMediaLocally } from '../utils/media-cache'

const HASHTAG_RE = /\B#[\wáéíóúüñÁÉÍÓÚÜÑ]+/gi

function getPostText(post: Post): string {
  return `${post.note ?? ''}\n${post.extractedText ?? ''}\n${post.previewTitle ?? ''}`
}

function extractHashtagsFromText(text: string): string[] {
  return text.match(HASHTAG_RE)?.map((item) => item.toLowerCase()) ?? []
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tokenizeQuery(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function scorePostAgainstTerms(post: Post, terms: string[]): number {
  const tags = extractHashtagsFromText(getPostText(post)).map(normalizeText)
  const title = normalizeText(post.previewTitle ?? '')
  const extracted = normalizeText(post.extractedText ?? '')
  const note = normalizeText(post.note ?? '')
  const author = normalizeText(post.author ?? '')
  const canonical = normalizeText(post.canonicalUrl ?? '')
  const url = normalizeText(post.url ?? '')

  let totalScore = 0
  let matchedTerms = 0

  for (const term of terms) {
    const plainTerm = term.startsWith('#') ? term.slice(1) : term
    if (!plainTerm) continue

    let termScore = 0

    const exactTag = `#${plainTerm}`
    if (tags.includes(exactTag)) termScore += 100
    else if (tags.some((tag) => tag.includes(plainTerm))) termScore += 70

    if (title.includes(plainTerm)) termScore += 60
    if (extracted.includes(plainTerm)) termScore += 55
    if (note.includes(plainTerm)) termScore += 45
    if (author.includes(plainTerm)) termScore += author.startsWith(plainTerm) ? 35 : 30
    if (canonical.includes(plainTerm) || url.includes(plainTerm)) termScore += 15

    if (termScore > 0) matchedTerms += 1
    totalScore += termScore
  }

  return matchedTerms === terms.length ? totalScore : 0
}

// ── Estado global reactivo ────────────────────────────────
export const posts          = writable<Post[]>([])
export const categories     = writable<Category[]>([])
export const appState       = writable<AppState>('loading')
export const searchQuery    = writable<string>('')
export const activeCategory = writable<string | null>(null)
export const activeHashtag  = writable<string | null>(null)

let refreshingStaleMedia = false

export const mediaRefreshState  = writable<'idle' | 'refreshing' | 'done' | 'error'>('idle')
export const mediaRefreshResult = writable<{ updated: number; failed: number }>({ updated: 0, failed: 0 })

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
    const matches = extractHashtagsFromText(getPostText(p))
    matches.forEach(tag => set.add(tag.toLowerCase()))
  })
  return Array.from(set).sort()
})

/** Hashtags con conteo para pintar dashboard estilo Android */
export const hashtagStats = derived(posts, ($posts) => {
  const counts = new Map<string, number>()
  $posts.forEach((post) => {
    const unique = new Set(extractHashtagsFromText(getPostText(post)))
    unique.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
  })

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag))
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
      result = result.filter((p) => extractHashtagsFromText(getPostText(p)).includes($hashtag.toLowerCase()))
    }

    if ($query.trim()) {
      const terms = tokenizeQuery($query)
      result = result
        .map((post) => ({ post, score: scorePostAgainstTerms(post, terms) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => (b.score - a.score) || (b.post.savedAt - a.post.savedAt))
        .map((entry) => entry.post)
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

function needsMediaRefresh(post: Post): boolean {
  const hasImageMedia = Boolean(post.media?.some((media) => media.type === 'image'))
  const hasVideoFallback = Boolean(post.media?.some((media) => media.type === 'video-link'))
  /*
    PBL: Bug fix — posts con imagen extraída (url) pero sin caché local (cachedDataUrl).
    El código antiguo usaba r.jina.ai como proxy de imágenes, que devolvía texto/HTML
    (isLikelyTextResponse → skip) → cachedDataUrl nunca se guardaba.
    El nuevo código usa images.weserv.nl que sí sirve imágenes con CORS → caching funciona.
    Sin este check, estos posts nunca se reintentaban porque hasImageMedia = true ya era
    suficiente para considerarlos "sanos". La URL del CDN expira en ~24-48h → "POST" placeholder.
  */
  const hasUncachedImages = Boolean(
    post.media?.some((media) => media.type === 'image' && !media.cachedDataUrl)
  )
  return !post.previewImage || !hasImageMedia || hasVideoFallback || hasUncachedImages
}

export async function refreshStalePostMedia(limit: number = 6) {
  if (refreshingStaleMedia) return
  refreshingStaleMedia = true
  mediaRefreshState.set('refreshing')

  let updated = 0
  let failed  = 0

  try {
    const storage = await getStorage()
    const loadedPosts = await storage.getPosts()
    const stalePosts = loadedPosts.filter(needsMediaRefresh).slice(0, limit)

    for (const post of stalePosts) {
      try {
        const extracted = await extractPostData(post.canonicalUrl ?? post.url)

        // PBL: extracción hueca en refresh automático — si todos los fetches fallaron,
        // skip este post silenciosamente (no contar como fallido, lo reintentará
        // en el próximo ciclo de refresh). Solo fallamos si hay un error real (catch).
        const extractionIsEmpty = !extracted.media?.length && !extracted.previewImage && !extracted.text
        if (extractionIsEmpty) continue

        const bestText = extracted.text && extracted.text.length > (post.extractedText?.length ?? 0)
          ? extracted.text
          : (post.extractedText ?? extracted.text)

        const merged: Post = {
          ...post,
          url: extracted.canonicalUrl || post.url,
          canonicalUrl: extracted.canonicalUrl || post.canonicalUrl || post.url,
          author: post.author || extracted.author || '@desconocido',
          previewTitle: post.previewTitle ?? extracted.title,
          previewImage: extracted.previewImage ?? post.previewImage,
          previewVideo: extracted.previewVideo ?? post.previewVideo,
          extractedText: bestText,
          media: extracted.media?.length ? extracted.media : (post.media ?? []),
        }

        const withCachedMedia = await cachePostMediaLocally(merged, {
          maxItems: 4,
          maxVideoBytes: 120 * 1024 * 1024,
        })

        await storage.savePost(withCachedMedia)
        updated++
      } catch (error) {
        console.warn('No se pudo refrescar media antigua', post.url, error)
        failed++
      }
    }

    const refreshedPosts = await storage.getPosts()
    posts.set(refreshedPosts)
    appState.set(refreshedPosts.length === 0 ? 'empty' : 'success')
    mediaRefreshResult.set({ updated, failed })
    mediaRefreshState.set(updated === 0 && failed > 0 ? 'error' : 'done')
  } catch (e) {
    console.error(e)
    mediaRefreshResult.set({ updated, failed })
    mediaRefreshState.set('error')
  } finally {
    refreshingStaleMedia = false
    setTimeout(() => mediaRefreshState.set('idle'), 4000)
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

// ── Acciones: Bulk ────────────────────────────────────────

/**
 * Fusiona los posts seleccionados en un hilo.
 * El más antiguo se convierte en el post principal y los demás
 * se convierten en threadPosts del mismo. Los duplicados se eliminan.
 */
export async function mergePostsIntoThread(postIds: string[]): Promise<void> {
  if (postIds.length < 2) return
  const storage = await getStorage()
  const allPosts = await storage.getPosts()
  const targets = postIds
    .map((id) => allPosts.find((p) => p.id === id))
    .filter((p): p is Post => p !== null && p !== undefined)
    .sort((a, b) => a.savedAt - b.savedAt)

  if (targets.length < 2) return

  const [principal, ...rest] = targets
  const newThreadPosts = rest.map((p) => ({
    id: p.id,
    url: p.canonicalUrl ?? p.url,
    text: p.extractedText,
    media: p.media,
  }))

  const merged: Post = {
    ...principal,
    threadPosts: [...(principal.threadPosts ?? []), ...newThreadPosts],
  }

  await storage.savePost(merged)
  await Promise.all(rest.map((p) => storage.deletePost(p.id)))
  await loadVault()
}

/** Mueve los posts seleccionados a una categoría. */
export async function movePostsToCategory(postIds: string[], categoryId: string): Promise<void> {
  if (!postIds.length) return
  const storage = await getStorage()
  const allPosts = await storage.getPosts()
  const targets = postIds
    .map((id) => allPosts.find((p) => p.id === id))
    .filter((p): p is Post => p !== null && p !== undefined)

  await Promise.all(targets.map((p) => storage.savePost({ ...p, categoryId })))
  await loadVault()
}

/** Elimina múltiples posts a la vez. */
export async function bulkDeletePosts(postIds: string[]): Promise<void> {
  if (!postIds.length) return
  const storage = await getStorage()
  await Promise.all(postIds.map((id) => storage.deletePost(id)))
  await loadVault()
}
