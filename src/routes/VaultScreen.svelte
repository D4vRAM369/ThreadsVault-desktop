<script lang="ts">
  import { onMount } from 'svelte'
  import { posts, categories, appState, filteredPosts, hashtagStats,
           searchQuery, activeCategory, activeHashtag, deletePost, refreshStalePostMedia, loadVault } from '../lib/stores/vault'
  import PostCard from '../components/PostCard.svelte'
  import EmptyState from '../components/EmptyState.svelte'
  import LoadingSpinner from '../components/LoadingSpinner.svelte'

  function getCategoryById(id: string) {
    return $categories.find(c => c.id === id)
  }

  function getCategoryLabel(name: string): string {
    const value = name?.trim()
    return value ? value : 'Sin nombre'
  }

  function getCategoryPostCount(categoryId: string): number {
    return $posts.filter((p) => p.categoryId === categoryId).length
  }

  function toggleCategory(id: string | null) {
    if ($activeCategory === id) {
      activeCategory.set(null)
      return
    }
    activeCategory.set(id)
  }

  function toggleHashtag(tag: string) {
    if ($activeHashtag === tag) {
      activeHashtag.set(null)
      return
    }
    activeHashtag.set(tag)
  }

  function handleHorizontalWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  function horizontalDrag(node: HTMLElement) {
    let isDown = false
    let startX = 0
    let startLeft = 0
    let moved = false

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      isDown = true
      moved = false
      startX = e.clientX
      startLeft = node.scrollLeft
      node.style.cursor = 'grabbing'
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return
      const delta = e.clientX - startX
      if (Math.abs(delta) > 4) moved = true
      node.scrollLeft = startLeft - delta
    }

    function onPointerUp() {
      isDown = false
      node.style.cursor = 'grab'
    }

    function onClickCapture(e: MouseEvent) {
      if (!moved) return
      e.preventDefault()
      e.stopPropagation()
      moved = false
    }

    node.style.cursor = 'grab'
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerup', onPointerUp)
    node.addEventListener('pointerleave', onPointerUp)
    node.addEventListener('click', onClickCapture, true)

    return {
      destroy() {
        node.removeEventListener('pointerdown', onPointerDown)
        node.removeEventListener('pointermove', onPointerMove)
        node.removeEventListener('pointerup', onPointerUp)
        node.removeEventListener('pointerleave', onPointerUp)
        node.removeEventListener('click', onClickCapture, true)
      },
    }
  }

  /*
    PBL: Svelte Actions — funciones reutilizables que se "enganchan"
    al ciclo de vida de un nodo DOM con la directiva use:action.
    Aquí usamos IntersectionObserver para animar cards solo cuando
    entran en el viewport — más eficiente que CSS animation-delay.

    IntersectionObserver vs scroll listener:
    ✓ Corre en hilo separado del browser (no bloquea UI)
    ✓ Solo dispara callback cuando hay cambio real de visibilidad
    ✓ threshold: 0.1 = activa cuando el 10% del elemento es visible
  */
  function scrollReveal(node: HTMLElement, delay: number = 0) {
    node.style.opacity    = '0'
    node.style.transform  = 'translateY(14px)'
    node.style.transition = [
      `opacity 0.42s ${delay}s cubic-bezier(0.16,1,0.3,1)`,
      `transform 0.42s ${delay}s cubic-bezier(0.16,1,0.3,1)`,
    ].join(', ')

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.style.opacity   = '1'
          node.style.transform = 'translateY(0)'
          observer.unobserve(node) // Animar solo una vez al entrar
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(node)

    // PBL: destroy() es el "cleanup" de la action — evita memory leaks
    // cuando Svelte desmonta el componente (filtro, navegación, etc.)
    return { destroy() { observer.disconnect() } }
  }

  onMount(() => {
    void loadVault()
    void refreshStalePostMedia()
  })
</script>

