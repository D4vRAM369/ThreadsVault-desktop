<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { invoke } from '@tauri-apps/api/core'
  import { categories, deletePost, loadVault, posts, savePost } from '../lib/stores/vault'
  import { getStorage } from '../lib/storage/index'
  import CategoryBadge from '../components/CategoryBadge.svelte'
  import { cleanThreadsUrl, getPostShortId } from '../lib/utils/url-parser'
  import { extractPostData, resolvePlayableVideoUrl, fetchOEmbedHtml } from '../lib/utils/post-extractor'
  import { downloadDesktopVideo, isTauriEnvironment, resolveDesktopVideo } from '../lib/utils/desktop-video'
  import { cachePostMediaLocally } from '../lib/utils/media-cache'
  import type { Post, PostMedia } from '../lib/types'

  let { postId }: { postId: string } = $props()

  let post          = $state<Post | null>(null)
  let loading       = $state(true)
  let confirmDelete = $state(false)
  let editingNote   = $state(false)
  let noteValue     = $state('')
  let savingNote    = $state(false)
  let refreshingMedia = $state(false)
  let mediaRefreshError = $state('')
  let refreshingContent = $state(false)
  let failedMediaIds = $state<Set<string>>(new Set())
  let mediaSourceIndex = $state<Record<string, number>>({})
  let inlineVideoState = $state<Record<string, {
    status: 'idle' | 'loading' | 'ready' | 'error'
    src?: string
    downloadSrc?: string
    reason?: string
    source?: 'desktop' | 'web' | 'embed'
    embedHtml?: string   // HTML del reproductor oficial oEmbed de Threads
  }>>({})
  let inlineVideoDownloadState = $state<Record<string, {
    status: 'idle' | 'downloading' | 'done' | 'error'
    filePath?: string
    fileName?: string
    progress?: number
    detail?: string
    error?: string
  }>>({})
  // URLs resueltas en caliente para media type:'video' con CDN expirado
  let resolvedVideoSrcs = $state<Record<string, string>>({})
  let showFailedMedia = $state(false)
  let refreshedMediaOnce = $state(false)
  let carouselImageIndex = $state(0)
  let lightboxSrc = $state<string | null>(null)
  let copiedUrlId = $state<string | null>(null)

  // Resetear carrusel al navegar entre posts del hilo
  $effect(() => {
    const _ = currentThreadIndex
    carouselImageIndex = 0
  })

  function copyMediaUrl(id: string, url: string) {
    void navigator.clipboard.writeText(url)
    copiedUrlId = id
    setTimeout(() => { copiedUrlId = null }, 1800)
  }
  let category           = $derived($categories.find(c => c.id === post?.categoryId))
  let currentThreadIndex = $state(0)
  let threadTotal        = $derived(1 + (post?.threadPosts?.length ?? 0))
  let hasThreadNavigation = $derived((post?.threadPosts?.length ?? 0) > 0)
  let currentThreadUrl   = $derived(
    currentThreadIndex === 0
      ? cleanThreadsUrl(post?.canonicalUrl ?? post?.url ?? '')
      : cleanThreadsUrl(post?.threadPosts?.[currentThreadIndex - 1]?.url ?? post?.canonicalUrl ?? post?.url ?? '')
  )
  let currentThreadShortId = $derived(getPostShortId(currentThreadUrl))
  let currentSubText     = $derived(
    currentThreadIndex === 0
      ? post?.extractedText
      : post?.threadPosts?.[currentThreadIndex - 1]?.text
  )
  let currentSubMedia    = $derived<PostMedia[]>(
    currentThreadIndex === 0
      ? (post?.media ?? [])
      : (post?.threadPosts?.[currentThreadIndex - 1]?.media ?? [])
  )

  onMount(() => {
    void (async () => {
      const storage = await getStorage()
      post      = await storage.getPost(postId)
      noteValue = post?.note ?? ''
      loading   = false

      if (post?.media?.length) {
        for (const media of post.media) {
          if (media.type === 'video-link') {
            void loadInlineVideo(media)
          }
        }
      }
    })()

    function onKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Si el post actual es un hilo, las flechas solo navegan dentro del hilo.
        if (hasThreadNavigation) {
          e.preventDefault()
          const newIdx = e.key === 'ArrowLeft' ? currentThreadIndex - 1 : currentThreadIndex + 1
          if (newIdx >= 0 && newIdx < threadTotal) {
            navigateThread(newIdx)
          }
          return
        }
        const all = get(posts)
        const idx = all.findIndex(p => p.id === postId)
        if (idx === -1) return
        // ← = más reciente (anterior en la lista) · → = más antiguo (siguiente)
        const target = e.key === 'ArrowLeft' ? all[idx - 1] : all[idx + 1]
        if (target) {
          e.preventDefault()
          window.location.hash = `#/post/${target.id}`
        }
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })

  function navigateThread(newIndex: number) {
    currentThreadIndex = newIndex
    failedMediaIds     = new Set()
    mediaSourceIndex   = {}
    inlineVideoState   = {}
    showFailedMedia    = false
    // Auto-load video-links for the newly visible sub-post
    const newMedia = newIndex === 0
      ? (post?.media ?? [])
      : (post?.threadPosts?.[newIndex - 1]?.media ?? [])
    for (const m of newMedia) {
      if (m.type === 'video-link') void loadInlineVideo(m)
    }
  }

  async function handleDelete() {
    if (!post) return
    await deletePost(post.id)
    window.location.hash = '#/'
  }

  async function handleSaveNote() {
    if (!post) return
    savingNote = true
    try {
      const updated: Post = { ...post, note: noteValue.trim() }
      await savePost(updated)
      post = updated
      await loadVault()
      editingNote = false
    } finally {
      savingNote = false
    }
  }

  async function handleDeleteNote() {
    if (!post) return
    const updated: Post = { ...post, note: '' }
    await savePost(updated)
    post = updated
    noteValue = ''
    await loadVault()
    editingNote = false
  }

  // Abre una URL en el browser del sistema (no en el WebView interno de Tauri).
  // En desktop usa open_url (crate open, Rust). En browser usa window.open().
  function openInBrowser(url: string) {
    if ('__TAURI_INTERNALS__' in window) {
      void invoke('open_url', { url })
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }

  function fileNameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const name = pathname.split('/').pop()
      return name && name.length > 3 ? name : `media-${Date.now()}`
    } catch {
      return `media-${Date.now()}`
    }
  }

  /*
    PBL: <a download> no funciona en URLs cross-origin (CDN Instagram/Threads).
    El WebView2/browser ignora el atributo download si el dominio es distinto al de la app.
    Fix: fetch() → Blob → Object URL (mismo origen) → <a download> ya funciona.
    Si está cacheado como data URL, descarga directa sin red.
  */
  function downloadMedia(media: PostMedia) {
    // En Tauri, WebView2 no puede descargar data: URIs ni URLs cross-origin.
    // La solución más fiable: abrir la URL original en el browser del sistema.
    if ('__TAURI_INTERNALS__' in window) {
      openInBrowser(media.url)
      return
    }

    // Fallback para modo browser web: intentar descarga directa vía data URL
    const src = getMediaSource(media)
    if (src.startsWith('data:')) {
      const filename = fileNameFromUrl(media.url)
      const a = document.createElement('a')
      a.href     = src
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }

    openInBrowser(src)
  }

  function getInlineVideoState(media: PostMedia) {
    return inlineVideoState[media.id] ?? { status: 'idle' as const }
  }

  function getInlineVideoDownloadState(media: PostMedia) {
    return inlineVideoDownloadState[media.id] ?? { status: 'idle' as const, progress: 0, detail: '' }
  }

  function getDownloadErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error
    if (error instanceof Error) return error.message
    try {
      return JSON.stringify(error)
    } catch {
      return 'No se pudo descargar el video.'
    }
  }

  async function persistDownloadedVideoPath(media: PostMedia, filePath: string) {
    if (!post?.media?.length) return

    const normalized = filePath.replace(/\\/g, '/')
    const fileUrl = /^[a-zA-Z]:\//.test(normalized)
      ? `file:///${normalized}`
      : `file://${normalized}`

    const updatedMedia = post.media.map((item) => {
      if (item.id !== media.id) return item
      return {
        ...item,
        cachedDataUrl: fileUrl,
        cachedAt: Date.now(),
      }
    })

    const updatedPost: Post = { ...post, media: updatedMedia }
    const storage = await getStorage()
    await storage.savePost(updatedPost)
    post = updatedPost
    await loadVault()
  }

  /*
    PBL: buildEmbedPage — construye una página HTML completa para inyectar en un <iframe srcdoc>.
    ¿Por qué srcdoc y no src?
    - src carga una URL externa → Threads bloquea iframes externos (X-Frame-Options: SAMEORIGIN)
    - srcdoc pasa el HTML como string directamente → no hay petición a Threads,
      el HTML se ejecuta en el contexto del propio iframe → funciona
    El blockquote + embed.js de oEmbed es el reproductor oficial de Threads.
  */
  function buildEmbedPage(embedHtml: string): string {
    return [
      '<!DOCTYPE html><html><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<style>',
      'html,body{margin:0;padding:8px;background:#0a0a14;box-sizing:border-box;}',
      'blockquote{margin:0!important;max-width:100%!important;}',
      '</style>',
      '</head><body>',
      embedHtml,
      '</body></html>',
    ].join('')
  }

  // Re-extrae texto y metadatos del post desde Threads/Jina.
  // A diferencia de refreshMedia (que preserva el texto existente), éste lo sobreescribe.
  // Útil cuando la extracción inicial cogió contenido del post equivocado.
  async function refreshContent() {
    if (!post || refreshingContent) return
    refreshingContent = true
    try {
      const targetUrl = currentThreadUrl || post.canonicalUrl || post.url
      const extracted = await extractPostData(targetUrl)
      const updated: Post =
        currentThreadIndex === 0
          ? {
              ...post,
              author:       extracted.author || post.author,
              previewTitle: extracted.title ?? post.previewTitle,
              extractedText: extracted.text !== undefined ? extracted.text : post.extractedText,
              previewImage: extracted.previewImage ?? post.previewImage,
              previewVideo: extracted.previewVideo ?? post.previewVideo,
            }
          : {
              ...post,
              threadPosts: (post.threadPosts ?? []).map((threadPost, index) => {
                if (index !== currentThreadIndex - 1) return threadPost
                return {
                  ...threadPost,
                  url: cleanThreadsUrl(extracted.canonicalUrl || threadPost.url),
                  text: extracted.text !== undefined ? extracted.text : threadPost.text,
                  media: extracted.media?.length ? extracted.media : threadPost.media,
                }
              }),
            }
      const storage = await getStorage()
      await storage.savePost(updated)
      post = updated
      await loadVault()
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      refreshingContent = false
    }
  }

  async function loadInlineVideo(media: PostMedia) {
    if (!post) return
    const current = getInlineVideoState(media)
    if (current.status === 'loading' || current.status === 'ready') return

    inlineVideoState = {
      ...inlineVideoState,
      [media.id]: { status: 'loading' },
    }

    try {
      const postUrl = post.canonicalUrl ?? post.url

      /*
        PBL: Promise.all — ejecuta los 3 métodos EN PARALELO.
        Si fueran secuenciales: 8s + 8s + 8s = hasta 24s de espera.
        En paralelo: max(8s, 8s, 8s) = ~8s total (el más lento marca el límite).

        Prioridad de resultado (de mayor a menor calidad):
          1. Desktop (Tauri/Rust) → URL .mp4 directa, mejor para descargar
          2. Web extractor        → URL directa extraída del HTML público
          3. oEmbed iframe        → reproductor oficial de Threads embebido
          4. Error               → cuando los 3 métodos fallan
      */
      const [desktopResolution, resolvedUrl, oembedHtml] = await Promise.all([
        resolveDesktopVideo(postUrl),
        resolvePlayableVideoUrl(postUrl),
        fetchOEmbedHtml(postUrl),
      ])

      // 1. URL nativa desde Tauri (Rust fetch sin CORS)
      if (desktopResolution?.playableUrl) {
        inlineVideoState = {
          ...inlineVideoState,
          [media.id]: {
            status: 'ready',
            src: desktopResolution.playableUrl,
            downloadSrc: desktopResolution.downloadUrl ?? desktopResolution.playableUrl,
            source: 'desktop',
          },
        }
        return
      }

      // 2. URL directa extraída del HTML (rara vez funciona en Threads)
      if (resolvedUrl) {
        inlineVideoState = {
          ...inlineVideoState,
          [media.id]: {
            status: 'ready',
            src: resolvedUrl,
            downloadSrc: resolvedUrl,
            source: 'web',
          },
        }
        return
      }

      // 3. Reproductor oEmbed oficial de Threads embebido en iframe
      if (oembedHtml) {
        inlineVideoState = {
          ...inlineVideoState,
          [media.id]: {
            status: 'ready',
            embedHtml: buildEmbedPage(oembedHtml),
            source: 'embed',
          },
        }
        return
      }

      // 4. Todos los métodos fallaron
      inlineVideoState = {
        ...inlineVideoState,
        [media.id]: {
          status: 'error',
          reason: desktopResolution?.reason ?? 'No se pudo resolver el stream del vídeo.',
          source: desktopResolution ? 'desktop' : undefined,
        },
      }
    } catch {
      inlineVideoState = {
        ...inlineVideoState,
        [media.id]: {
          status: 'error',
          reason: 'Fallo la resolución del vídeo en la app.',
        },
      }
    }
  }

  async function downloadInlineVideo(media: PostMedia) {
    if (!post) return
    const currentDownload = getInlineVideoDownloadState(media)
    if (currentDownload.status === 'downloading') return

    if (isTauriEnvironment()) {
      let fakeProgress = 6
      let elapsedTicks = 0
      const timer = setInterval(() => {
        elapsedTicks += 1
        fakeProgress = Math.min(fakeProgress + Math.floor(Math.random() * 6 + 2), 92)
        const isFallbackStage = elapsedTicks >= 10
        inlineVideoDownloadState = {
          ...inlineVideoDownloadState,
          [media.id]: {
            ...(inlineVideoDownloadState[media.id] ?? { status: 'downloading' }),
            status: 'downloading',
            progress: fakeProgress,
            detail: isFallbackStage
              ? 'Reintentando con fallback (yt-dlp)...'
              : fakeProgress < 25
                ? 'Resolviendo stream de Threads...'
                : fakeProgress < 60
                  ? 'Intentando descarga directa...'
                  : 'Procesando descarga...',
          },
        }
      }, 700)

      inlineVideoDownloadState = {
        ...inlineVideoDownloadState,
        [media.id]: {
          status: 'downloading',
          progress: fakeProgress,
          detail: 'Preparando descarga...',
        },
      }

      try {
        const result = await Promise.race([
          downloadDesktopVideo(post.canonicalUrl ?? post.url),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('La descarga tardo demasiado. Reintenta o abre en Threads.')), 180_000)
          ),
        ])

        clearInterval(timer)
        await persistDownloadedVideoPath(media, result.filePath)
        inlineVideoDownloadState = {
          ...inlineVideoDownloadState,
          [media.id]: {
            status: 'done',
            filePath: result.filePath,
            fileName: result.fileName,
            progress: 100,
            detail: result.source === 'yt-dlp-fallback'
              ? `Descarga completada con fallback yt-dlp. Guardado en ${result.filePath}`
              : `Descarga directa completada. Guardado en ${result.filePath}`,
          },
        }
      } catch (error) {
        clearInterval(timer)
        const message = getDownloadErrorMessage(error)
        inlineVideoDownloadState = {
          ...inlineVideoDownloadState,
          [media.id]: {
            status: 'error',
            error: message,
            progress: 0,
            detail: 'La descarga fallo.',
          },
        }
      }
      return
    }

    const state  = getInlineVideoState(media)
    const source = state.downloadSrc ?? state.src
    if (!source) return

    const filename = fileNameFromUrl(source)
    try {
      const res     = await fetch(source)
      const blob    = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href     = blobUrl
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000)
    } catch {
      openInBrowser(source)
    }
  }

  function toImageProxyUrl(url: string): string {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//i, ''))}`
  }

  function getMediaCandidates(media: PostMedia): string[] {
    const candidates = [media.cachedDataUrl, media.url]
    if (media.type === 'image') {
      candidates.push(toImageProxyUrl(media.url))
    }

    const unique = new Set<string>()
    return candidates.filter((candidate): candidate is string => {
      if (!candidate || unique.has(candidate)) return false
      unique.add(candidate)
      return true
    })
  }

  function getCurrentSourceIndex(media: PostMedia): number {
    return mediaSourceIndex[media.id] ?? 0
  }

  // Cuando un media type:'video' falla (CDN firmado expirado), intenta el
  // resolver de Rust en Tauri para obtener una URL fresca via GraphQL.
  async function tryResolveExpiredVideo(media: PostMedia) {
    if (!post || !isTauriEnvironment()) return
    const postUrl = post.canonicalUrl ?? post.url
    const resolution = await resolveDesktopVideo(postUrl)
    if (resolution?.playableUrl) {
      resolvedVideoSrcs = { ...resolvedVideoSrcs, [media.id]: resolution.playableUrl }
      const next = new Set(failedMediaIds)
      next.delete(media.id)
      failedMediaIds = next
    }
  }

  function markMediaFailed(media: PostMedia) {
    if (failedMediaIds.has(media.id)) return
    const next = new Set(failedMediaIds)
    next.add(media.id)
    failedMediaIds = next
    if (!refreshedMediaOnce) {
      void refreshMedia('auto')
    }
    // CDN de Threads usa URLs firmadas que expiran (~24-48h).
    // Si un video falla y estamos en Tauri, pedimos URL fresca al resolver Rust.
    if (media.type === 'video') {
      void tryResolveExpiredVideo(media)
    }
  }

  function handleMediaError(media: PostMedia) {
    const candidates = getMediaCandidates(media)
    const index = getCurrentSourceIndex(media)
    if (index < candidates.length - 1) {
      mediaSourceIndex = { ...mediaSourceIndex, [media.id]: index + 1 }
      return
    }
    markMediaFailed(media)
  }

  function hasVideoMedia(): boolean {
    return Boolean(post?.media?.some((media) => media.type === 'video' || media.type === 'video-link'))
  }

  function isVideoThumbnailImage(media: PostMedia): boolean {
    return media.type === 'image' && /\/t51\.71878[-_]/i.test(media.url)
  }

  function getMediaSource(media: PostMedia): string {
    if (resolvedVideoSrcs[media.id]) return resolvedVideoSrcs[media.id]
    const candidates = getMediaCandidates(media)
    const index = getCurrentSourceIndex(media)
    return candidates[Math.min(index, Math.max(candidates.length - 1, 0))] ?? media.url
  }

  // Carrusel: solo imágenes visibles, sin vídeos
  function imageOnlyMedia(): PostMedia[] {
    return visibleMedia().filter(m => m.type === 'image')
  }

  // Muestra carrusel cuando hay 2+ imágenes y ningún vídeo
  function shouldShowCarousel(): boolean {
    const vm = visibleMedia()
    return vm.filter(m => m.type === 'image').length >= 2 &&
      !vm.some(m => m.type === 'video' || m.type === 'video-link')
  }

  function areAllMediaFailed(): boolean {
    if (!currentSubMedia.length) return false
    return currentSubMedia.every((m) => failedMediaIds.has(m.id))
  }

  function failedMediaCount(): number {
    return failedMediaIds.size
  }

  function visibleMedia(): PostMedia[] {
    if (!currentSubMedia.length) return []
    const baseMedia = showFailedMedia
      ? currentSubMedia
      : currentSubMedia.filter((m) => !failedMediaIds.has(m.id))

    // Si el sub-post tiene vídeo, ocultamos la miniatura CDN para evitar duplicados.
    const hasVideo = currentSubMedia.some((m) => m.type === 'video' || m.type === 'video-link')
    if (hasVideo) {
      return baseMedia.filter((m) => !isVideoThumbnailImage(m))
    }

    return baseMedia
  }

  async function refreshMedia(mode: 'auto' | 'manual' = 'manual') {
    if (!post || refreshingMedia) return
    refreshingMedia = true
    mediaRefreshError = ''

    try {
      // Contexto-aware: si estamos en un sub-post (2/5, 3/5…) extraemos
      // de la URL del sub-post, no de la URL raíz del hilo.
      const targetUrl = currentThreadIndex > 0
        ? currentThreadUrl
        : (post.canonicalUrl ?? post.url)

      const extracted = await extractPostData(targetUrl)

      // PBL: detección de extracción hueca — si los 4 fetches fallaron (Jina caído,
      // CDN bloqueada, timeout) extractPostData devuelve un objeto vacío.
      // Sin este check, se guardaría un post sin media sobreescribiendo datos existentes.
      const extractionIsEmpty = !extracted.media?.length && !extracted.previewImage && !extracted.text
      if (extractionIsEmpty) {
        if (mode === 'manual') {
          mediaRefreshError = 'No se encontró contenido nuevo. Abre el post en Threads e intenta de nuevo.'
        }
        return
      }

      let merged: Post

      if (currentThreadIndex > 0) {
        // Sub-post: actualizar media + texto del sub-post específico
        merged = {
          ...post,
          threadPosts: (post.threadPosts ?? []).map((threadPost, index) => {
            if (index !== currentThreadIndex - 1) return threadPost
            const bestSubText =
              extracted.text && extracted.text.length > (threadPost.text?.length ?? 0)
                ? extracted.text
                : (threadPost.text ?? extracted.text)
            return {
              ...threadPost,
              url: cleanThreadsUrl(extracted.canonicalUrl || threadPost.url),
              text: bestSubText,
              media: extracted.media?.length ? extracted.media : threadPost.media,
            }
          }),
        }
      } else {
        // Post raíz: actualizar texto y media del post principal
        // PBL: extractedText comparativo — usa el texto más completo entre el existente
        // y el recién extraído, en lugar de siempre preservar el antiguo con ??.
        const bestText = extracted.text && extracted.text.length > (post.extractedText?.length ?? 0)
          ? extracted.text
          : (post.extractedText ?? extracted.text)

        merged = {
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
      }

      const withCachedMedia = await cachePostMediaLocally(merged, { maxItems: 12 })

      const storage = await getStorage()
      await storage.savePost(withCachedMedia)
      post = withCachedMedia
      await loadVault()
      failedMediaIds = new Set()
      mediaSourceIndex = {}
      showFailedMedia = false
      refreshedMediaOnce = true
    } catch (error) {
      mediaRefreshError = mode === 'manual'
        ? 'No se pudo actualizar media ahora. Abre el post en Threads y vuelve a intentar.'
        : ''
      console.warn('Error refrescando media', error)
    } finally {
      refreshingMedia = false
    }
  }
</script>

<div class="max-w-lg mx-auto px-4 py-6 animate-fade-up">

  <!-- Barra de navegación superior -->
  <div class="flex items-center justify-between mb-6">
    <!-- Botón volver — mismo estilo que ShareScreen y SettingsScreen -->
    <button
      onclick={() => window.location.hash = '#/'}
      class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
      style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
      aria-label="Volver"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--vault-on-bg)">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>

    <span class="text-xs font-semibold uppercase tracking-widest" style="
      color: var(--vault-on-bg-muted);
      font-family: var(--font-display);
      letter-spacing: 0.12em;
    ">Post guardado</span>

    <!-- Botón eliminar / confirmación inline -->
    {#if !confirmDelete}
      <button
        onclick={() => confirmDelete = true}
        class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
        style="background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18)"
        onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.14)'}
        onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.07)'}
        aria-label="Eliminar"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    {:else}
      <div class="flex items-center gap-1.5">
        <span class="text-xs" style="color: var(--vault-on-bg-muted)">¿Eliminar?</span>
        <button
          onclick={handleDelete}
          class="px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
          style="background: rgba(239,68,68,0.75); font-family: var(--font-display)"
        >Sí</button>
        <button
          onclick={() => confirmDelete = false}
          class="px-2.5 py-1 rounded-lg text-xs font-semibold"
          style="background: rgba(255,255,255,0.08); color: var(--vault-on-bg); font-family: var(--font-display)"
        >No</button>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48">
      <div class="w-9 h-9 rounded-full animate-spin" style="
        border: 2.5px solid rgba(124,77,255,0.15);
        border-top-color: var(--vault-primary);
        border-right-color: var(--vault-secondary);
      "></div>
    </div>

  {:else if !post}
    <div class="flex flex-col items-center justify-center h-48 gap-3" style="opacity:0.45">
      <p style="color: var(--vault-on-bg-muted); font-family: var(--font-display)">Post no encontrado</p>
    </div>

  {:else}
    <!-- Card principal del post -->
    <article class="rounded-2xl p-5 mb-4 relative overflow-hidden" style="
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.11);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 4px 28px rgba(0,0,0,0.3);
    ">
      <!-- Línea superior iluminada — "efecto cristal" -->
      <div class="absolute top-0 left-6 right-6 h-px pointer-events-none" style="
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      "></div>

      <!-- Autor con gradiente brand -->
      <p class="text-lg font-bold mb-2" style="
        background: linear-gradient(135deg, var(--vault-primary) 0%, var(--vault-secondary) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: var(--font-display);
        letter-spacing: 0.01em;
      ">{post.author || 'Autor desconocido'}</p>

      {#if post.previewTitle}
        <p class="text-sm mb-2.5" style="color: var(--vault-on-bg); opacity: 0.9">{post.previewTitle}</p>
      {/if}

      <!--
        PBL: Mostramos el shortId del post en lugar de la URL completa.
        getPostShortId() extrae los primeros 11 chars del identificador base64.
        cleanThreadsUrl() elimina los parámetros de tracking ?xmt=...
        El chip visual indica que es un enlace externo (↗ icon).
      -->
      <a
        href={currentThreadUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 mb-4 transition-all duration-200"
        style="
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 8px;
          padding: 4px 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--vault-on-bg-muted);
          text-decoration: none;
          max-width: 100%;
          overflow: hidden;
        "
        onmouseenter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'rgba(124,77,255,0.35)'
          el.style.color = 'var(--vault-on-bg)'
        }}
        onmouseleave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'rgba(255,255,255,0.10)'
          el.style.color = 'var(--vault-on-bg-muted)'
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span class="truncate">post/{currentThreadShortId}</span>
      </a>

      {#if hasThreadNavigation}
        <div class="flex items-center justify-between mb-4 rounded-xl px-3.5 py-2" style="
          background: rgba(0,188,212,0.07);
          border: 1px solid rgba(0,188,212,0.22);
        ">
          <button
            onclick={() => navigateThread(currentThreadIndex - 1)}
            disabled={currentThreadIndex === 0}
            class="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30"
            style="background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.25); color: #baf5ff"
            aria-label="Sub-post anterior"
          >←</button>
          <span class="text-xs font-semibold" style="
            color: #baf5ff;
            font-family: var(--font-display);
            letter-spacing: 0.06em;
          ">🧵 HILO · {currentThreadIndex + 1} / {threadTotal} · {currentThreadShortId}</span>
          <button
            onclick={() => navigateThread(currentThreadIndex + 1)}
            disabled={currentThreadIndex >= threadTotal - 1}
            class="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30"
            style="background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.25); color: #baf5ff"
            aria-label="Sub-post siguiente"
          >→</button>
        </div>
      {/if}

      <!-- Nota personal — edición inline -->
      <div class="mb-4">
        {#if editingNote}
          <div class="rounded-xl p-4" style="
            background: rgba(124,77,255,0.07);
            border: 1px solid rgba(124,77,255,0.30);
            border-left: 3px solid var(--vault-primary);
          ">
            <textarea
              bind:value={noteValue}
              rows="3"
              placeholder="Escribe tu nota…"
              class="w-full bg-transparent resize-none text-sm leading-relaxed outline-none"
              style="
                color: var(--vault-on-bg);
                font-family: var(--font-body);
                border: none;
                padding: 0;
                width: 100%;
                caret-color: var(--vault-primary);
              "
            ></textarea>
            <div class="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onclick={handleSaveNote}
                disabled={savingNote}
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
                style="
                  background: rgba(124,77,255,0.25);
                  border: 1px solid rgba(124,77,255,0.45);
                  color: #e4d6ff;
                  font-family: var(--font-display);
                "
              >{savingNote ? 'Guardando…' : 'Guardar'}</button>
              <button
                onclick={() => { editingNote = false; noteValue = post?.note ?? '' }}
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
                style="
                  background: rgba(255,255,255,0.06);
                  border: 1px solid rgba(255,255,255,0.12);
                  color: var(--vault-on-bg-muted);
                  font-family: var(--font-display);
                "
              >Cancelar</button>
              {#if post.note}
                <button
                  onclick={handleDeleteNote}
                  class="px-3 py-1 rounded-lg text-xs font-semibold ml-auto transition-all duration-200"
                  style="
                    background: rgba(239,68,68,0.08);
                    border: 1px solid rgba(239,68,68,0.22);
                    color: #fca5a5;
                    font-family: var(--font-display);
                  "
                >Eliminar nota</button>
              {/if}
            </div>
          </div>

        {:else if post.note}
          <div
            class="rounded-xl p-4 relative"
            style="
              background: rgba(124,77,255,0.07);
              border: 1px solid rgba(124,77,255,0.18);
              border-left: 3px solid var(--vault-primary);
            "
            onmouseenter={(e) => {
              const btn = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.note-edit-btn')
              if (btn) btn.style.opacity = '1'
            }}
            onmouseleave={(e) => {
              const btn = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.note-edit-btn')
              if (btn) btn.style.opacity = '0'
            }}
          >
            <p class="text-sm leading-relaxed pr-8" style="color: var(--vault-on-bg)">{post.note}</p>
            <button
              onclick={() => { editingNote = true; noteValue = post?.note ?? '' }}
              class="note-edit-btn absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-150"
              style="
                background: rgba(124,77,255,0.15);
                border: 1px solid rgba(124,77,255,0.28);
                opacity: 0;
              "
              onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.28)'}
              onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.15)'}
              aria-label="Editar nota"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c8b4ff" stroke-width="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>

        {:else}
          <button
            onclick={() => editingNote = true}
            class="w-full text-left rounded-xl px-4 py-3 transition-all duration-200"
            style="
              background: rgba(124,77,255,0.03);
              border: 1px dashed rgba(124,77,255,0.20);
              color: rgba(200,180,255,0.40);
              font-family: var(--font-display);
              font-size: 0.8rem;
            "
            onmouseenter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'rgba(124,77,255,0.07)'
              el.style.borderColor = 'rgba(124,77,255,0.35)'
              el.style.color = 'rgba(200,180,255,0.65)'
            }}
            onmouseleave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'rgba(124,77,255,0.03)'
              el.style.borderColor = 'rgba(124,77,255,0.20)'
              el.style.color = 'rgba(200,180,255,0.40)'
            }}
          >+ Añadir nota personal…</button>
        {/if}
      </div>

      <div class="rounded-xl p-4 mb-4" style="
        background: rgba(0,188,212,0.08);
        border: 1px solid rgba(0,188,212,0.24);
      ">
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-semibold uppercase" style="
            color: rgba(188,248,255,0.85);
            font-family: var(--font-display);
            letter-spacing: 0.08em;
          ">Texto extraído</p>
          <button
            onclick={refreshContent}
            disabled={refreshingContent}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
            style="
              background: rgba(0,188,212,0.14);
              border: 1px solid rgba(0,188,212,0.32);
              color: #baf5ff;
              font-family: var(--font-display);
            "
          >{refreshingContent ? 'Extrayendo...' : 'Refrescar'}</button>
        </div>
        {#if currentSubText}
          <p class="text-sm leading-relaxed" style="color: var(--vault-on-bg); opacity: 0.9">
            {currentSubText}
          </p>
        {:else}
          <p class="text-xs" style="color: var(--vault-on-bg-muted); font-style: italic">
            No se extrajo texto. Pulsa Refrescar para intentar de nuevo.
          </p>
        {/if}
      </div>

      {#if currentSubMedia.length > 0}
        <div class="mb-4">
          <div class="flex items-center justify-between gap-2 mb-2">
            <p class="text-xs font-semibold uppercase" style="
              color: var(--vault-on-bg-muted);
              font-family: var(--font-display);
              letter-spacing: 0.08em;
            ">Media del post</p>
            <button
              onclick={() => refreshMedia('manual')}
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
              style="
                background: rgba(0,188,212,0.14);
                border: 1px solid rgba(0,188,212,0.32);
                color: #baf5ff;
                font-family: var(--font-display);
              "
            >{refreshingMedia ? 'Actualizando...' : 'Actualizar media'}</button>
          </div>

          {#if mediaRefreshError}
            <p class="text-xs mb-2" style="color: #fbbf24">{mediaRefreshError}</p>
          {/if}

          {#if failedMediaCount() > 0}
            <div class="rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-2" style="
              background: rgba(239,68,68,0.08);
              border: 1px solid rgba(239,68,68,0.2);
            ">
              <p class="text-xs" style="color: #fca5a5">
                {failedMediaCount()} recurso(s) no visible(s) por bloqueo/caducidad del CDN.
              </p>
              <button
                onclick={() => showFailedMedia = !showFailedMedia}
                class="px-2 py-1 rounded-md text-xs font-semibold"
                style="
                  background: rgba(255,255,255,0.08);
                  border: 1px solid rgba(255,255,255,0.16);
                  color: var(--vault-on-bg);
                  font-family: var(--font-display);
                "
              >{showFailedMedia ? 'Ocultar fallidos' : 'Mostrar fallidos'}</button>
            </div>
          {/if}

          <div class="flex flex-col gap-3">
            {#if shouldShowCarousel()}
              <!-- Carrusel para 2+ imágenes sin vídeo -->
              {@const imgs = imageOnlyMedia()}
              <div class="relative rounded-xl overflow-hidden" style="background: rgba(0,0,0,0.4)">
                <div
                  class="flex"
                  style="transform: translateX(-{carouselImageIndex * 100}%); transition: transform 0.3s ease;"
                >
                  {#each imgs as media, i (media.id)}
                    <img
                      src={getMediaSource(media)}
                      alt="Imagen {i + 1} de {imgs.length}"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      crossorigin="anonymous"
                      class="w-full flex-shrink-0"
                      style="max-height: 380px; object-fit: contain; display: block; cursor: zoom-in;"
                      onclick={() => lightboxSrc = getMediaSource(media)}
                      onerror={() => handleMediaError(media)}
                    />
                  {/each}
                </div>

                <!-- Contador -->
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold"
                     style="background: rgba(0,0,0,0.65); color: #fff; font-family: var(--font-display); letter-spacing: 0.04em">
                  {carouselImageIndex + 1}/{imgs.length}
                </div>

                <!-- Flecha izquierda -->
                {#if carouselImageIndex > 0}
                  <button
                    onclick={() => carouselImageIndex--}
                    class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                    style="background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-size: 22px; line-height: 1;"
                    aria-label="Imagen anterior"
                  >‹</button>
                {/if}

                <!-- Flecha derecha -->
                {#if carouselImageIndex < imgs.length - 1}
                  <button
                    onclick={() => carouselImageIndex++}
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                    style="background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-size: 22px; line-height: 1;"
                    aria-label="Imagen siguiente"
                  >›</button>
                {/if}
              </div>

              <!-- Dots + acciones para imagen actual -->
              <div class="flex items-center justify-between px-1">
                <div class="flex gap-1.5 items-center">
                  {#each imgs as _, i}
                    <button
                      onclick={() => carouselImageIndex = i}
                      class="rounded-full transition-all duration-200"
                      style="
                        width: {i === carouselImageIndex ? '18px' : '6px'};
                        height: 6px;
                        background: {i === carouselImageIndex ? 'var(--vault-primary)' : 'rgba(255,255,255,0.28)'};
                      "
                      aria-label="Ir a imagen {i + 1}"
                    ></button>
                  {/each}
                </div>
                {#if imgs[carouselImageIndex]}
                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => downloadMedia(imgs[carouselImageIndex])}
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                      style="background: rgba(124,77,255,0.16); border: 1px solid rgba(124,77,255,0.35); color: #e4d6ff; font-family: var(--font-display);"
                      onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.30)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)' }}
                      onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.16)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                    >Descargar</button>
                    <button
                      onclick={() => copyMediaUrl(imgs[carouselImageIndex].id, imgs[carouselImageIndex].url)}
                      class="flex items-center gap-1 text-xs transition-all duration-150"
                      style="color: var(--vault-on-bg-muted)"
                      title="Copiar URL"
                    >
                      <span class="truncate" style="max-width: 140px">{imgs[carouselImageIndex].url}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="flex-shrink-0" style="opacity: 0.6">
                        {#if copiedUrlId === imgs[carouselImageIndex].id}
                          <polyline points="20 6 9 17 4 12"/>
                        {:else}
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        {/if}
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>
            {:else}
            {#each visibleMedia() as media (media.id)}
              <div class="rounded-xl p-2.5" style="
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.1);
              ">
                {#if failedMediaIds.has(media.id)}
                  <div class="rounded-lg px-2.5 py-2 mb-2 text-xs" style="
                    background: rgba(239,68,68,0.08);
                    border: 1px solid rgba(239,68,68,0.22);
                    color: #fca5a5;
                  ">
                    Recurso no visible en app. Puedes abrir o descargar desde la URL.
                  </div>
                {:else if media.type === 'video'}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video
                    src={getMediaSource(media)}
                    controls
                    playsinline
                    preload="metadata"
                    class="w-full rounded-lg mb-2"
                    style="background: #000; max-height: 360px;"
                    onerror={() => handleMediaError(media)}
                  ></video>
                {:else if media.type === 'video-link'}
                  {@const state = getInlineVideoState(media)}
                  <div class="rounded-xl p-3 mb-2" style="
                    background: rgba(124,77,255,0.10);
                    border: 1px solid rgba(124,77,255,0.28);
                  ">
                    {#if state.status === 'ready' && state.src}
                      <!-- svelte-ignore a11y_media_has_caption -->
                      <video
                        src={state.src}
                        controls
                        playsinline
                        preload="metadata"
                        class="w-full rounded-lg mb-3"
                        style="background: #000; max-height: 360px;"
                      ></video>
                    {:else if state.status === 'ready' && state.embedHtml}
                      <!--
                        PBL: <iframe srcdoc="..."> — inyectamos el HTML del reproductor
                        oficial de Threads directamente como string. No carga una URL
                        externa → no hay problema de X-Frame-Options ni CORS.
                        sandbox="allow-scripts allow-same-origin allow-popups":
                          - allow-scripts    → el embed.js de Threads puede ejecutarse
                          - allow-same-origin → el script puede hacer fetch a Threads API
                          - allow-popups     → el usuario puede abrir links del post
                      -->
                      <iframe
                        srcdoc={state.embedHtml}
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        class="w-full rounded-xl mb-3"
                        style="height: 520px; border: none; background: #0a0a14; border-radius: 12px; display: block;"
                        title="Vídeo embebido de Threads"
                      ></iframe>
                    {:else}
                      <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                             style="background: rgba(124,77,255,0.22)">
                          {#if state.status === 'loading'}
                            <!-- Spinner de carga -->
                            <div class="w-5 h-5 rounded-full animate-spin" style="
                              border: 2px solid rgba(200,180,255,0.2);
                              border-top-color: #c8b4ff;
                            "></div>
                          {:else}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
                                 style="color: #c8b4ff; margin-left: 2px">
                              <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                          {/if}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-semibold"
                             style="color: #e4d6ff; font-family: var(--font-display)">
                            {state.status === 'loading' ? 'Cargando vídeo…' : 'Vídeo en Threads'}
                          </p>
                          <p class="text-xs" style="color: var(--vault-on-bg-muted)">
                            {state.status === 'loading'
                              ? 'Buscando fuente reproducible…'
                              : 'Threads protege sus vídeos. Ábrelo directamente para reproducirlo.'}
                          </p>
                        </div>
                      </div>
                    {/if}

                    <div class="flex items-center gap-2 flex-wrap">
                      {#if state.status === 'loading'}
                        <span class="px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style="
                                background: rgba(124,77,255,0.10);
                                border: 1px solid rgba(124,77,255,0.22);
                                color: rgba(228,214,255,0.5);
                                font-family: var(--font-display);
                              ">Cargando…</span>
                      {:else if state.status === 'error'}
                        <button
                          onclick={() => loadInlineVideo(media)}
                          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                          style="
                            background: rgba(124,77,255,0.12);
                            border: 1px solid rgba(124,77,255,0.28);
                            color: #c8b4ff;
                            font-family: var(--font-display);
                          "
                        >Reintentar</button>
                      {/if}

                      {#if state.status !== 'loading'}
                        <button
                          onclick={() => downloadInlineVideo(media)}
                          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                          style="
                            background: rgba(124,77,255,0.16);
                            border: 1px solid rgba(124,77,255,0.35);
                            color: #e4d6ff;
                            font-family: var(--font-display);
                          "
                        >
                          {getInlineVideoDownloadState(media).status === 'downloading' ? 'Descargando...' : 'Descargar video'}
                        </button>
                      {/if}

                      <button
                        onclick={() => openInBrowser(media.url)}
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                        style="
                          background: rgba(124,77,255,0.22);
                          border: 1px solid rgba(124,77,255,0.4);
                          color: #e4d6ff;
                          font-family: var(--font-display);
                        "
                      >Ver en Threads ↗</button>
                    </div>

                    {#if getInlineVideoDownloadState(media).status === 'downloading'}
                      <div class="mt-2 w-full">
                        <div class="h-2 rounded-full overflow-hidden"
                             style="background: rgba(255,255,255,0.08); border: 1px solid rgba(124,77,255,0.25)">
                          <div
                            class="h-full transition-all duration-500"
                            style="
                              width: {getInlineVideoDownloadState(media).progress ?? 0}%;
                              background: linear-gradient(90deg, #7c4dff, #00bcd4);
                            "
                          ></div>
                        </div>
                        <p class="text-xs mt-1.5" style="color: var(--vault-on-bg-muted)">
                          {getInlineVideoDownloadState(media).detail ?? 'Procesando descarga...'}
                        </p>
                      </div>
                    {:else if getInlineVideoDownloadState(media).status === 'done'}
                      <div class="mt-2 rounded-lg px-2.5 py-2 text-xs" style="
                        background: rgba(0,188,212,0.10);
                        border: 1px solid rgba(0,188,212,0.26);
                        color: #baf5ff;
                      ">
                        Descargado: {getInlineVideoDownloadState(media).filePath}
                      </div>
                    {:else if getInlineVideoDownloadState(media).status === 'error'}
                      <div class="mt-2 rounded-lg px-2.5 py-2 text-xs" style="
                        background: rgba(239,68,68,0.10);
                        border: 1px solid rgba(239,68,68,0.25);
                        color: #fca5a5;
                      ">
                        Error: {getInlineVideoDownloadState(media).error}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <img
                    src={getMediaSource(media)}
                    alt="Media del post"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    crossorigin="anonymous"
                    class="w-full rounded-lg mb-2"
                    style="max-height: 360px; object-fit: cover; cursor: zoom-in;"
                    onclick={() => lightboxSrc = getMediaSource(media)}
                    onerror={() => handleMediaError(media)}
                  />
                {/if}

                {#if media.type !== 'video-link'}
                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => downloadMedia(media)}
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                      style="
                        background: rgba(124,77,255,0.16);
                        border: 1px solid rgba(124,77,255,0.35);
                        color: #e4d6ff;
                        font-family: var(--font-display);
                      "
                      onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.30)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)' }}
                      onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.16)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                    >Descargar</button>
                    <button
                      onclick={() => copyMediaUrl(media.id, media.url)}
                      class="flex items-center gap-1 text-xs truncate text-left transition-all duration-150"
                      style="color: var(--vault-on-bg-muted); max-width: 180px;"
                      title="Copiar URL"
                    >
                      <span class="truncate">{media.url}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="flex-shrink-0" style="opacity: 0.6">
                        {#if copiedUrlId === media.id}
                          <polyline points="20 6 9 17 4 12"/>
                        {:else}
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        {/if}
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
            {/if}
          </div>

          {#if areAllMediaFailed()}
            <p class="text-xs mt-2" style="color: var(--vault-on-bg-muted)">
              Todas las URLs fallaron. Suele pasar con links firmados caducados de Instagram/Threads.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Footer: categoría + fecha -->
      <div class="flex items-center justify-between pt-3" style="border-top: 1px solid rgba(255,255,255,0.07)">
        {#if category}
          <CategoryBadge {category} />
        {:else}
          <span></span>
        {/if}
        <span style="font-size:11px; color: var(--vault-on-bg-muted); font-family: var(--font-display)">
          {formatDate(post.savedAt)}
        </span>
      </div>
    </article>

    <!--
      PBL: "Abrir en Threads" como acción secundaria visible.
      En UX, las acciones más comunes deben ser visibles, no escondidas.
      target="_blank" + rel="noopener noreferrer" = seguridad básica
      para links externos (previene que la nueva pestaña acceda a window.opener).
    -->
    <button
      onclick={() => currentThreadUrl && openInBrowser(currentThreadUrl)}
      class="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl font-semibold transition-all duration-200"
      style="
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.11);
        color: var(--vault-on-bg);
        font-family: var(--font-display);
        font-size: 0.9rem;
        letter-spacing: 0.02em;
      "
      onmouseenter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background   = 'rgba(124,77,255,0.10)'
        el.style.borderColor  = 'rgba(124,77,255,0.32)'
        el.style.boxShadow    = '0 4px 20px rgba(124,77,255,0.15)'
      }}
      onmouseleave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background  = 'rgba(255,255,255,0.05)'
        el.style.borderColor = 'rgba(255,255,255,0.11)'
        el.style.boxShadow   = 'none'
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      Abrir en Threads
    </button>
  {/if}
</div>

<!-- Lightbox — imagen a pantalla completa dentro de la app -->
{#if lightboxSrc}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    onclick={() => lightboxSrc = null}
    class="fixed inset-0 flex items-center justify-center"
    style="
      z-index: 9999;
      background: rgba(0,0,0,0.88);
      backdrop-filter: blur(6px);
      cursor: zoom-out;
      animation: fade-up 0.15s ease;
    "
  >
    <img
      src={lightboxSrc}
      alt="Vista ampliada"
      referrerPolicy="no-referrer"
      crossorigin="anonymous"
      style="
        max-width: 92vw;
        max-height: 92vh;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7);
        cursor: default;
      "
      onclick={(e) => e.stopPropagation()}
    />
    <button
      onclick={() => lightboxSrc = null}
      class="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
      style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff;"
      aria-label="Cerrar"
    >✕</button>
  </div>
{/if}
