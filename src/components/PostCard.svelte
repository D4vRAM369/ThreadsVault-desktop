<script lang="ts">
  import type { Post, Category } from "../lib/types";
  import CategoryBadge from "./CategoryBadge.svelte";
  import { getPostDisplayPath } from "../lib/utils/url-parser";
  import { savePost, loadVault } from "../lib/stores/vault";
  import { invoke } from "@tauri-apps/api/core";

  let {
    post,
    category,
    onDelete,
    index = 0,
    selectionMode = false,
    selected = false,
    onToggleSelect,
  }: {
    post: Post;
    category: Category | undefined;
    onDelete: (id: string) => void;
    index?: number;
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
  } = $props();

  let confirmingDelete = $state(false);
  let previewSourceIndex = $state(0);
  let previewCandidates = $derived(getPreviewCandidates());

  // Note modal state
  let editingNote = $state(false);
  let noteValue = $state(post.note ?? "");
  let savingNote = $state(false);

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function isAvatarLikeUrl(url?: string): boolean {
    if (!url) return false;
    return (
      /\/t51\.2885-19\//i.test(url) ||
      /profile(?:_pic|pic)|avatar/i.test(url) ||
      /[?&]type=profile/i.test(url)
    );
  }

  function getPreviewCandidates(): string[] {
    const imageMedia = (post.media ?? [])
      .filter((media) => media.type === "image")
      .flatMap((media) => [
        media.cachedDataUrl,
        media.url,
        media.url
          ? `https://images.weserv.nl/?url=${encodeURIComponent(media.url.replace(/^https?:\/\//i, ""))}`
          : undefined,
      ])
      .filter((candidate): candidate is string => Boolean(candidate));

    const candidates = [
      ...imageMedia,
      post.previewImage,
      post.previewImage
        ? `https://images.weserv.nl/?url=${encodeURIComponent(post.previewImage.replace(/^https?:\/\//i, ""))}`
        : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));

    const unique = new Set<string>();
    return candidates.filter((candidate) => {
      if (unique.has(candidate)) return false;
      unique.add(candidate);
      return !isAvatarLikeUrl(candidate);
    });
  }

  function handlePreviewError() {
    const candidates = getPreviewCandidates();
    if (previewSourceIndex < candidates.length - 1) {
      previewSourceIndex += 1;
    } else {
      previewSourceIndex = candidates.length;
    }
  }

  /*
    PBL: Ripple effect — feedback visual táctil.
    Creamos un <span> en las coordenadas del click,
    le aplicamos @keyframes ripple-expand (definido en app.css)
    y lo destruimos cuando termina la animación.
    Esto es JS puro manipulando el DOM — sin librería.
  */
  function handleRipple(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement("span");
    Object.assign(ripple.style, {
      position: "absolute",
      width: "120px",
      height: "120px",
      borderRadius: "50%",
      background: "rgba(124,77,255,0.18)",
      transform: "translate(-50%, -50%) scale(0)",
      animation: "ripple-expand 0.55s ease-out forwards",
      left: `${x}px`,
      top: `${y}px`,
      pointerEvents: "none",
    });
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  }

  async function handleSaveNote() {
    savingNote = true;
    try {
      const updated: Post = { ...post, note: noteValue.trim() };
      await savePost(updated);
      post = updated;
      await loadVault();
      editingNote = false;
    } finally {
      savingNote = false;
    }
  }

  // Detecta si un texto es una URL sin esquema (ej: "github.com/user/repo")
  function looksLikeUrl(text: string | undefined): boolean {
    if (!text?.trim()) return false;
    return /^[\w][\w.-]+\.[a-z]{2,}(\/|$)/i.test(text) && !text.includes(" ");
  }

  async function openExternal(url: string) {
    if ("__TAURI_INTERNALS__" in window) {
      await invoke("open_url", { url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  async function handleDeleteNote() {
    const updated: Post = { ...post, note: "" };
    await savePost(updated);
    post = updated;
    noteValue = "";
    await loadVault();
    editingNote = false;
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
    background: {selected ? 'rgba(124,77,255,0.12)' : 'var(--vault-card-bg)'};
    border: 1px solid {selected
    ? 'rgba(124,77,255,0.45)'
    : 'var(--vault-card-border)'};
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: {selected
    ? '0 4px 24px rgba(124,77,255,0.18)'
    : '0 4px 24px rgba(0,0,0,0.28)'};
    transition: transform 0.22s cubic-bezier(0.16,1,0.3,1),
                box-shadow 0.22s ease,
                border-color 0.22s ease,
                background 0.22s ease;
  "
  onclick={(e) => {
    if (confirmingDelete) return;
    if (selectionMode) {
      onToggleSelect?.(post.id);
      return;
    }
    handleRipple(e);
    // PBL: setTimeout deja que el usuario VEA el ripple antes de navegar
    setTimeout(() => {
      window.location.hash = `#/post/${post.id}`;
    }, 120);
  }}
  tabindex="0"
  onkeydown={(e) =>
    e.key === "Enter" &&
    !confirmingDelete &&
    (window.location.hash = `#/post/${post.id}`)}
  onmouseenter={(e) => {
    if (confirmingDelete) return;
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "translateY(-2px)";
    el.style.boxShadow =
      "0 10px 36px rgba(124,77,255,0.18), 0 4px 24px rgba(0,0,0,0.3)";
    el.style.borderColor = "rgba(124,77,255,0.28)";
    el.style.background = "var(--vault-card-hover-bg)";
  }}
  onmouseleave={(e) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "translateY(0)";
    el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.28)";
    el.style.borderColor = "var(--vault-card-border)";
    el.style.background = "var(--vault-card-bg)";
  }}
>
  <!--
    PBL: "Luz en el borde superior" — simula un foco de luz desde arriba.
    Es un div ultra-fino (1px) con gradiente horizontal de transparente a blanco.
    Truco estándar en glassmorphism premium (ve Linear App o Raycast).
  -->
  <div
    class="absolute top-0 left-6 right-6 h-px pointer-events-none"
    style="
    background: linear-gradient(90deg, transparent, var(--vault-card-shine), transparent);
  "
  ></div>

  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <!-- Autor: gradiente brand purple→cyan -->
      <p
        class="font-bold text-sm mb-1 truncate"
        style="
        background: linear-gradient(135deg, var(--vault-primary) 0%, var(--vault-secondary) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: var(--font-display);
        letter-spacing: 0.015em;
      "
      >
        {post.author || "Autor desconocido"}
      </p>

      <!--
        PBL: Mostramos la ruta limpia sin dominio ni params.
        getPostDisplayPath() extrae solo "/@user/post/ID" del URL completo.
        font-mono = los IDs de posts son strings base64 — la fuente monoespaciada
        hace que se vean como código, lo que refuerza la sensación "técnica/privada".
      -->
      <p
        class="text-xs truncate"
        style="
        color: var(--vault-on-bg-muted);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.01em;
      "
      >
        {getPostDisplayPath(post.url)}
      </p>

      <!--
        PBL: Texto del post como preview principal.
        La nota personal es secundaria — se muestra como chip discreto
        con borde azul para no opacar el contenido guardado.
      -->
      {#if post.extractedText}
        {#if looksLikeUrl(post.extractedText)}
          <!--
            Link post: el contenido del post ES una URL externa.
            Mostramos como chip clicable con icono de enlace + redirect button.
          -->
          <div class="mt-2 flex items-center gap-1.5" style="min-width:0">
            <div
              class="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg overflow-hidden"
              style="
              background: rgba(124,77,255,0.07);
              border: 1px solid rgba(124,77,255,0.18);
              min-width: 0;
            "
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(124,77,255,0.75)"
                stroke-width="2.5"
                class="shrink-0"
              >
                <path
                  d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span
                style="
                font-size: 11px;
                font-family: var(--font-mono);
                color: var(--vault-url-chip-text);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
                min-width: 0;
              ">{post.extractedText}</span
              >
            </div>
            <button
              onclick={(e) => {
                e.stopPropagation();
                void openExternal(`https://${post.extractedText}`);
              }}
              class="shrink-0 flex items-center justify-center rounded-lg transition-all duration-150"
              style="
                width: 26px; height: 26px;
                background: rgba(124,77,255,0.14);
                border: 1px solid rgba(124,77,255,0.30);
                color: var(--vault-url-chip-text);
              "
              onmouseenter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(124,77,255,0.28)";
                el.style.borderColor = "rgba(124,77,255,0.55)";
              }}
              onmouseleave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(124,77,255,0.14)";
                el.style.borderColor = "rgba(124,77,255,0.30)";
              }}
              aria-label="Abrir enlace externo"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        {:else}
          <p
            class="text-sm mt-2 leading-relaxed"
            style="
            color: var(--vault-on-bg-muted);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            font-style: italic;
            white-space: pre-wrap;
          "
          >
            {post.extractedText}
          </p>
        {/if}
      {/if}

      {#if post.note}
        <!-- Note chip — clickable, opens inline modal -->
        <button
          class="note-chip mt-1.5 flex items-center gap-1.5 py-1 px-2 w-full text-left"
          style="
            border-left: 2px solid rgba(0,188,212,0.55);
            border-radius: 0 5px 5px 0;
            background: rgba(0,188,212,0.05);
            border-top: 1px solid transparent;
            border-right: 1px solid transparent;
            border-bottom: 1px solid transparent;
            cursor: pointer;
            transition: background 0.18s ease, border-color 0.18s ease;
          "
          onclick={(e) => {
            e.stopPropagation();
            noteValue = post.note ?? "";
            editingNote = true;
          }}
          onmouseenter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(0,188,212,0.11)";
            el.style.borderTopColor = "rgba(0,188,212,0.20)";
            el.style.borderRightColor = "rgba(0,188,212,0.20)";
            el.style.borderBottomColor = "rgba(0,188,212,0.20)";
          }}
          onmouseleave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(0,188,212,0.05)";
            el.style.borderTopColor = "transparent";
            el.style.borderRightColor = "transparent";
            el.style.borderBottomColor = "transparent";
          }}
          aria-label="Editar nota personal"
        >
          <!-- Pencil icon with glow dot -->
          <span
            class="shrink-0 relative flex items-center justify-center"
            style="width:16px; height:16px"
          >
            <span
              class="absolute inset-0 rounded-full"
              style="
              background: rgba(0,188,212,0.18);
              border: 1px solid rgba(0,188,212,0.38);
            "
            ></span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(0,188,212,0.90)"
              stroke-width="2.5"
              style="position:relative; z-index:1"
            >
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
          </span>
          <p
            style="
            font-size: 10px;
            line-height: 1.4;
            color: var(--vault-note-text-color);
            font-style: italic;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
            font-family: var(--font-body);
            flex: 1;
            min-width: 0;
          "
          >
            {post.note}
          </p>
          <!-- Edit hint arrow -->
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(0,188,212,0.45)"
            stroke-width="2.5"
            class="shrink-0"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      {/if}

      {#if post.media?.length}
        <div
          class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
          style="
          background: rgba(0,188,212,0.12);
          border: 1px solid rgba(0,188,212,0.25);
          color: var(--vault-media-chip-color);
          font-size: 10px;
          letter-spacing: 0.04em;
          font-family: var(--font-display);
        "
        >
          <span
            >{post.media.some(
              (item) => item.type === "video" || item.type === "video-link",
            )
              ? "🎬"
              : "🖼️"}</span
          >
          <span
            >{post.media.filter((m) => m.type !== "video-link").length ||
              post.media.length} media</span
          >
        </div>
      {/if}

      {#if post.threadPosts?.length}
        <div
          class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full ml-1"
          style="
          background: rgba(124,77,255,0.12);
          border: 1px solid rgba(124,77,255,0.28);
          color: var(--vault-thread-chip-color);
          font-size: 10px;
          letter-spacing: 0.04em;
          font-family: var(--font-display);
        "
        >
          <span>🧵</span>
          <span>Hilo {post.threadPosts.length + 1} posts</span>
        </div>
      {/if}
    </div>

    <!--
      PBL: Thumbnail de previsualización.
      Usamos cachedDataUrl si existe (data: URL local), sino previewImage (URL remota).
      object-fit:cover recorta la imagen para llenar el cuadrado sin deformarla.
      El video badge (▶) se superpone si es un post de vídeo.
    -->
    {#if previewCandidates.length}
      {@const thumbSrc = previewCandidates[previewSourceIndex]}
      {@const hasVideo = post.media?.some(
        (m) => m.type === "video" || m.type === "video-link",
      )}
      {#if thumbSrc}
        <div
          class="shrink-0 relative rounded-xl overflow-hidden"
          style="
          width: 64px; height: 64px;
          border: 1px solid var(--vault-thumb-border);
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        "
        >
          <img
            src={thumbSrc}
            alt="Preview"
            style="width:100%; height:100%; object-fit:cover; display:block;"
            loading="lazy"
            onerror={handlePreviewError}
          />
          {#if hasVideo}
            <div
              class="absolute inset-0 flex items-center justify-center"
              style="
              background: rgba(0,0,0,0.38);
            "
            >
              <span style="font-size: 1.1rem; line-height:1">▶</span>
            </div>
          {/if}
        </div>
      {:else}
        <div
          class="shrink-0 rounded-xl flex items-center justify-center"
          style="
          width: 64px; height: 64px;
          border: 1px solid var(--vault-thumb-border);
          background: linear-gradient(135deg, rgba(124,77,255,0.16), rgba(0,188,212,0.12));
          box-shadow: 0 2px 10px rgba(0,0,0,0.28);
          color: rgba(255,255,255,0.72);
          font-family: var(--font-display);
          font-size: 0.75rem;
        "
        >
          {hasVideo ? "VIDEO" : "POST"}
        </div>
      {/if}
    {/if}

    <!-- Checkbox overlay en modo selección -->
    {#if selectionMode}
      <div
        class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150"
        style="
        background: {selected
          ? 'var(--vault-primary)'
          : 'var(--vault-card-hover-bg)'};
        border: 2px solid {selected
          ? 'var(--vault-primary)'
          : 'var(--vault-section-border)'};
      "
      >
        {#if selected}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        {/if}
      </div>
    {/if}

    <!-- Zona de confirmación/borrado (solo fuera del modo selección) -->
    {#if !selectionMode}
      {#if confirmingDelete}
        <div class="flex items-center gap-1.5 shrink-0">
          <span
            class="text-xs whitespace-nowrap"
            style="color: var(--vault-on-bg-muted)">¿Eliminar?</span
          >
          <button
            class="px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
            style="background: rgba(239,68,68,0.75); font-family: var(--font-display)"
            onclick={(e) => {
              e.stopPropagation();
              onDelete(post.id);
            }}>Sí</button
          >
          <button
            class="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style="background: var(--vault-card-hover-bg); color: var(--vault-on-bg); font-family: var(--font-display)"
            onclick={(e) => {
              e.stopPropagation();
              confirmingDelete = false;
            }}>No</button
          >
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
          onclick={(e) => {
            e.stopPropagation();
            confirmingDelete = true;
          }}
          aria-label="Eliminar post"
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      {/if}
    {/if}
  </div>

  <div
    class="flex items-center justify-between mt-3 pt-2.5"
    style="border-top: 1px solid var(--vault-card-bottom)"
  >
    {#if category}
      <CategoryBadge {category} />
    {:else}
      <span></span>
    {/if}
    <span
      style="
      font-size: 11px;
      color: var(--vault-on-bg-muted);
      font-family: var(--font-display);
      letter-spacing: 0.02em;
    ">{formatDate(post.savedAt)}</span
    >
  </div>

  <!-- Note edit modal — rendered inside the card, overlays it -->
  {#if editingNote}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 rounded-2xl flex flex-col justify-end"
      style="
        background: rgba(8,8,16,0.88);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 10;
        padding: 14px;
      "
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-1.5 mb-2">
        <span
          class="flex items-center justify-center"
          style="
          width: 18px; height: 18px;
          background: rgba(0,188,212,0.18);
          border: 1px solid rgba(0,188,212,0.40);
          border-radius: 50%;
        "
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(0,188,212,0.95)"
            stroke-width="2.5"
          >
            <path
              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
        <span
          style="
          font-size: 10px;
          font-family: var(--font-display);
          letter-spacing: 0.07em;
          color: rgba(0,188,212,0.75);
          text-transform: uppercase;
        ">NOTA PERSONAL</span
        >
      </div>

      <div
        class="rounded-xl overflow-hidden mb-2.5"
        style="
        background: rgba(0,188,212,0.05);
        border: 1px solid rgba(0,188,212,0.25);
        border-left: 2px solid rgba(0,188,212,0.60);
      "
      >
        <textarea
          bind:value={noteValue}
          rows="3"
          placeholder="Escribe tu nota…"
          class="w-full bg-transparent resize-none text-sm leading-relaxed outline-none px-3 py-2"
          style="
            color: var(--vault-on-bg);
            font-family: var(--font-body);
            font-size: 12px;
          "
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              editingNote = false;
              noteValue = post.note ?? "";
            }
          }}
        ></textarea>
      </div>

      <div class="flex items-center gap-2">
        <button
          onclick={(e) => {
            e.stopPropagation();
            void handleSaveNote();
          }}
          disabled={savingNote}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-150"
          style="
            background: rgba(0,188,212,0.28);
            border: 1px solid rgba(0,188,212,0.45);
            font-family: var(--font-display);
            opacity: {savingNote ? '0.6' : '1'};
          ">{savingNote ? "Guardando…" : "Guardar"}</button
        >

        <button
          onclick={(e) => {
            e.stopPropagation();
            editingNote = false;
            noteValue = post.note ?? "";
          }}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
          style="
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: var(--vault-on-bg-muted);
            font-family: var(--font-display);
          ">Cancelar</button
        >

        {#if post.note}
          <button
            onclick={(e) => {
              e.stopPropagation();
              void handleDeleteNote();
            }}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto transition-all duration-150"
            style="
              background: rgba(239,68,68,0.10);
              border: 1px solid rgba(239,68,68,0.25);
              color: #fca5a5;
              font-family: var(--font-display);
            ">Eliminar nota</button
          >
        {/if}
      </div>
    </div>
  {/if}
</article>
