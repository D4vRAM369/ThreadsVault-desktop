<script lang="ts">
  import type { Post, Category } from '../lib/types'
  import CategoryBadge from './CategoryBadge.svelte'
  import { getPostDisplayPath } from '../lib/utils/url-parser'

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

  let confirmingDelete = $state(false)

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  }

  /*
    PBL: Ripple effect — feedback visual táctil.
    Creamos un <span> en las coordenadas del click,
    le aplicamos @keyframes ripple-expand (definido en app.css)
    y lo destruimos cuando termina la animación.
    Esto es JS puro manipulando el DOM — sin librería.
  */
  function handleRipple(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ripple = document.createElement('span')
    Object.assign(ripple.style, {
      position:     'absolute',
      width:        '120px',
      height:       '120px',
      borderRadius: '50%',
      background:   'rgba(124,77,255,0.18)',
      transform:    'translate(-50%, -50%) scale(0)',
      animation:    'ripple-expand 0.55s ease-out forwards',
      left:         `${x}px`,
      top:          `${y}px`,
      pointerEvents:'none',
    })
    el.appendChild(ripple)
    setTimeout(() => ripple.remove(), 550)
  }
</script>

<!--
  PBL: relative + overflow-hidden son esenciales para el ripple.
  Sin overflow:hidden el span del ripple se saldría de la card.
  Sin position:relative el span no podría usar left/top absolutos.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
  role="button"
  aria-label="Abrir detalle del post"
  class="rounded-2xl p-4 mb-3 cursor-pointer group relative overflow-hidden"
  style="
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.11);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 4px 24px rgba(0,0,0,0.28);
    transition: transform 0.22s cubic-bezier(0.16,1,0.3,1),
                box-shadow 0.22s ease,
                border-color 0.22s ease,
                background 0.22s ease;
  "
  onclick={(e) => {
    if (confirmingDelete) return
    handleRipple(e)
    // PBL: setTimeout deja que el usuario VEA el ripple antes de navegar
    setTimeout(() => { window.location.hash = `#/post/${post.id}` }, 120)
  }}
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && !confirmingDelete && (window.location.hash = `#/post/${post.id}`)}
  onmouseenter={(e) => {
    if (confirmingDelete) return
    const el = e.currentTarget as HTMLElement
    el.style.transform    = 'translateY(-2px)'
    el.style.boxShadow    = '0 10px 36px rgba(124,77,255,0.18), 0 4px 24px rgba(0,0,0,0.3)'
    el.style.borderColor  = 'rgba(124,77,255,0.28)'
    el.style.background   = 'rgba(255,255,255,0.08)'
  }}
  onmouseleave={(e) => {
    const el = e.currentTarget as HTMLElement
    el.style.transform    = 'translateY(0)'
    el.style.boxShadow    = '0 4px 24px rgba(0,0,0,0.28)'
    el.style.borderColor  = 'rgba(255,255,255,0.11)'
    el.style.background   = 'rgba(255,255,255,0.06)'
  }}