<div class="w-full max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 pb-24">

  <!--
    PBL: -mx-4 cancela el px-4 del padre → header full-width en mobile.
    backdrop-filter:blur(28px) crea el efecto cristal esmerilado.
    El fondo rgba semi-transparente deja pasar algo del color de los blobs.
  -->
  <header class="sticky top-0 z-20 -mx-5 sm:-mx-6 lg:-mx-10 px-5 sm:px-6 lg:px-10 pt-5 sm:pt-6 pb-4" style="
    background: rgba(8, 8, 16, 0.82);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  ">
    <!-- Logo + acciones -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2.5">
        <div class="shrink-0" style="
          width: 34px; height: 34px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 3px 12px rgba(0,0,0,0.5);
        ">
          <img
            src="/icon-app.png"
            alt="ThreadsVault"
            style="width:100%; height:100%; object-fit:cover; display:block;"
          />
        </div>
        <h1 style="
          font-family: var(--font-brand);
          font-size: 1.15rem;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.01em;
          line-height: 1;
        ">ThreadsVault</h1>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200"
          style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
          onclick={() => window.location.hash = '#/settings'}
          aria-label="Ajustes"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--vault-on-bg-muted)">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <button
          class="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200"
          style="
            background: linear-gradient(135deg, var(--vault-primary), #9c27b0);
            box-shadow: 0 4px 14px var(--vault-primary-glow);
            font-family: var(--font-display);
          "
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 22px rgba(124,77,255,0.55)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px var(--vault-primary-glow)'}
          onclick={() => window.location.hash = '#/share'}
        >
          <span style="font-size:1.1rem; line-height:1; margin-top:-1px">+</span>
          <span>Añadir</span>
        </button>
      </div>
    </div>

    <!--
      PBL: Dashboard de hashtags.
      Muestra top tags extraídos de notas + texto extraído.
      click = filtra por hashtag; segundo click = limpia filtro.
    -->
    <div class="rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-3" style="
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 4px 16px rgba(0,0,0,0.22);
    ">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold" style="
          color: #7ae9ff;
          font-family: var(--font-display);
          letter-spacing: 0.03em;
        "># Hashtags guardados</p>
        <span class="text-xs px-2 py-0.5 rounded-full" style="
          background: rgba(124,77,255,0.2);
          border: 1px solid rgba(124,77,255,0.35);
          color: #d8c8ff;
          font-family: var(--font-display);
        ">{$hashtagStats.length}</span>
      </div>

      {#if $hashtagStats.length === 0}
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          Aún no hay hashtags. Añade `#tags` en tus notas o guarda posts con texto extraído.
        </p>
      {:else}
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" onwheel={handleHorizontalWheel} use:horizontalDrag>
          {#each $hashtagStats.slice(0, 24) as item (item.tag)}
            <button
              class="shrink-0 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200"
              style="
                font-family: var(--font-display);
                line-height: 1.2;
                {$activeHashtag === item.tag
                  ? 'background: rgba(0,188,212,0.22); color: #d6f9ff; border: 1px solid rgba(0,188,212,0.45); box-shadow: 0 0 14px rgba(0,188,212,0.2);'
                  : 'background: rgba(0,188,212,0.09); color: #8befff; border: 1px solid rgba(0,188,212,0.22);'}
              "
              onclick={() => toggleHashtag(item.tag)}
            >
              {item.tag}
              <span style="opacity:0.8"> {item.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Campo de búsqueda principal -->
    <div class="relative mb-3">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
           width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="rgba(232,232,240,0.3)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        placeholder="Buscar posts, autores, notas…"
        bind:value={$searchQuery}
        class="w-full rounded-2xl text-sm outline-none transition-all duration-200"
        style="
          background: var(--vault-surface);
          color: var(--vault-on-bg);
          border: 1px solid var(--vault-border);
          font-family: var(--font-body);
          padding: 12px 18px 12px 44px;
        "
        onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
        onblur={(e)  => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      />
    </div>

    <div class="flex items-center justify-between mb-1.5">
      <p class="text-xs font-semibold" style="
        color: #64deff;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
      ">Filtros rápidos</p>
      <span class="text-xs px-2 py-0.5 rounded-full" style="
        background: rgba(124,77,255,0.25);
        border: 1px solid rgba(124,77,255,0.4);
        color: #dfd3ff;
        font-family: var(--font-display);
      ">{$filteredPosts.length}</span>
    </div>

    {#if $categories.length > 0}
      <div class="flex gap-2 overflow-x-auto no-scrollbar" style="padding-bottom: 2px" onwheel={handleHorizontalWheel} use:horizontalDrag>
        <button
          class="shrink-0 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200"
          style="
            padding-top: 5px; padding-bottom: 5px;
            line-height: 1.2;
            font-family: var(--font-display);
            {$activeCategory === null
              ? 'background: linear-gradient(135deg, #7C4DFF, #8d5dff); color: white; box-shadow: 0 0 14px var(--vault-primary-glow);'
              : 'background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border);'}
          "
          onclick={() => toggleCategory(null)}
        >Todos</button>

        {#each $categories as cat}
          <button
            class="shrink-0 px-3 rounded-full text-xs font-semibold text-white whitespace-nowrap transition-all duration-200"
            style="
              padding-top: 5px; padding-bottom: 5px;
              line-height: 1.2;
              font-family: var(--font-display);
              background: {cat.color};
              opacity: {$activeCategory === cat.id ? '1' : '0.42'};
              box-shadow: {$activeCategory === cat.id ? `0 0 14px ${cat.color}55` : 'none'};
            "
            onclick={() => toggleCategory(cat.id)}
          >{cat.emoji ?? '📌'} {getCategoryLabel(cat.name)} ({getCategoryPostCount(cat.id)})</button>
        {/each}
      </div>
    {/if}
  </header>

  <!-- Contenido principal -->
  <div class="pt-5 sm:pt-6">
    {#if $appState === 'loading'}
      <LoadingSpinner />

    {:else if $appState === 'error'}
      <div class="flex flex-col items-center justify-center py-20 gap-3 animate-fade-up">
        <div class="text-4xl">⚠️</div>
        <p style="color: var(--vault-on-bg-muted)">Error cargando la bóveda</p>
      </div>

    {:else if $filteredPosts.length === 0}
      <!--
        PBL: Dos estados vacíos distintos para el usuario:
        1. Bóveda vacía de verdad → EmptyState con onboarding CTA
        2. Filtro/búsqueda sin resultados → mensaje + botón limpiar
        Confundir ambos sería un error de UX grave.
      -->
      {#if $posts.length === 0}
        <EmptyState />
      {:else}
        <div class="flex flex-col items-center justify-center py-20 gap-4 animate-fade-up">
          <div style="font-size: 2.2rem; opacity: 0.3; filter: grayscale(1)">🔍</div>
          <div class="text-center">
            <p class="font-semibold mb-1" style="font-family: var(--font-display); color: var(--vault-on-bg)">
              Sin resultados
            </p>
            <p class="text-sm" style="color: var(--vault-on-bg-muted)">
              Prueba con otros términos o categoría
            </p>
          </div>
          <button
            class="px-4 py-1.5 rounded-full text-sm transition-all duration-200"
            style="border: 1px solid rgba(124,77,255,0.35); color: var(--vault-primary); font-family: var(--font-display)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.08)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            onclick={() => { searchQuery.set(''); activeCategory.set(null); activeHashtag.set(null) }}
          >Limpiar filtros</button>
        </div>
      {/if}

    {:else}
      <div class="mb-3">
        <p class="text-xs" style="color: var(--vault-on-bg-muted); font-family: var(--font-display)">
          {$filteredPosts.length} post{$filteredPosts.length !== 1 ? 's' : ''}
        </p>
      </div>

      <!--
        PBL: use:scrollReveal={i * 0.065} aplica la action a cada wrapper.
        El parámetro es el delay en segundos — crece 65ms por item.
        Cuando Svelte actualiza el {#each} (al filtrar), la action
        se re-ejecuta automáticamente en los nuevos nodos DOM.
      -->
      {#each $filteredPosts as post, i (post.id)}
        <div use:scrollReveal={i * 0.065}>
          <PostCard
            {post}
            index={i}
            category={getCategoryById(post.categoryId)}
            onDelete={deletePost}
          />
        </div>
      {/each}
    {/if}
  </div>
</div>
