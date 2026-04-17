<script lang="ts">
  import { onMount } from 'svelte'
  import { t, locale } from '../lib/i18n'
  import { posts, categories, appState, filteredPosts, hashtagStats,
           searchQuery, activeCategory, activeHashtag, deletePost, refreshStalePostMedia, loadVault, reorderCategories,
           mediaRefreshState, mediaRefreshResult,
           mergePostsIntoThread, movePostsToCategory, bulkDeletePosts, activeDataSpace, setActiveDataSpaceAction } from '../lib/stores/vault'
  import type { DataSpace } from '../lib/storage/index'
  import type { Category } from '../lib/types'
  $locale // reactive subscription
  import PostCard from '../components/PostCard.svelte'
  import EmptyState from '../components/EmptyState.svelte'
  import LoadingSpinner from '../components/LoadingSpinner.svelte'

  function getCategoryById(id: string) {
    return $categories.find(c => c.id === id)
  }

  function getDataSpaceLabel(space: DataSpace): string {
    return space === 'android' ? t('vault.db_android') : t('vault.db_pc')
  }

  async function switchDataSpace(space: DataSpace) {
    if ($activeDataSpace === space) return
    await setActiveDataSpaceAction(space)
  }

  function getCategoryLabel(name: string): string {
    const value = name?.trim()
    return value ? value : t('vault.no_category_name')
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

  function getMaxHashtagCount(): number {
    if ($hashtagStats.length === 0) return 1
    return Math.max(...$hashtagStats.map((item) => item.count), 1)
  }

  let chipOrder = $state<Category[]>([])
  let draggingCategoryId = $state<string | null>(null)
  let categoryOrderDirty = $state(false)
  let suppressCategoryClick = $state(false)

  $effect(() => {
    if (!draggingCategoryId) {
      chipOrder = [...$categories]
      categoryOrderDirty = false
    }
  })

  function onCategoryDragStart(e: DragEvent, id: string) {
    draggingCategoryId = id
    categoryOrderDirty = false
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    }
  }

  function onCategoryDragOver(e: DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggingCategoryId || draggingCategoryId === targetId) return

    const from = chipOrder.findIndex((cat) => cat.id === draggingCategoryId)
    const to = chipOrder.findIndex((cat) => cat.id === targetId)
    if (from === -1 || to === -1) return

    const next = [...chipOrder]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    chipOrder = next
    categoryOrderDirty = true
  }

  async function onCategoryDrop(e: DragEvent) {
    e.preventDefault()
    if (!draggingCategoryId) return
    if (categoryOrderDirty) {
      await reorderCategories(chipOrder)
      suppressCategoryClick = true
      setTimeout(() => { suppressCategoryClick = false }, 120)
    }
    draggingCategoryId = null
    categoryOrderDirty = false
  }

  async function onCategoryDragEnd() {
    if (draggingCategoryId && categoryOrderDirty) {
      await reorderCategories(chipOrder)
      suppressCategoryClick = true
      setTimeout(() => { suppressCategoryClick = false }, 120)
    }
    draggingCategoryId = null
    categoryOrderDirty = false
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

  function getRefreshToastMsg(
    state: 'idle' | 'refreshing' | 'done' | 'error',
    result: { updated: number; failed: number }
  ): string {
    if (state === 'error') return '⚠ Error al refrescar medios'
    if (state !== 'done') return ''
    const { updated, failed } = result
    if (updated === 0 && failed === 0) return '✓ Medios al día'
    if (failed === 0) return `✓ ${updated} ${updated === 1 ? 'post actualizado' : 'posts actualizados'}`
    if (updated === 0) return `⚠ ${failed} ${failed === 1 ? 'post no pudo actualizarse' : 'posts no pudieron actualizarse'}`
    return `✓ ${updated} actualizados · ${failed} fallaron`
  }

  let refreshToastMsg = $derived(getRefreshToastMsg($mediaRefreshState, $mediaRefreshResult))

  // ── Bulk selection ────────────────────────────────────────
  let selectionMode      = $state(false)
  let selectedPostIds    = $state(new Set<string>())
  let showCategoryPicker = $state(false)
  let bulkActionState    = $state<'idle' | 'working'>('idle')
  let scrolledDown       = $state(false)

  function toggleSelectionMode() {
    selectionMode = !selectionMode
    if (!selectionMode) {
      selectedPostIds    = new Set()
      showCategoryPicker = false
    }
  }

  function toggleSelectPost(id: string) {
    const next = new Set(selectedPostIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedPostIds = next
  }

  async function handleBulkMove(categoryId: string) {
    if (bulkActionState === 'working') return
    bulkActionState = 'working'
    try {
      await movePostsToCategory(Array.from(selectedPostIds), categoryId)
      toggleSelectionMode()
    } finally {
      bulkActionState = 'idle'
    }
  }

  async function handleBulkMerge() {
    if (bulkActionState === 'working' || selectedPostIds.size < 2) return
    bulkActionState = 'working'
    try {
      await mergePostsIntoThread(Array.from(selectedPostIds))
      toggleSelectionMode()
    } finally {
      bulkActionState = 'idle'
    }
  }

  async function handleBulkDelete() {
    if (bulkActionState === 'working') return
    bulkActionState = 'working'
    try {
      await bulkDeletePosts(Array.from(selectedPostIds))
      toggleSelectionMode()
    } finally {
      bulkActionState = 'idle'
    }
  }

  let searchInput: HTMLInputElement

  function focusSearch() {
    searchInput?.focus()
    searchInput?.select()
  }

  onMount(() => {
    void loadVault()
    void refreshStalePostMedia()

    const onFocusSearch = () => focusSearch()

    function onKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // / -> focus buscador
      if (e.key === '/') {
        e.preventDefault()
        focusSearch()
      }

      // Ctrl+N / Cmd+N -> nuevo post (abre ShareScreen con cursor en URL)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        window.location.hash = '#/share'
      }
    }

    /*
      PBL: Por qué el panel rebotaba incluso con histéresis.

      La animación grid-template-rows cambia la altura del <header sticky>.
      Chrome tiene "scroll anchoring": cuando un elemento sobre el viewport
      cambia de tamaño, el browser ajusta window.scrollY automáticamente
      para que el contenido que el usuario está viendo no salte de posición.
      Ese ajuste automático de scrollY dispara nuestro onScroll, que puede
      volver a cambiar scrolledDown, iniciando un bucle de oscillación.

      Fix en dos capas:
      1. overflow-anchor: none  en el div colapsable → ese elemento no
         se usa como ancla del scroll anchoring (CSS, sin JS).
      2. suppressScroll: tras cada cambio de estado, ignoramos eventos de
         scroll durante 380ms (un poco más que la animación de 320ms).
         Así el ajuste automático de Chrome no puede revertir el estado.
    */
    let ticking = false
    let suppressScroll = false
    function onScroll() {
      if (ticking || suppressScroll) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        if (!scrolledDown && y > 90) {
          scrolledDown = true
          suppressScroll = true
          setTimeout(() => { suppressScroll = false }, 380)
        } else if (scrolledDown && y < 40) {
          scrolledDown = false
          suppressScroll = true
          setTimeout(() => { suppressScroll = false }, 380)
        }
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    window.addEventListener('threadsvault:focus-search', onFocusSearch)
    window.addEventListener('keydown', onKeydown)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('threadsvault:focus-search', onFocusSearch)
      window.removeEventListener('keydown', onKeydown)
    }
  })
