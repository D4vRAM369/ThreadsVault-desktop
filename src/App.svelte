<script lang="ts">
  import { onMount } from 'svelte'
  import { loadVault, posts } from './lib/stores/vault'
  import type { Post } from './lib/types'

  // ── Zoom global ──────────────────────────────────────────
  const ZOOM_STEP = 0.1
  const ZOOM_MIN  = 0.6
  const ZOOM_MAX  = 2.0
  const ZOOM_KEY  = 'tv_zoom'

  let zoomLevel = parseFloat(localStorage.getItem(ZOOM_KEY) ?? '1')

  let currentRoute = $state(window.location.hash || '#/')

  function computeTitle(route: string, allPosts: Post[]): string {
    if (route === '#/' || route === '') return 'ThreadsVault'
    if (route === '#/share')      return 'ThreadsVault — Añadir post'
    if (route === '#/settings')   return 'ThreadsVault — Ajustes'
    if (route === '#/categories') return 'ThreadsVault — Categorías'
    if (route.startsWith('#/post/')) {
      const id   = route.replace('#/post/', '')
      const post = allPosts.find(p => p.id === id)
      return post?.author ? `ThreadsVault — ${post.author}` : 'ThreadsVault — Post'
    }
    return 'ThreadsVault'
  }

  $effect(() => {
    const title = computeTitle(currentRoute, $posts)
    document.title = title
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTitle(title).catch(() => {})
      })
    }
  })

  async function applyZoom(level: number) {
    const clamped = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level)) * 10) / 10
    zoomLevel = clamped
    localStorage.setItem(ZOOM_KEY, String(clamped))
    if ('__TAURI_INTERNALS__' in window) {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      await getCurrentWebviewWindow().setZoom(clamped)
    }
  }

  onMount(() => {
    if (zoomLevel !== 1.0) {
      void applyZoom(zoomLevel)
    }

    loadVault()

    const onHashChange = () => { currentRoute = window.location.hash || '#/' }

    function onKeydown(e: KeyboardEvent) {
      const key = (e.key || '').toLowerCase()
      const hasPrimaryModifier = e.ctrlKey || e.metaKey
      const isCtrlF = hasPrimaryModifier && !e.shiftKey && !e.altKey && (key === 'f' || e.code === 'KeyF')
      const isCtrlN = hasPrimaryModifier && !e.shiftKey && !e.altKey && (key === 'n' || e.code === 'KeyN')
      const isCtrlPlus  = hasPrimaryModifier && !e.shiftKey && !e.altKey &&
                          (key === '=' || key === '+' || e.code === 'Equal')
      const isCtrlMinus = hasPrimaryModifier && !e.shiftKey && !e.altKey &&
                          (key === '-' || e.code === 'Minus')
      const isCtrlZero  = hasPrimaryModifier && !e.shiftKey && !e.altKey &&
                          (key === '0' || e.code === 'Digit0')

      // Global: Ctrl/Cmd+F -> busqueda interna de la app
      if (isCtrlF) {
        e.preventDefault()
        if (currentRoute !== '#/' && currentRoute !== '') {
          window.location.hash = '#/'
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('threadsvault:focus-search'))
        }, 0)
        return
      }

      // Global: Ctrl/Cmd+N -> nuevo post
      if (isCtrlN) {
        e.preventDefault()
        window.location.hash = '#/share'
        return
      }

      if (isCtrlPlus)  { e.preventDefault(); void applyZoom(zoomLevel + ZOOM_STEP); return }
      if (isCtrlMinus) { e.preventDefault(); void applyZoom(zoomLevel - ZOOM_STEP); return }
      if (isCtrlZero)  { e.preventDefault(); void applyZoom(1.0); return }

      const tag  = (e.target as HTMLElement).tagName
      const edit = (e.target as HTMLElement).isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || edit) return

      // Esc -> volver atras
      if (e.key === 'Escape' && currentRoute !== '#/' && currentRoute !== '') {
        e.preventDefault()
        history.back()
      }
    }

    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('keydown', onKeydown, { capture: true })
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('keydown', onKeydown, true)
    }
  })

  function getPostId(): string {
    return currentRoute.replace('#/post/', '')
  }
</script>

<!-- Blobs de fondo: position:fixed, z-index:0, pointer-events:none -->
<!-- PBL: Viven fuera del flujo del DOM para no afectar el layout   -->
<div class="blob-scene" aria-hidden="true">
  <div class="blob blob-purple"></div>
  <div class="blob blob-cyan"></div>
  <div class="blob blob-teal"></div>
</div>

<main class="app-shell">
  {#if currentRoute === '#/' || currentRoute === ''}
    {#await import('./routes/VaultScreen.svelte') then { default: VaultScreen }}
      <VaultScreen />
    {/await}

  {:else if currentRoute.startsWith('#/post/')}
    {#await import('./routes/PostDetailScreen.svelte') then { default: PostDetailScreen }}
      {#key getPostId()}
        <PostDetailScreen postId={getPostId()} />
      {/key}
    {/await}

  {:else if currentRoute === '#/settings'}
    {#await import('./routes/SettingsScreen.svelte') then { default: SettingsScreen }}
      <SettingsScreen />
    {/await}

  {:else if currentRoute === '#/share'}
    {#await import('./routes/ShareScreen.svelte') then { default: ShareScreen }}
      <ShareScreen />
    {/await}

  {:else if currentRoute === '#/categories'}
    {#await import('./routes/CategoryScreen.svelte') then { default: CategoryScreen }}
      <CategoryScreen />
    {/await}

  {:else}
    {#await import('./lib/components/NotFound.svelte') then { default: NotFound }}
      <NotFound />
    {/await}
  {/if}
</main>

