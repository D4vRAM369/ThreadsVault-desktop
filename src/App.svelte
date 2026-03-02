<script lang="ts">
  import { onMount } from 'svelte'
  import { loadVault, posts } from './lib/stores/vault'
  import type { Post } from './lib/types'

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

  onMount(() => {
    loadVault()
    const onHashChange = () => { currentRoute = window.location.hash || '#/' }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
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
      <PostDetailScreen postId={getPostId()} />
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