</script>

<div class="w-full max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 pb-24">

  <!--
    PBL: will-change:transform + translateZ(0) elevan el header a su propia
    capa de composición en la GPU → el blur backdrop-filter se calcula en GPU.
    El panel de hashtags colapsa con grid-template-rows al hacer scroll.
    Ver onScroll() para el fix del bounce (suppressScroll + overflow-anchor).
  -->
  <header class="sticky top-0 z-20 -mx-5 sm:-mx-6 lg:-mx-10 px-5 sm:px-6 lg:px-10 pt-5 sm:pt-6 pb-4" style="
    background: var(--vault-header-bg);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border-bottom: 1px solid var(--vault-header-border);
    border-radius: 0 0 1.25rem 1.25rem;
    will-change: transform;
    transform: translateZ(0);
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
          color: var(--vault-on-bg);
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
          aria-label={t('vault.settings')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--vault-on-bg-muted)">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <button
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200"
          style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
          onclick={() => void refreshStalePostMedia()}
          disabled={$mediaRefreshState === 'refreshing'}
          aria-label={t('vault.refresh_media')}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style="color: var(--vault-on-bg-muted)"
            class={$mediaRefreshState === 'refreshing' ? 'animate-spin' : ''}
          >
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>

        <button
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200"
          style="
            background: {selectionMode ? 'rgba(124,77,255,0.22)' : 'var(--vault-surface)'};
            border: 1px solid {selectionMode ? 'rgba(124,77,255,0.5)' : 'var(--vault-border)'};
          "
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = selectionMode ? 'rgba(124,77,255,0.3)' : 'var(--vault-surface-hover)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = selectionMode ? 'rgba(124,77,255,0.22)' : 'var(--vault-surface)'}
          onclick={toggleSelectionMode}
          aria-label={t('vault.select_posts')}
          title={selectionMode ? t('vault.cancel_selection') : t('vault.select_posts')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               style="color: {selectionMode ? '#c8b4ff' : 'var(--vault-on-bg-muted)'}">
            {#if selectionMode}
              <path d="M18 6L6 18M6 6l12 12"/>
            {:else}
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            {/if}
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
          <span>{t('vault.add')}</span>
        </button>
      </div>
    </div>

    <!-- Selector de espacio de datos (PC / Android importada) -->
    <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <p class="text-xs px-2.5 py-1 rounded-full" style="
        background: var(--vault-filter-count-bg);
        border: 1px solid var(--vault-filter-count-border);
        color: var(--vault-filter-count-color);
        font-family: var(--font-display);
      ">
        {t('vault.active_db')}: {getDataSpaceLabel($activeDataSpace)}
      </p>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
          style="
            font-family: var(--font-display);
            {$activeDataSpace === 'pc'
              ? 'background: linear-gradient(135deg, #00BCD4, #31c6dc); color: #052c34; box-shadow: 0 0 12px rgba(0,188,212,0.35);'
              : 'background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border);'}
          "
          onclick={() => void switchDataSpace('pc')}
        >{t('vault.db_pc')}</button>
        <button
          class="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
          style="
            font-family: var(--font-display);
            {$activeDataSpace === 'android'
              ? 'background: linear-gradient(135deg, #2ccf8f, #50dda7); color: #063825; box-shadow: 0 0 12px rgba(44,207,143,0.32);'
              : 'background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border);'}
          "
          onclick={() => void switchDataSpace('android')}
        >{t('vault.db_android')}</button>
      </div>
    </div>

    <!--
      PBL: Dashboard de hashtags colapsable.
      overflow-anchor:none → este div no actúa como ancla del scroll anchoring
      de Chrome. Sin esto, cuando el div cambia de altura (colapsa), Chrome
      ajusta window.scrollY para "mantener" el contenido visible, disparando
      onScroll() de nuevo y creando el bucle de rebote.
      La segunda capa de protección es suppressScroll en onScroll().
    -->
    <div style="
      display: grid;
      grid-template-rows: {scrolledDown ? '0fr' : '1fr'};
      opacity: {scrolledDown ? '0' : '1'};
      transition: grid-template-rows 0.32s ease, opacity 0.22s ease;
      pointer-events: {scrolledDown ? 'none' : 'auto'};
      overflow-anchor: none;
    ">
      <div style="overflow: hidden; border-radius: 1rem;">
      <div class="rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-3" style="
        background: var(--vault-hashtag-panel-bg);
        border: 1px solid var(--vault-hashtag-panel-border);
        box-shadow: var(--vault-hashtag-panel-shadow);
      ">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-semibold" style="
            color: var(--vault-hashtag-label);
            font-family: var(--font-display);
            letter-spacing: 0.03em;
">{t('vault.hashtags_title')}</p>
          <span class="text-xs px-2 py-0.5 rounded-full" style="
            background: var(--vault-hashtag-count-bg);
            border: 1px solid var(--vault-hashtag-count-border);
            color: var(--vault-hashtag-count-color);
            font-family: var(--font-display);
          ">{$hashtagStats.length}</span>
        </div>

        {#if $hashtagStats.length === 0}
          <p class="text-xs" style="color: var(--vault-on-bg-muted)">
            {t('vault.no_hashtags')}
          </p>
        {:else}
          <div
            class="flex gap-2 overflow-x-auto no-scrollbar pb-1.5 snap-x snap-mandatory"
            onwheel={handleHorizontalWheel}
            use:horizontalDrag
          >
            {#each $hashtagStats as item (item.tag)}
              {@const ratio = Math.max(0.08, Math.min(1, item.count / getMaxHashtagCount()))}
              <button
                class="shrink-0 snap-start rounded-xl px-3 py-2 text-left transition-all duration-200"
                style="
                  width: 164px;
                  border: 1px solid {$activeHashtag === item.tag
                    ? 'var(--vault-hashtag-chip-border-active)'
                    : 'var(--vault-hashtag-chip-border)'};
                  background: {$activeHashtag === item.tag
                    ? 'linear-gradient(135deg, var(--vault-hashtag-chip-bg-from-active), var(--vault-hashtag-chip-bg-to-active))'
                    : 'linear-gradient(135deg, var(--vault-hashtag-chip-bg-from), var(--vault-hashtag-chip-bg-to))'};
                  box-shadow: {$activeHashtag === item.tag
                    ? '0 0 16px rgba(0,188,212,0.18)'
                    : 'none'};
                "
                onclick={() => toggleHashtag(item.tag)}
                aria-label={`Filtrar por ${item.tag}`}
              >
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <span class="text-[11px] font-semibold truncate" style="
                    color: var(--vault-hashtag-text);
                    font-family: var(--font-display);
                  ">{item.tag}</span>
                  <span class="text-[11px] px-1.5 py-0.5 rounded-full" style="
                    background: var(--vault-hashtag-count-bg);
                    border: 1px solid var(--vault-hashtag-count-border);
                    color: var(--vault-hashtag-count-color);
                    font-family: var(--font-display);
                    line-height: 1;
                  ">{item.count}</span>
                </div>

                <div class="h-1.5 rounded-full overflow-hidden" style="
                  background: var(--vault-progress-track);
                  border: 1px solid var(--vault-progress-track);
                ">
                  <div style="
                    width: {Math.round(ratio * 100)}%;
                    height: 100%;
                    background: linear-gradient(90deg, #00bcd4, #7c4dff);
                  "></div>
                </div>

                <p class="mt-1.5 text-[10px]" style="color: var(--vault-on-bg-muted)">
                  {$activeHashtag === item.tag ? t('vault.hashtag_filter_active') : t('vault.hashtag_filter_inactive')}
                </p>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      </div>
    </div>

    <!-- Campo de búsqueda principal -->
    <div class="relative mb-3">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
           width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="var(--vault-search-icon)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        placeholder={t('vault.search_placeholder')}
        bind:value={$searchQuery}
        bind:this={searchInput}
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
        color: var(--vault-filter-label);
        font-family: var(--font-display);
        letter-spacing: 0.04em;
      ">{t('vault.quick_filters')}</p>
      <span class="text-xs px-2 py-0.5 rounded-full" style="
        background: var(--vault-filter-count-bg);
        border: 1px solid var(--vault-filter-count-border);
        color: var(--vault-filter-count-color);
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
        >{t('vault.all')}</button>

        {#each chipOrder as cat}
          <button
            class="shrink-0 px-3 rounded-full text-xs font-semibold text-white whitespace-nowrap transition-all duration-200"
            draggable="true"
            style="
              padding-top: 5px; padding-bottom: 5px;
              line-height: 1.2;
              font-family: var(--font-display);
              background: {cat.color};
              opacity: {$activeCategory === cat.id ? '1' : '0.42'};
              box-shadow: {$activeCategory === cat.id ? `0 0 14px ${cat.color}55` : 'none'};
            "
            ondragstart={(e) => onCategoryDragStart(e, cat.id)}
            ondragover={(e) => onCategoryDragOver(e, cat.id)}
            ondrop={onCategoryDrop}
            ondragend={onCategoryDragEnd}
            onclick={() => {
              if (suppressCategoryClick) return
              toggleCategory(cat.id)
            }}
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
        <p style="color: var(--vault-on-bg-muted)">{t('vault.error_loading')}</p>
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
              {t('vault.no_results')}
            </p>
            <p class="text-sm" style="color: var(--vault-on-bg-muted)">
              {t('vault.no_results_hint')}
            </p>
          </div>
          <button
            class="px-4 py-1.5 rounded-full text-sm transition-all duration-200"
            style="border: 1px solid rgba(124,77,255,0.35); color: var(--vault-primary); font-family: var(--font-display)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.08)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            onclick={() => { searchQuery.set(''); activeCategory.set(null); activeHashtag.set(null) }}
          >{t('vault.clear_filters')}</button>
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
            {selectionMode}
            selected={selectedPostIds.has(post.id)}
            onToggleSelect={toggleSelectPost}
          />
        </div>
      {/each}
    {/if}
  </div>

  {#if $mediaRefreshState === 'done' || $mediaRefreshState === 'error'}
    <div
      class="fixed bottom-6 left-1/2 z-50 animate-fade-up"
      style="transform: translateX(-50%); white-space: nowrap;"
    >
      <div
        class="px-4 py-2.5 rounded-xl text-sm font-semibold"
        style="
          background: var(--vault-toast-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid {$mediaRefreshState === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(124,77,255,0.35)'};
          color: {$mediaRefreshState === 'error' ? '#fca5a5' : 'var(--vault-on-bg)'};
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          font-family: var(--font-display);
        "
      >
        {refreshToastMsg}
      </div>
    </div>
  {/if}

  <!-- Barra bulk fija en la parte inferior cuando hay selección activa -->
  {#if selectionMode}
    <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col" style="
      background: var(--vault-bulk-bar-bg);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-top: 1px solid rgba(124,77,255,0.28);
      box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
    ">
      <!-- Selector de categoría expandible -->
      {#if showCategoryPicker}
        <div class="flex flex-wrap gap-2 px-4 pt-3 pb-2">
          {#each $categories as cat}
            <button
              onclick={() => handleBulkMove(cat.id)}
              disabled={bulkActionState === 'working'}
              class="px-3.5 py-1.5 rounded-full text-xs font-semibold text-white transition-all duration-150 disabled:opacity-50"
              style="background: {cat.color}; font-family: var(--font-display)"
            >{cat.emoji ?? '📌'} {cat.name}</button>
          {/each}
        </div>
        <div class="h-px mx-4" style="background: var(--vault-divider)"></div>
      {/if}

      <div class="flex items-center gap-2 px-4 py-3">
        <!-- Contador de selección -->
        <span class="text-xs font-semibold mr-1" style="color: var(--vault-on-bg-muted); font-family: var(--font-display)">
          {selectedPostIds.size} seleccionado{selectedPostIds.size !== 1 ? 's' : ''}
        </span>

        <!-- Mover a categoría -->
        <button
          onclick={() => { showCategoryPicker = !showCategoryPicker }}
          disabled={selectedPostIds.size === 0 || bulkActionState === 'working'}
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-40"
          style="background: rgba(124,77,255,0.18); border: 1px solid rgba(124,77,255,0.35); color: #c8b4ff; font-family: var(--font-display)"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Mover
        </button>

        <!-- Fusionar en hilo (solo cuando hay 2+) -->
        {#if selectedPostIds.size >= 2}
          <button
            onclick={handleBulkMerge}
            disabled={bulkActionState === 'working'}
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-40"
            style="background: rgba(0,188,212,0.14); border: 1px solid rgba(0,188,212,0.30); color: #baf5ff; font-family: var(--font-display)"
          >
            <span>🧵</span>
            {bulkActionState === 'working' ? t('vault.merging') : t('vault.merge_thread')}
          </button>
        {/if}

        <!-- Eliminar -->
        <button
          onclick={handleBulkDelete}
          disabled={selectedPostIds.size === 0 || bulkActionState === 'working'}
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-40 ml-auto"
          style="background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.30); color: #fca5a5; font-family: var(--font-display)"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
          {bulkActionState === 'working' ? t('vault.deleting') : t('common.delete')}
        </button>
      </div>
    </div>
  {/if}
</div>