>
  <!--
    PBL: "Luz en el borde superior" — simula un foco de luz desde arriba.
    Es un div ultra-fino (1px) con gradiente horizontal de transparente a blanco.
    Truco estándar en glassmorphism premium (ve Linear App o Raycast).
  -->
  <div class="absolute top-0 left-6 right-6 h-px pointer-events-none" style="
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  "></div>

  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">

      <!-- Autor: gradiente brand purple→cyan -->
      <p class="font-bold text-sm mb-1 truncate" style="
        background: linear-gradient(135deg, var(--vault-primary) 0%, var(--vault-secondary) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: var(--font-display);
        letter-spacing: 0.015em;
      ">{post.author || 'Autor desconocido'}</p>

      <!--
        PBL: Mostramos la ruta limpia sin dominio ni params.
        getPostDisplayPath() extrae solo "/@user/post/ID" del URL completo.
        font-mono = los IDs de posts son strings base64 — la fuente monoespaciada
        hace que se vean como código, lo que refuerza la sensación "técnica/privada".
      -->
      <p class="text-xs truncate" style="
        color: var(--vault-on-bg-muted);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.01em;
      ">{getPostDisplayPath(post.url)}</p>

      <!--
        PBL: Mostramos texto extraído del post como preview.
        Preferimos la nota del usuario; si no hay, el texto extraído.
        line-clamp: limita a 2 líneas para no ocupar demasiado espacio.
      -->
      {#if post.note}
        <p class="text-sm mt-2 leading-relaxed" style="
          color: var(--vault-on-bg);
          opacity: 0.88;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        ">{post.note}</p>
      {:else if post.extractedText}
        <p class="text-sm mt-2 leading-relaxed" style="
          color: var(--vault-on-bg-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-style: italic;
        ">{post.extractedText}</p>
      {/if}

      {#if post.media?.length}
        <div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full" style="
          background: rgba(0,188,212,0.12);
          border: 1px solid rgba(0,188,212,0.25);
          color: #b8f5ff;
          font-size: 10px;
          letter-spacing: 0.04em;
          font-family: var(--font-display);
        ">
          <span>{post.media.some((item) => item.type === 'video' || item.type === 'video-link') ? '🎬' : '🖼️'}</span>
          <span>{post.media.filter(m => m.type !== 'video-link').length || post.media.length} media</span>
        </div>
      {/if}
    </div>

    <!--
      PBL: Thumbnail de previsualización.
      Usamos cachedDataUrl si existe (data: URL local), sino previewImage (URL remota).
      object-fit:cover recorta la imagen para llenar el cuadrado sin deformarla.
      El video badge (▶) se superpone si es un post de vídeo.
    -->
    {#if post.previewImage || post.media?.[0]?.cachedDataUrl}
      {@const thumbSrc = post.media?.find(m => m.type === 'image')?.cachedDataUrl ?? post.previewImage}
      {@const hasVideo = post.media?.some(m => m.type === 'video' || m.type === 'video-link')}
      {#if thumbSrc}
        <div class="shrink-0 relative rounded-xl overflow-hidden" style="
          width: 64px; height: 64px;
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        ">
          <img
            src={thumbSrc}
            alt="Preview"
            style="width:100%; height:100%; object-fit:cover; display:block;"
            loading="lazy"
          />
          {#if hasVideo}
            <div class="absolute inset-0 flex items-center justify-center" style="
              background: rgba(0,0,0,0.38);
            ">
              <span style="font-size: 1.1rem; line-height:1">▶</span>
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Zona de confirmación/borrado -->
    {#if confirmingDelete}
      <div
        class="flex items-center gap-1.5 shrink-0"
      >
        <span class="text-xs whitespace-nowrap" style="color: var(--vault-on-bg-muted)">¿Eliminar?</span>
        <button
          class="px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
          style="background: rgba(239,68,68,0.75); font-family: var(--font-display)"
          onclick={(e) => { e.stopPropagation(); onDelete(post.id) }}
        >Sí</button>
        <button
          class="px-2.5 py-1 rounded-lg text-xs font-semibold"
          style="background: rgba(255,255,255,0.08); color: var(--vault-on-bg); font-family: var(--font-display)"
          onclick={(e) => { e.stopPropagation(); confirmingDelete = false }}
        >No</button>
      </div>
    {:else}
      <button
        class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
               opacity-0 group-hover:opacity-40 hover:!opacity-90
               transition-all duration-200"
        style="
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.09);
          color: var(--vault-on-bg-muted);
        "
        onclick={(e) => { e.stopPropagation(); confirmingDelete = true }}
        aria-label="Eliminar post"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    {/if}
  </div>

  <div class="flex items-center justify-between mt-3 pt-2.5" style="border-top: 1px solid rgba(255,255,255,0.07)">
    {#if category}
      <CategoryBadge {category} />
    {:else}
      <span></span>
    {/if}
    <span style="
      font-size: 11px;
      color: var(--vault-on-bg-muted);
      font-family: var(--font-display);
      letter-spacing: 0.02em;
    ">{formatDate(post.savedAt)}</span>
  </div>
</article>
