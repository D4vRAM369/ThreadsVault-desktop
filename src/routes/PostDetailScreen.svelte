<script lang="ts">
  import { onMount } from 'svelte'
  import { categories, deletePost } from '../lib/stores/vault'
  import { getStorage } from '../lib/storage/index'
  import CategoryBadge from '../components/CategoryBadge.svelte'
  import { cleanThreadsUrl, getPostShortId } from '../lib/utils/url-parser'
  import { extractPostData } from '../lib/utils/post-extractor'
  import { cachePostMediaLocally } from '../lib/utils/media-cache'
  import type { Post, PostMedia } from '../lib/types'

  let { postId }: { postId: string } = $props()

  let post          = $state<Post | null>(null)
  let loading       = $state(true)
  let confirmDelete = $state(false)
  let refreshingMedia = $state(false)
  let mediaRefreshError = $state('')
  let failedMediaIds = $state<Set<string>>(new Set())
  let mediaSourceIndex = $state<Record<string, number>>({})
  let showFailedMedia = $state(false)
  let refreshedMediaOnce = $state(false)
  let category      = $derived($categories.find(c => c.id === post?.categoryId))

  onMount(async () => {
    const storage = await getStorage()
    post    = await storage.getPost(postId)
    loading = false
  })

  async function handleDelete() {
    if (!post) return
    await deletePost(post.id)
    window.location.hash = '#/'
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

  function downloadMedia(media: PostMedia) {
    const a = document.createElement('a')
    a.href = getMediaSource(media)
    a.download = fileNameFromUrl(media.url)
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
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

  function markMediaFailed(media: PostMedia) {
    if (failedMediaIds.has(media.id)) return
    const next = new Set(failedMediaIds)
    next.add(media.id)
    failedMediaIds = next
    if (!refreshedMediaOnce) {
      void refreshMedia('auto')
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
    return Boolean(post?.media?.some((media) => media.type === 'video'))
  }

  function getMediaSource(media: PostMedia): string {
    const candidates = getMediaCandidates(media)
    const index = getCurrentSourceIndex(media)
    return candidates[Math.min(index, Math.max(candidates.length - 1, 0))] ?? media.url
  }

  function areAllMediaFailed(): boolean {
    if (!post?.media?.length) return false
    return post.media.every((media) => failedMediaIds.has(media.id))
  }

  function failedMediaCount(): number {
    return failedMediaIds.size
  }

  function visibleMedia(): PostMedia[] {
    if (!post?.media?.length) return []
    if (showFailedMedia) return post.media
    return post.media.filter((media) => !failedMediaIds.has(media.id))
  }

  async function refreshMedia(mode: 'auto' | 'manual' = 'manual') {
    if (!post || refreshingMedia) return
    refreshingMedia = true
    mediaRefreshError = ''

    try {
      const extracted = await extractPostData(post.canonicalUrl ?? post.url)
      const merged: Post = {
        ...post,
        url: extracted.canonicalUrl || post.url,
        canonicalUrl: extracted.canonicalUrl || post.canonicalUrl || post.url,
        author: post.author || extracted.author || '@desconocido',
        previewTitle: post.previewTitle ?? extracted.title,
        previewImage: extracted.previewImage ?? post.previewImage,
        previewVideo: extracted.previewVideo ?? post.previewVideo,
        extractedText: post.extractedText ?? extracted.text,
        media: extracted.media?.length ? extracted.media : (post.media ?? []),
      }

      const withCachedMedia = await cachePostMediaLocally(merged, { maxItems: 12 })

      const storage = await getStorage()
      await storage.savePost(withCachedMedia)
      post = withCachedMedia
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
        href={cleanThreadsUrl(post.url)}
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
        <span class="truncate">post/{getPostShortId(post.url)}</span>
      </a>

      <!-- Nota personal con estilo "cita" -->
      {#if post.note}
        <div class="rounded-xl p-4 mb-4" style="
          background: rgba(124,77,255,0.07);
          border: 1px solid rgba(124,77,255,0.18);
          border-left: 3px solid var(--vault-primary);
        ">
          <p class="text-sm leading-relaxed" style="color: var(--vault-on-bg)">{post.note}</p>
        </div>
      {/if}

      {#if post.extractedText}
        <div class="rounded-xl p-4 mb-4" style="
          background: rgba(0,188,212,0.08);
          border: 1px solid rgba(0,188,212,0.24);
        ">
          <p class="text-xs font-semibold uppercase mb-1.5" style="
            color: rgba(188,248,255,0.85);
            font-family: var(--font-display);
            letter-spacing: 0.08em;
          ">Texto extraido</p>
          <p class="text-sm leading-relaxed" style="color: var(--vault-on-bg); opacity: 0.9">
            {post.extractedText}
          </p>
        </div>
      {/if}

      {#if post.media?.length}
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

          {#if !hasVideoMedia()}
            <p class="text-xs mb-2" style="color: var(--vault-on-bg-muted)">
              Este post no incluye video detectado. El reproductor se muestra solo cuando hay URL de video.
            </p>
          {/if}

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
                {:else}
                  <img
                    src={getMediaSource(media)}
                    alt="Media del post"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    crossorigin="anonymous"
                    class="w-full rounded-lg mb-2"
                    style="max-height: 360px; object-fit: cover;"
                    onerror={() => handleMediaError(media)}
                  />
                {/if}

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
                  >Descargar</button>
                  <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs truncate"
                    style="color: var(--vault-on-bg-muted)"
                  >{media.url}</a>
                </div>
              </div>
            {/each}
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
    <a
      href={cleanThreadsUrl(post.url)}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl font-semibold transition-all duration-200"
      style="
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.11);
        color: var(--vault-on-bg);
        font-family: var(--font-display);
        font-size: 0.9rem;
        text-decoration: none;
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
    </a>
  {/if}
</div>
