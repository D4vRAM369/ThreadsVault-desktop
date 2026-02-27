<script lang="ts">
  import { posts, categories, appState, filteredPosts,
           searchQuery, activeCategory, deletePost } from '../lib/stores/vault'
  import PostCard from '../components/PostCard.svelte'
  import EmptyState from '../components/EmptyState.svelte'
  import LoadingSpinner from '../components/LoadingSpinner.svelte'

  function getCategoryById(id: string) {
    return $categories.find(c => c.id === id)
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
</script>

<div class="max-w-2xl mx-auto px-4 pb-24">

  <!--
    PBL: -mx-4 cancela el px-4 del padre → header full-width en mobile.
    backdrop-filter:blur(28px) crea el efecto cristal esmerilado.
    El fondo rgba semi-transparente deja pasar algo del color de los blobs.
  -->
  <header class="sticky top-0 z-20 -mx-4 px-4 pt-5 pb-3" style="
    background: rgba(8, 8, 16, 0.82);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  ">
    <!-- Logo + acciones -->
    <div class="flex items-center justify-between mb-3">
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
      PBL: pl-10 (40px) deja espacio para el icono.
      Icono en left:14px + width:14px = ocupa hasta 28px.
      Con 40px de padding el texto empieza con 12px de separación. ✓
    -->
    <div class="relative mb-2.5">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
           width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="rgba(232,232,240,0.3)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <!--
        PBL: Usamos padding-left inline (no clase Tailwind) para garantizar
        que el texto no solape con el ícono.
        left:14px + width:14px = ícono ocupa hasta 28px.
        padding-left:44px = 28px + 16px de margen → sin solapamiento.
      -->
      <input
        type="search"
        placeholder="Buscar posts, autores, notas…"
        bind:value={$searchQuery}
        class="w-full rounded-xl text-sm outline-none transition-all duration-200"
        style="
          background: var(--vault-surface);
          color: var(--vault-on-bg);
          border: 1px solid var(--vault-border);
          font-family: var(--font-body);
          padding: 10px 16px 10px 44px;
        "
        onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
        onblur={(e)  => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      />
    </div>

    <!--
      PBL: Chips de categoría.
      padding-top/bottom: 5px + line-height:1.2 = altura controlada.
      Con line-height:1.6 (heredado de body) y text-xs, las letras con tilde
      como "ó" pueden salirse. line-height:1.2 lo previene.
      whitespace-nowrap evita que el texto se parta en varias líneas.
    -->
    {#if $categories.length > 0}
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar" style="padding-bottom: 2px">
        <button
          class="shrink-0 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200"
          style="
            padding-top: 5px; padding-bottom: 5px;
            line-height: 1.2;
            font-family: var(--font-display);
            {$activeCategory === null
              ? 'background: var(--vault-primary); color: white; box-shadow: 0 0 14px var(--vault-primary-glow);'
              : 'background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border);'}
          "
          onclick={() => activeCategory.set(null)}
        >Todos</button>

        {#each $categories as cat}
          <button
            class="shrink-0 px-3 rounded-full text-xs font-semibold text-white whitespace-nowrap transition-all duration-200"
            style="
              padding-top: 5px; padding-bottom: 5px;
              line-height: 1.2;
              font-family: var(--font-display);
              background: {cat.color};
              opacity: {$activeCategory === cat.id ? '1' : '0.38'};
              box-shadow: {$activeCategory === cat.id ? `0 0 14px ${cat.color}55` : 'none'};
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
            onclick={() => { searchQuery.set(''); activeCategory.set(null) }}
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
