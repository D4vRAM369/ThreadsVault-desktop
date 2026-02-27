// Mismo regex que Android PostRepository.kt — compatibilidad garantizada
const THREADS_AUTHOR_REGEX = /threads(?:\.net|\.com)\/@([A-Za-z0-9._]+)/
const THREADS_HOST_REGEX = /^https?:\/\/(?:www\.)?threads\.(?:net|com)\//i
const THREADS_POST_PATH_REGEX = /\/(?:@[\w.]+\/post\/|post\/|t\/)[A-Za-z0-9_-]+/i
const THREADS_POST_ID_REGEX = /\/post\/([A-Za-z0-9_-]+)/

export function parseThreadsAuthor(url: string): string {
  const match = THREADS_AUTHOR_REGEX.exec(url)
  return match ? `@${match[1]}` : ''
}

export function isValidThreadsUrl(url: string): boolean {
  if (!url) return false
  if (!THREADS_HOST_REGEX.test(url)) return false
  return THREADS_POST_PATH_REGEX.test(url) || THREADS_AUTHOR_REGEX.test(url)
}

/**
 * PBL: Los parámetros ?xmt=... son tokens de tracking de Meta.
 * URL.pathname solo devuelve la ruta, sin query string ni hash.
 * Limpiarlos = URL más corta, más privada y más legible.
 */
export function cleanThreadsUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url
  }
}

/**
 * Devuelve la ruta sin dominio: "@usuario/post/ABC123"
 * PBL: Mostrar solo lo relevante mejora la cognición —
 * el usuario ya sabe que es de Threads, no necesita ver el dominio.
 */
export function getPostDisplayPath(url: string): string {
  try {
    const u = new URL(url)
    // Remove leading slash: "/@user/post/ID" → "@user/post/ID"
    return u.pathname.replace(/^\//, '')
  } catch {
    return url
  }
}

/**
 * Extrae el shortcode del post (primeros 11 chars del ID).
 * PBL: IDs tipo "DVOk0TEid8F" son base64url de Instagram/Meta.
 * Solo mostramos los primeros caracteres — suficiente para identificar.
 */
export function getPostShortId(url: string): string {
  const match = THREADS_POST_ID_REGEX.exec(url)
  if (!match) return ''
  const id = match[1]
  return id.length > 11 ? `${id.slice(0, 11)}…` : id
}
