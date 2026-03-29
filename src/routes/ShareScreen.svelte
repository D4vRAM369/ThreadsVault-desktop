<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { t, locale } from '../lib/i18n'
  import { categories, savePost } from '../lib/stores/vault'
  import { getStorage } from '../lib/storage/index'
  import { parseThreadsAuthor, isValidThreadsUrl, cleanThreadsUrl } from '../lib/utils/url-parser'
  import { extractPostData } from '../lib/utils/post-extractor'
  import { cachePostMediaLocally } from '../lib/utils/media-cache'
  import type { Post, ThreadPost } from '../lib/types'

  let url           = $state('')
  let note          = $state('')
  let selectedCatId = $state('')
  let error         = $state('')
  let saving        = $state(false)
  let extracting    = $state(false)
  let duplicatePost = $state<Post | null>(null)
  let urlInputEl: HTMLInputElement | undefined

  // UX multi-post: casilla de verificación + URLs adicionales
  let isMultiPost = $state(false)
  let extraUrls   = $state<string[]>([''])

  // AbortController para cancelar la extracción si el componente se desmonta
  let abortController: AbortController | null = null

  onDestroy(() => {
    abortController?.abort()
  })

  function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms)
      signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(null) })
      promise
        .then((value) => { if (!signal?.aborted) resolve(value) })
        .catch(() => resolve(null))
        .finally(() => clearTimeout(timer))
    })
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = params.get('url') || params.get('text') || ''
    if (shared) url = shared
    if ($categories.length > 0) selectedCatId = $categories[0].id
    // Auto-focus URL input: Ctrl+N → cursor directo en el campo de URL
    urlInputEl?.focus()
  })

  async function handleSave(skipDuplicateCheck = false) {
    if (!isValidThreadsUrl(url)) {
      error = t('share.error_invalid_url')
      return
    }
    if (!selectedCatId) {
      error = t('share.error_no_category')
      return
    }

    const cleanUrl = cleanThreadsUrl(url.trim())

    // Detección de duplicados: comparar URL limpia contra posts existentes
    if (!skipDuplicateCheck) {
      const storage = await getStorage()
      const posts = await storage.getPosts()
      const found = posts.find((p) =>
        cleanThreadsUrl(p.url) === cleanUrl ||
        (p.canonicalUrl ? cleanThreadsUrl(p.canonicalUrl) === cleanUrl : false)
      )
      if (found) {
        duplicatePost = found
        return
      }
    }

    duplicatePost = null
    saving = true
    error  = ''

    abortController = new AbortController()
    const signal = abortController.signal

    let extracted: Awaited<ReturnType<typeof extractPostData>> | null = null
    let manualThreadPosts: ThreadPost[] | undefined
    extracting = true

    if (isMultiPost) {
      /*
        PBL: modo multi-post — el usuario especificó manualmente las URLs de todas
        las publicaciones del hilo. Extraemos en paralelo con Promise.all para no
        sumar los timeouts (máx ~12s en total en vez de 12s × N).
        extraUrls contiene las URLs de las publicaciones adicionales (post 2, 3…).
        La URL principal (post 1) ya está en `url`.
      */
      const validExtras = extraUrls
        .map(u => cleanThreadsUrl(u.trim()))
        .filter(u => isValidThreadsUrl(u))
      /*
        PBL: skipThreadDetection=true en las URLs extra — el usuario ya especificó
        todas las URLs del hilo, así que detectar sub-posts dentro de cada URL
        extra es redundante y añade ~8s de latencia por URL.
        Con el skip: cada extra tarda ~8s (4 fetches paralelos) en vez de ~16s.
      */
      const [mainResult, ...extraResults] = await Promise.all([
        withTimeout(extractPostData(url.trim()), 20000, signal),
        ...validExtras.map(u => withTimeout(extractPostData(u, { skipThreadDetection: true }), 20000, signal)),
      ])
      extracted = mainResult
      const threadPostList: ThreadPost[] = extraResults
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map(r => ({
          id: r.canonicalUrl.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? crypto.randomUUID(),
          url:   r.canonicalUrl,
          text:  r.text,
          media: r.media?.length ? r.media : undefined,
        }))
      if (threadPostList.length > 0) manualThreadPosts = threadPostList
    } else {
      // PBL: 20s — 4 fetches en paralelo (~8s) + thread detection (~8s) = ~16s máx
      extracted = await withTimeout(extractPostData(url.trim()), 20000, signal)
    }

    extracting = false
    abortController = null

    // Si el componente fue desmontado durante la extracción, no seguir
    if (signal.aborted) {
      saving = false
      return
    }

    const author = extracted?.author || parseThreadsAuthor(url.trim()) || '@desconocido'
    const post: Post = {
      id: crypto.randomUUID(),
      url: extracted?.canonicalUrl ?? cleanUrl,
      author,
      note: note.trim(),
      categoryId: selectedCatId,
      savedAt: Date.now(),
      previewTitle: extracted?.title,
      previewImage: extracted?.previewImage,
      previewVideo: extracted?.previewVideo,
      extractedText: extracted?.text,
      canonicalUrl: extracted?.canonicalUrl ?? cleanUrl,
      media: extracted?.media ?? [],
      // manualThreadPosts tiene prioridad — el usuario definió explícitamente las URLs
      threadPosts: manualThreadPosts ?? extracted?.threadPosts,
    }

    await savePost(post)
    void (async () => {
      try {
        const cachedPost = await cachePostMediaLocally(post, {
          maxItems: 4,
          maxVideoBytes: 120 * 1024 * 1024,
        })
        if (cachedPost === post) return
        const storage = await getStorage()
        await storage.savePost(cachedPost)
      } catch (cacheError) {
        console.warn('No se pudo cachear media en background', cacheError)
      }
    })()

    window.location.hash = '#/'
  }
