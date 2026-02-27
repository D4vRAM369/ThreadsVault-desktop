<script lang="ts">
  import { posts, categories, appState, filteredPosts,
           searchQuery, activeCategory, deletePost } from '../lib/stores/vault'
  import PostCard from '../components/PostCard.svelte'
  import EmptyState from '../components/EmptyState.svelte'
  import LoadingSpinner from '../components/LoadingSpinner.svelte'

  function getCategoryById(id: string) {
    return $categories.find(c => c.id === id)
  }
</script>

<div class="max-w-2xl mx-auto px-4 pb-24">

  <!--
    PBL: Header sticky con glassmorphism.
    backdrop-filter:blur() hace que el contenido que pasa por detrás
    se vea difuminado, como si el header fuera de cristal esmerilado.
  -->
  <header class="sticky top-0 z-20 pt-5 pb-3" style="
    background: rgba(8, 8, 16, 0.75);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--vault-border);
    margin: 0 -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
  ">
    <!-- Logo + acciones -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style="
          background: linear-gradient(135deg, var(--vault-primary), var(--vault-secondary));
          box-shadow: 0 4px 12px var(--vault-primary-glow);
        ">🔒</div>
        <h1 style="
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.6));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">ThreadsVault</h1>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
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
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
          style="
            background: linear-gradient(135deg, var(--vault-primary), #9c27b0);
            box-shadow: 0 4px 14px var(--vault-primary-glow);
            font-family: var(--font-display);
          "
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 22px rgba(124,77,255,0.5)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px var(--vault-primary-glow)'}
          onclick={() => window.location.hash = '#/share'}
        >
          <span style="font-size:1.1rem; line-height:1; margin-top:-1px">+</span>
          <span>Añadir</span>
        </button>
      </div>
    </div>

    <!-- Búsqueda -->
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
           width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="rgba(232,232,240,0.3)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        placeholder="Buscar posts, autores, notas..."
        bind:value={$searchQuery}
        class="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
        style="
          background: var(--vault-surface);
          color: var(--vault-on-bg);
          border: 1px solid var(--vault-border);
          font-family: var(--font-body);
        "
        onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.45)'}
        onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      />
    </div>

    <!-- Filtros de categoría -->
    {#if $categories.length > 0}
      <div class="flex gap-1.5 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar">
        <button
          class="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200"
          style={$activeCategory === null
            ? 'background: var(--vault-primary); color: white; box-shadow: 0 0 12px var(--vault-primary-glow);'
            : 'background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border);'}
          onclick={() => activeCategory.set(null)}
        >Todos</button>
        {#each $categories as cat}
          <button
            class="shrink-0 px-3 py-1 rounded-full text-xs font-medium text-white transition-all duration-200"
            style="
              background: {cat.color};
              opacity: {$activeCategory === cat.id ? '1' : '0.4'};
              box-shadow: {$activeCategory === cat.id ? `0 0 12px ${cat.color}50` : 'none'};
            "
            onclick={() => activeCategory.set(cat.id)}
          >{cat.name}</button>
        {/each}
      </div>
    {/if}
  </header>

  <!-- Contenido principal -->
  <div class="pt-4">
    {#if $appState === 'loading'}
      <LoadingSpinner />

    {:else if $appState === 'error'}
      <div class="flex flex-col items-center justify-center py-20 gap-3 animate-fade-up">
        <div class="text-4xl">⚠️</div>
        <p style="color: var(--vault-on-bg-muted)">Error cargando la bóveda</p>
      </div>

    {:else if $filteredPosts.length === 0}
      <EmptyState />

    {:else}
      <!--
        PBL: {#each} con índice i → div wrapper con animate-fade-up + delay escalonado.
        Cada card aparece 55ms después de la anterior → efecto cascada natural.
      -->
      <div class="mb-3">
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          {$filteredPosts.length} post{$filteredPosts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {#each $filteredPosts as post, i (post.id)}
        <div class="animate-fade-up" style="animation-delay: {i * 55}ms">
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
