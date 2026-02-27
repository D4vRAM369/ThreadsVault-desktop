<script lang="ts">
  import { onMount } from 'svelte'
  import { categories, savePost } from '../lib/stores/vault'
  import { parseThreadsAuthor, isValidThreadsUrl } from '../lib/utils/url-parser'
  import type { Post } from '../lib/types'

  let url           = $state('')
  let note          = $state('')
  let selectedCatId = $state('')
  let error         = $state('')
  let saving        = $state(false)

  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = params.get('url') || params.get('text') || ''
    if (shared) url = shared
    if ($categories.length > 0) selectedCatId = $categories[0].id
  })

  async function handleSave() {
    if (!isValidThreadsUrl(url)) {
      error = 'Introduce una URL válida de Threads (threads.net o threads.com)'
      return
    }
    if (!selectedCatId) {
      error = 'Selecciona una categoría'
      return
    }
    saving = true
    error  = ''
    const post: Post = {
      id:         crypto.randomUUID(),
      url:        url.trim(),
      author:     parseThreadsAuthor(url),
      note:       note.trim(),
      categoryId: selectedCatId,
      savedAt:    Date.now(),
    }
    await savePost(post)
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
      aria-label="Volver"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--vault-on-bg)">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--vault-on-bg)">
        Guardar post
      </h1>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">Local · Sin cloud · Sin tracking</p>
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
             for="url-input">URL de Threads</label>
      <input
        id="url-input"
        type="url"
        bind:value={url}
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

    <!-- Nota -->
    <div>
      <label class="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
             style="color: var(--vault-on-bg-muted); font-family: var(--font-display)"
             for="note-input">
        Nota personal <span style="font-weight:400; text-transform:none; letter-spacing:0; color: var(--vault-on-bg-muted)">(opcional)</span>
      </label>
      <textarea
        id="note-input"
        bind:value={note}
        rows="3"
        placeholder="¿Por qué guardas este post? ¿Qué te aportó?"
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
         style="color: var(--vault-on-bg-muted); font-family: var(--font-display)">Categoría</p>
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
      onclick={handleSave}
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
      {saving ? '⏳ Guardando...' : '🔒 Guardar en bóveda'}
    </button>
  </div>
</div>
