<script lang="ts">
  import { onMount } from 'svelte'
  import { categories, deletePost } from '../lib/stores/vault'
  import { getStorage } from '../lib/storage/index'
  import type { Post } from '../lib/types'

  let { postId }: { postId: string } = $props()

  let post     = $state<Post | null>(null)
  let category = $derived($categories.find(c => c.id === post?.categoryId))

  onMount(async () => {
    const storage = await getStorage()
    post = await storage.getPost(postId)
  })

  async function handleDelete() {
    if (!post) return
    await deletePost(post.id)
    window.location.hash = '#/'
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }
</script>

<div class="max-w-lg mx-auto px-4 py-6">
  <div class="flex items-center justify-between mb-6">
    <button
      onclick={() => window.location.hash = '#/'}
      class="opacity-60 hover:opacity-100 transition-opacity"
    >← Volver</button>
    <button
      onclick={handleDelete}
      class="text-sm transition-colors"
      style="color: #f87171"
    >Eliminar</button>
  </div>

  {#if !post}
    <div class="flex items-center justify-center h-40 opacity-40">
      <p>Cargando...</p>
    </div>
  {:else}
    <article
      class="rounded-xl p-5"
      style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
    >
      <p class="text-lg font-bold mb-1" style="color: var(--vault-primary)">
        {post.author || 'Autor desconocido'}
      </p>

      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm break-all opacity-60 hover:opacity-100 transition-opacity underline"
      >{post.url}</a>

      {#if post.note}
        <p class="mt-4 text-sm leading-relaxed opacity-90">{post.note}</p>
      {/if}

      <div
        class="flex items-center justify-between mt-4 pt-3"
        style="border-top: 1px solid rgba(255,255,255,0.08)"
      >
        {#if category}
          <span
            class="px-2 py-0.5 rounded-full text-xs text-white"
            style="background: {category.color}"
          >{category.name}</span>
        {:else}
          <span></span>
        {/if}
        <span class="text-xs opacity-40">{formatDate(post.savedAt)}</span>
      </div>
    </article>
  {/if}
</div>
