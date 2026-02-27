// Mismo regex que Android PostRepository.kt — compatibilidad garantizada
const THREADS_AUTHOR_REGEX = /threads(?:\.net|\.com)\/@([A-Za-z0-9._]+)/

export function parseThreadsAuthor(url: string): string {
  const match = THREADS_AUTHOR_REGEX.exec(url)
  return match ? `@${match[1]}` : ''
}

export function isValidThreadsUrl(url: string): boolean {
  if (!url) return false
  return THREADS_AUTHOR_REGEX.test(url)
}
