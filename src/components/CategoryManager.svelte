<script lang="ts">
  import { categories, saveCategoryAction, deleteCategoryAction, reorderCategories } from '../lib/stores/vault'
  import type { Category } from '../lib/types'

  let {
    compact = false,
  }: {
    compact?: boolean
  } = $props()

  let newEmoji = $state('📌')
  let newName = $state('')
  let newColor = $state('#7C4DFF')
  let saving = $state(false)
  let editingCat = $state<Category | null>(null)
  let confirmDeleteId = $state<string | null>(null)

  let draggingId = $state<string | null>(null)
  let localOrder = $state<Category[]>([])

  $effect(() => { localOrder = [...$categories] })

  const PRESET_COLORS = [
    '#7C4DFF', '#00BCD4', '#26A69A', '#FF5252',
    '#FF6D00', '#FFD600', '#00E676', '#40C4FF',
    '#E040FB', '#FF4081', '#546E7A', '#8D6E63',
  ]

  const PRESET_EMOJIS = [
    '📌', '🔥', '⭐', '💡', '📚', '🎯',
    '🛠️', '🤖', '🎨', '💼', '🚀', '❤️',
    '📱', '🌐', '🔒', '✨', '📊', '🧠',
  ]

  async function handleAdd() {
    if (!newName.trim()) return
    saving = true
    await saveCategoryAction({
      id: crypto.randomUUID(),
      name: newName.trim(),
      color: newColor,
      emoji: newEmoji,
      order: $categories.length,
    })
    newName = ''
    newEmoji = '📌'
    newColor = '#7C4DFF'
    saving = false
  }

  async function handleSaveEdit() {
    if (!editingCat?.name.trim()) return
    await saveCategoryAction(editingCat)
    editingCat = null
  }

  async function handleDelete(id: string) {
    await deleteCategoryAction(id)
    confirmDeleteId = null
  }

  function handleDragStart(e: DragEvent, id: string) {
    draggingId = id
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) return

    const from = localOrder.findIndex((c) => c.id === draggingId)
    const to = localOrder.findIndex((c) => c.id === targetId)
    if (from === -1 || to === -1) return

    const next = [...localOrder]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    localOrder = next
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    if (!draggingId) return
    await reorderCategories(localOrder)
    draggingId = null
  }

  function handleDragEnd() {
    draggingId = null
  }
</script>

<p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
  color: var(--vault-on-bg-muted);
  font-family: var(--font-display);
  letter-spacing: 0.12em;
">Categorias</p>

<div class="rounded-2xl sm:rounded-3xl p-4 sm:p-5 pt-5 sm:pt-6 mb-4 sm:mb-5 relative overflow-hidden" style="
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.11);
  box-shadow: 0 4px 24px rgba(0,0,0,0.28);
">
  <div class="absolute top-0 left-4 right-4 h-px" style="
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  "></div>

  <div class="grid grid-cols-[44px_1fr_40px] sm:grid-cols-[46px_1fr_42px] gap-2 mb-4">
    <input
      type="text"
      bind:value={newEmoji}
      maxlength="2"
      class="w-11 sm:w-[46px] h-10 sm:h-11 rounded-xl text-center text-lg outline-none transition-all"
      style="
        background: var(--vault-surface);
        border: 1px solid var(--vault-border);
        line-height: 1;
      "
      aria-label="Emoji de categoria"
    />

    <input
      type="text"
      bind:value={newName}
      placeholder="Nueva categoria"
      class="h-10 sm:h-11 px-3 rounded-xl text-sm outline-none transition-all"
      style="
        background: var(--vault-surface);
        color: var(--vault-on-bg);
        border: 1px solid var(--vault-border);
        font-family: var(--font-body);
      "
      onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)'}
      onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--vault-border)'}
      onkeydown={(e) => e.key === 'Enter' && handleAdd()}
    />

    <label class="relative w-10 sm:w-[42px] h-10 sm:h-11 rounded-xl overflow-hidden cursor-pointer shrink-0" style="
      border: 2px solid rgba(255,255,255,0.15);
      background: {newColor};
    " title="Elegir color">
      <input
        type="color"
        bind:value={newColor}
        class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      />
    </label>
  </div>

  <div class="rounded-xl px-2 py-3 mb-4.5" style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06)">
    <div class="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1.5 min-h-[44px]">
      {#each PRESET_COLORS as color}
        <button
          class="w-7 h-7 rounded-full transition-all duration-150 shrink-0"
          style="
            background: {color};
            outline: {newColor === color ? `2px solid white` : 'none'};
            outline-offset: 1px;
            transform: {newColor === color ? 'scale(1.14)' : 'scale(1)'};
          "
          onclick={() => newColor = color}
          aria-label={color}
        ></button>
      {/each}
    </div>
  </div>

  <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-5">
    {#each PRESET_EMOJIS as emoji}
      <button
        class="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all duration-150 shrink-0"
        style="
          background: {newEmoji === emoji ? 'rgba(124,77,255,0.2)' : 'rgba(255,255,255,0.04)'};
          border: 1px solid {newEmoji === emoji ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.08)'};
        "
        onclick={() => newEmoji = emoji}
      >{emoji}</button>
    {/each}
  </div>

  <button
    onclick={handleAdd}
    disabled={saving || !newName.trim()}
    class="w-full rounded-xl text-sm sm:text-[0.95rem] font-semibold text-white transition-all duration-300 disabled:opacity-40"
    style="
      min-height: 46px;
      padding: 10px 14px;
      line-height: 1.2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      letter-spacing: 0.01em;
      background: linear-gradient(135deg, #6c44ff 0%, #8f39ff 45%, #00bcd4 100%);
      background-size: 220% 100%;
      background-position: 0% 0%;
      box-shadow: 0 5px 18px rgba(124,77,255,0.34);
      font-family: var(--font-display);
      border: 1px solid rgba(255,255,255,0.12);
    "
    onmouseenter={(e) => {
      const el = e.currentTarget as HTMLElement
      el.style.backgroundPosition = '100% 0%'
      el.style.boxShadow = '0 8px 24px rgba(124,77,255,0.45)'
      el.style.transform = 'translateY(-1px)'
    }}
    onmouseleave={(e) => {
      const el = e.currentTarget as HTMLElement
      el.style.backgroundPosition = '0% 0%'
      el.style.boxShadow = '0 5px 18px rgba(124,77,255,0.34)'
      el.style.transform = 'translateY(0)'
    }}
    onmousedown={(e) => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(0) scale(0.985)'
      el.style.boxShadow = '0 3px 10px rgba(124,77,255,0.35)'
    }}
    onmouseup={(e) => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(-1px) scale(1)'
      el.style.boxShadow = '0 8px 24px rgba(124,77,255,0.45)'
    }}
    onblur={(e) => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(0) scale(1)'
    }}
  >{saving ? 'Guardando...' : '+ Agregar categoria'}</button>
