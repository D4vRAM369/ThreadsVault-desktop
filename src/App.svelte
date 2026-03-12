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

  // ── Tema ─────────────────────────────────────────────────
  /*
    PBL: Svelte 5 rune $state + $effect para persistir el tema.
    $state reactivo → cualquier cambio re-ejecuta $effect.
    $effect escribe data-theme en <html> y guarda en localStorage.
    Al cargar, leemos localStorage para restaurar la preferencia del usuario.
  */
  const THEME_KEY = 'tv_theme'
  type Theme = 'dark' | 'light'
  let theme = $state<Theme>((localStorage.getItem(THEME_KEY) ?? 'dark') as Theme)

  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  })

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
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      await getCurrentWebview().setZoom(clamped)
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

<!--
  PBL: Botón de tema fijo en la esquina superior derecha.
  position:fixed → se mantiene visible en TODAS las pantallas (no está
  dentro de ningún screen, sino en el root de la app).
  z-index:200 → por encima de todos los elementos de las pantallas.
  Los SVGs de sol/luna son iconos inline (sin dependencias externas).
-->
<button
  class="theme-toggle"
  onclick={() => { theme = theme === 'dark' ? 'light' : 'dark' }}
  title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
  aria-label="Alternar tema"
>
  {#if theme === 'dark'}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  {/if}
</button>

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

<style>
  .theme-toggle {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 200;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--vault-surface);
    border: 1px solid var(--vault-border);
    color: var(--vault-on-bg-muted);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .theme-toggle:hover {
    background: var(--vault-surface-hover);
    color: var(--vault-on-bg);
  }
</style>
