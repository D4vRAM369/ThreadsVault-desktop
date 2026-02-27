<script lang="ts">
  import { onMount } from 'svelte'
  import { loadVault } from './lib/stores/vault'

  let currentRoute = $state(window.location.hash || '#/')

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
    <div class="flex items-center justify-center h-screen" style="color: var(--vault-on-bg-muted)">
      <p>Ruta no encontrada</p>
    </div>
  {/if}
</main>