</div>

{#if $categories.length > 0}
  <div class="rounded-2xl sm:rounded-3xl overflow-hidden" style="
    border: 1px solid rgba(255,255,255,0.11);
    box-shadow: 0 4px 24px rgba(0,0,0,0.28);
  ">
    {#each localOrder as cat, i (cat.id)}
      <div
        role="listitem"
        draggable="true"
        ondragstart={(e) => handleDragStart(e, cat.id)}
        ondragover={(e) => handleDragOver(e, cat.id)}
        ondrop={handleDrop}
        ondragend={handleDragEnd}
        style="
          background: {draggingId === cat.id
            ? 'rgba(124,77,255,0.12)'
            : 'rgba(255,255,255,0.05)'};
          opacity: {draggingId === cat.id ? '0.5' : '1'};
          transition: background 0.15s, opacity 0.15s;
        "
      >
        {#if i > 0}
          <div style="height:1px; background: rgba(255,255,255,0.07); margin: 0 16px"></div>
        {/if}

        {#if editingCat?.id === cat.id}
          <div class="flex gap-2 p-3 items-center">
            <input
              type="text"
              bind:value={editingCat.emoji}
              maxlength="2"
              class="w-10 h-8 rounded-lg text-center text-base outline-none"
              style="background: rgba(255,255,255,0.08); border: 1px solid var(--vault-border)"
            />
            <input
              type="text"
              bind:value={editingCat.name}
              class="flex-1 h-8 px-2 rounded-lg text-sm outline-none"
              style="
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(124,77,255,0.4);
                color: var(--vault-on-bg);
                font-family: var(--font-body);
              "
              onkeydown={(e) => e.key === 'Enter' && handleSaveEdit()}
            />
            <label class="w-8 h-8 rounded-lg cursor-pointer relative overflow-hidden shrink-0" style="background: {editingCat.color}; border: 2px solid rgba(255,255,255,0.2)">
              <input type="color" bind:value={editingCat.color} class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </label>
            <button
              onclick={handleSaveEdit}
              class="px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
              style="background: var(--vault-primary); font-family: var(--font-display)"
            >✓</button>
            <button
              onclick={() => editingCat = null}
              class="px-2 py-1 rounded-lg text-xs"
              style="background: rgba(255,255,255,0.08); color: var(--vault-on-bg-muted)"
            >✕</button>
          </div>
        {:else}
          <div class="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-3.5">
            <div class="cursor-grab active:cursor-grabbing shrink-0" style="color: rgba(255,255,255,0.2); touch-action: none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
              </svg>
            </div>

            <span style="font-size: 1.1rem; line-height: 1; min-width: 20px">{cat.emoji ?? '📌'}</span>

            <p class="flex-1 text-sm font-semibold truncate" style="
              font-family: var(--font-display);
              color: var(--vault-on-bg);
            ">{cat.name}</p>

            <div class="w-3 h-3 rounded-full shrink-0" style="
              background: {cat.color};
              box-shadow: 0 0 8px {cat.color}60;
            "></div>

            {#if confirmDeleteId === cat.id}
              <div class="flex items-center gap-1.5">
                <span class="text-xs" style="color: var(--vault-on-bg-muted)">Borrar?</span>
                <button
                  onclick={() => handleDelete(cat.id)}
                  class="px-2 py-0.5 rounded-lg text-xs font-semibold text-white"
                  style="background: rgba(239,68,68,0.75)"
                >Si</button>
                <button
                  onclick={() => confirmDeleteId = null}
                  class="px-2 py-0.5 rounded-lg text-xs"
                  style="background: rgba(255,255,255,0.08); color: var(--vault-on-bg-muted)"
                >No</button>
              </div>
            {:else}
              <div class="flex items-center gap-1">
                <button
                  onclick={() => editingCat = { ...cat }}
                  class="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style="color: var(--vault-on-bg-muted)"
                  onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
                  onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  aria-label="Editar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onclick={() => confirmDeleteId = cat.id}
                  class="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style="color: rgba(239,68,68,0.6)"
                  onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'}
                  onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  aria-label="Eliminar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="flex flex-col items-center justify-center py-8 gap-2" style="opacity: 0.45">
    <p class="text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg-muted)">Sin categorias todavia</p>
  </div>
{/if}

{#if !compact}
  <div class="h-3"></div>
{/if}