</script>

<div class="max-w-lg mx-auto px-4 py-6 animate-fade-up">

  <!-- Header -->
  <div class="flex items-center gap-3 mb-8">
    <button
      onclick={() => window.location.hash = '#/'}
      class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
      style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
      aria-label={t('common.back')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--vault-on-bg)">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--vault-on-bg)">
        {t('share.title')}
      </h1>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">{t('share.subtitle')}</p>
    </div>
  </div>

  <!--
    PBL: Card glassmorphism agrupa todos los inputs visualmente.
    Un solo contenedor hace que el formulario parezca más simple.
  -->
  <div class="glass rounded-2xl p-5 flex flex-col gap-5">

    <!-- URL -->
    <div>
      <label class="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
             style="color: var(--vault-on-bg-muted); font-family: var(--font-display)"
             for="url-input">{t('share.url_label')}</label>
      <input
        id="url-input"
        type="url"
        bind:this={urlInputEl}
        bind:value={url}
        onpaste={(e) => {
          e.preventDefault()
          const pasted = e.clipboardData?.getData('text') ?? ''
          url = cleanThreadsUrl(pasted.trim())
        }}
        onkeydown={(e) => {
          // Enter en el campo URL dispara el guardado (flujo Ctrl+N → Ctrl+V → Enter)
          if (e.key === 'Enter' && !saving) {
            e.preventDefault()
            void handleSave()
          }
        }}
        placeholder="https://www.threads.net/@usuario/post/..."
        class="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
        style="
          background: rgba(255,255,255,0.04);
          color: var(--vault-on-bg);
          border: 1px solid var(--vault-border);
          font-family: var(--font-body);
        "
        onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
        onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      />
    </div>

    <!--
      PBL: UX multi-post — si el usuario marca la casilla, aparecen campos para
      las URLs de las publicaciones adicionales del hilo (post 2, 3…).
      Todas se extraen en paralelo y se guardan como un único post con threadPosts[].
      Así el usuario no necesita Ctrl+N 4 veces + fusionar manualmente.
    -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer select-none" for="multi-post-check">
        <input
          type="checkbox"
          id="multi-post-check"
          bind:checked={isMultiPost}
          class="mt-0.5 w-4 h-4 cursor-pointer flex-shrink-0"
          style="accent-color: var(--vault-primary)"
          onchange={() => { if (isMultiPost) extraUrls = [''] }}
        />
        <span>
          <span class="text-sm font-medium" style="color: var(--vault-on-bg)">
            {t('share.multipost_label')}
          </span>
          <span class="block text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
            {t('share.multipost_hint')}
          </span>
        </span>
      </label>

      {#if isMultiPost}
        <div class="flex flex-col gap-2 mt-3">
          {#each extraUrls as _, i}
            <div class="flex items-center gap-2">
              <input
                type="url"
                value={extraUrls[i]}
                placeholder="URL del post {i + 2}…"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style="
                  background: rgba(255,255,255,0.04);
                  color: var(--vault-on-bg);
                  border: 1px solid var(--vault-border);
                  font-family: var(--font-body);
                "
                onpaste={(e) => {
                  e.preventDefault()
                  const pasted = e.clipboardData?.getData('text') ?? ''
                  extraUrls[i] = cleanThreadsUrl(pasted.trim())
                }}
                oninput={(e) => { extraUrls[i] = e.currentTarget.value }}
                onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
                onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
              />
              {#if extraUrls.length > 1}
                <button
                  onclick={() => { extraUrls = extraUrls.filter((_, idx) => idx !== i) }}
                  class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200"
                  style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 1.1rem; line-height:1"
                  aria-label={t('share.remove_url')}
                >×</button>
              {/if}
            </div>
          {/each}
          <button
            onclick={() => { extraUrls = [...extraUrls, ''] }}
            class="self-start px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            style="background: rgba(124,77,255,0.12); border: 1px solid rgba(124,77,255,0.25); color: var(--vault-primary)"
          >{t('share.add_url')}</button>
        </div>
      {/if}
    </div>

    <!-- Nota -->
    <div>
      <label class="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
             style="color: var(--vault-on-bg-muted); font-family: var(--font-display)"
             for="note-input">
        {t('share.note_label')} <span style="font-weight:400; text-transform:none; letter-spacing:0; color: var(--vault-on-bg-muted)">{t('share.note_optional')}</span>
      </label>
      <textarea
        id="note-input"
        bind:value={note}
        rows="3"
        placeholder={t('share.note_placeholder')}
        class="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all duration-200"
        style="
          background: rgba(255,255,255,0.04);
          color: var(--vault-on-bg);
          border: 1px solid var(--vault-border);
          font-family: var(--font-body);
          line-height: 1.6;
        "
        onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
        onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      ></textarea>
    </div>

    <!-- Categoría -->
    <div>
      <p class="text-xs font-semibold mb-2 uppercase tracking-widest"
         style="color: var(--vault-on-bg-muted); font-family: var(--font-display)">{t('share.category_label')}</p>
      <div class="flex flex-wrap gap-2">
        {#each $categories as cat}
          <button
            class="px-3.5 py-1.5 rounded-full text-sm font-medium text-white transition-all duration-200"
            style="
              background: {cat.color};
              opacity: {selectedCatId === cat.id ? '1' : '0.35'};
              box-shadow: {selectedCatId === cat.id ? `0 0 16px ${cat.color}50` : 'none'};
              transform: {selectedCatId === cat.id ? 'scale(1.05)' : 'scale(1)'};
            "
            onclick={() => selectedCatId = cat.id}
          >{cat.name}</button>
        {/each}
      </div>
    </div>

    <!-- Aviso de duplicado -->
    {#if duplicatePost}
      <div class="flex flex-col gap-2 px-3 py-3 rounded-xl text-sm"
           style="background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.25)">
        <p style="color: #fde68a; font-weight: 600">{t('share.duplicate_title')}</p>
        <p style="color: var(--vault-on-bg-muted)">
          {t('share.duplicate_saved_by')} <strong style="color: var(--vault-on-bg)">{duplicatePost.author}</strong>
          — {new Date(duplicatePost.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div class="flex gap-2 mt-1">
          <button
            onclick={() => handleSave(true)}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            style="background: rgba(251,191,36,0.15); color: #fde68a; border: 1px solid rgba(251,191,36,0.3)"
          >{t('share.save_anyway')}</button>
          <button
            onclick={() => { const id = duplicatePost!.id; duplicatePost = null; window.location.hash = `#/post/${id}` }}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
          >{t('share.view_existing')}</button>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
           style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5">
        ⚠ {error}
      </div>
    {/if}

    <!--
      PBL: Gradiente animado con background-position.
      background-size:200% = el gradiente es 2x más ancho que el botón.
      En hover, background-position:100% desplaza el gradiente → "fluye".
      Solo CSS, cero JS extra.
    -->
    <button
      onclick={() => handleSave()}
      disabled={saving}
      class="w-full py-3.5 rounded-xl font-bold text-white transition-all duration-300 disabled:opacity-50"
      style="
        background: linear-gradient(135deg, var(--vault-primary) 0%, var(--vault-secondary) 50%, var(--vault-primary) 100%);
        background-size: 200% 100%;
        background-position: 0% 0%;
        box-shadow: 0 4px 20px var(--vault-primary-glow);
        font-family: var(--font-display);
        font-size: 0.95rem;
        letter-spacing: 0.02em;
      "
      onmouseenter={(e) => {
        if (!saving) {
          const el = e.currentTarget as HTMLElement
          el.style.backgroundPosition = '100% 0%'
          el.style.boxShadow = '0 6px 28px rgba(124,77,255,0.5)'
        }
      }}
      onmouseleave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.backgroundPosition = '0% 0%'
        el.style.boxShadow = '0 4px 20px var(--vault-primary-glow)'
      }}
    >
      {saving
        ? (extracting
            ? (isMultiPost ? t('share.extracting_multi') : t('share.extracting'))
            : t('share.saving'))
        : t('share.save_btn')}
    </button>
  </div>
</div>
