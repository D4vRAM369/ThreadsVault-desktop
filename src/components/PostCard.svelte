<script lang="ts">
  import type { Post, Category } from '../lib/types'
  import CategoryBadge from './CategoryBadge.svelte'

  let {
    post,
    category,
    onDelete,
    index = 0,
  }: {
    post: Post
    category: Category | undefined
    onDelete: (id: string) => void
    index?: number
  } = $props()

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  }
</script>

<!--
  PBL: animation-delay con el índice = animación escalonada.
  Cada card aparece 60ms después de la anterior → efecto cascada.
  style= en lugar de class= para valores dinámicos en Svelte.
-->
<article
  class="glass rounded-2xl p-4 mb-3 cursor-pointer group"
  style="
    animation-delay: {index * 60}ms;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  "
  onclick={() => window.location.hash = `#/post/${post.id}`}
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && (window.location.hash = `#/post/${post.id}`)}
  onmouseenter={(e) => {
    const el = e.currentTarget as HTMLElement
    el.style.transform = 'translateY(-2px)'
    el.style.boxShadow = '0 8px 32px rgba(124,77,255,0.15), 0 0 0 1px rgba(124,77,255,0.2)'
    el.style.background = 'var(--vault-surface-hover)'
  }}
  onmouseleave={(e) => {
    const el = e.currentTarget as HTMLElement
    el.style.transform = 'translateY(0)'
    el.style.boxShadow = 'none'
    el.style.background = 'var(--vault-surface)'
  }}
>
  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <!-- Autor con gradiente de texto -->
      <p class="font-semibold text-sm mb-0.5" style="
        background: linear-gradient(135deg, var(--vault-primary), var(--vault-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: var(--font-display);
      ">
        {post.author || 'Autor desconocido'}
      </p>
      <p class="text-xs truncate" style="color: var(--vault-on-bg-muted)">{post.url}</p>
      {#if post.note}
        <p class="text-sm mt-2 leading-relaxed" style="color: var(--vault-on-bg); opacity: 0.8">
          {post.note}
        </p>
      {/if}
    </div>

    <button
      class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs
             opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all duration-200"
      style="background: rgba(255,255,255,0.08); color: var(--vault-on-bg)"
      onclick={(e) => { e.stopPropagation(); onDelete(post.id) }}
      aria-label="Eliminar post"
    >✕</button>
  </div>

  <div class="flex items-center justify-between mt-3 pt-3" style="border-top: 1px solid var(--vault-border)">
    {#if category}
      <CategoryBadge {category} />
    {:else}
      <span></span>
    {/if}
    <span class="text-xs" style="color: var(--vault-on-bg-muted)">{formatDate(post.savedAt)}</span>
  </div>
</article>
