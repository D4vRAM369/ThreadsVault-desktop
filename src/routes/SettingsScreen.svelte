<script lang="ts">
  import { getStorage } from "../lib/storage/index";
  import { loadVault } from "../lib/stores/vault";
  import CategoryManager from "../components/CategoryManager.svelte";
  import type { ImportResult } from "../lib/storage/adapter";

  import { invoke } from "@tauri-apps/api/core";
  import { DEV_AVATAR } from "../lib/devAvatar";
  import { t, locale } from "../lib/i18n";
  $locale; // reactive subscription — forces re-render on locale change

  let exportStatus = $state<"idle" | "success" | "error">("idle");
  let exportSavedPath = $state("");
  // pendingFile: archivo seleccionado mientras el usuario decide si confirmar.
  let pendingFile = $state<File | null>(null);
  // modalPhase: controla qué vista muestra el modal (sin afectar pendingFile).
  let modalPhase = $state<"confirm" | "importing" | "success" | "error">(
    "confirm",
  );
  let importResult = $state<ImportResult | null>(null);
  let importError = $state("");
  let showAboutDev = $state(false);
  let showShortcuts = $state(false);

  async function openExternal(url: string) {
    if ("__TAURI_INTERNALS__" in window) {
      await invoke("open_url", { url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  async function handleExport() {
    const storage = await getStorage();
    const json = await storage.exportBackup();
    const filename = `threadsvault-backup-${Date.now()}.json`;

    if ("__TAURI_INTERNALS__" in window) {
      // En Tauri: WebView2 descarta los downloads via Blob URL.
      // Usamos el comando Rust save_backup que escribe directamente en ~/Downloads.
      try {
        const savedPath = await invoke<string>("save_backup", {
          content: json,
          filename,
        });
        exportSavedPath = savedPath;
        exportStatus = "success";
        setTimeout(() => {
          exportStatus = "idle";
          exportSavedPath = "";
        }, 6000);
      } catch {
        exportStatus = "error";
        setTimeout(() => (exportStatus = "idle"), 3000);
      }
    } else {
      // Fallback modo browser web
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      exportStatus = "success";
      setTimeout(() => (exportStatus = "idle"), 3000);
    }
  }

  // Paso 1: el usuario selecciona un archivo → mostrar modal de confirmación.
  function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    pendingFile = file;
    modalPhase = "confirm";
    importResult = null;
    importError = "";
    (e.target as HTMLInputElement).value = "";
  }

  function closeModal() {
    pendingFile = null;
    modalPhase = "confirm";
    importResult = null;
    importError = "";
  }

  // Paso 2: el usuario confirmó → ejecutar importación.
  async function doImport() {
    if (!pendingFile) return;

    modalPhase = "importing";
    importError = "";

    let json: string;
    try {
      json = await pendingFile.text();
    } catch {
      importError = t('settings.error_read_file');
      modalPhase = "error";
      return;
    }

    try {
      const storage = await getStorage();
      const result = await storage.importBackup(json);
      await loadVault();
      importResult = result;
      modalPhase = "success";
    } catch (err) {
      importError =
        err instanceof Error
          ? err.message || t('settings.error_import_unknown')
          : String(err);
      modalPhase = "error";
    }
  }

  function goToVault() {
    closeModal();
    window.location.hash = "#/";
  }
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fade-up">
  <!-- Header navegación — mismo patrón que ShareScreen -->
  <div class="flex items-center gap-3 mb-6 sm:mb-8">
    <button
      onclick={() => (window.location.hash = "#/")}
      class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
      style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-surface-hover)")}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-surface)")}
      aria-label={t('common.back')}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        style="color: var(--vault-on-bg)"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
    <div>
      <h1
        style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--vault-on-bg)"
      >
        {t('settings.title')}
      </h1>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">
        {t('settings.subtitle')}
      </p>
    </div>
  </div>

  <div class="mb-6 sm:mb-7">
    <CategoryManager compact={true} />
  </div>

  <!-- ── Sección: Backup & Restore ─────────────────────── -->
  <p
    class="text-xs font-semibold uppercase mb-2.5 px-1"
    style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  "
  >
    {t('settings.data')}
  </p>

  <div
    class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7"
    style="
    border: 1px solid var(--vault-section-border);
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  "
  >
    <!-- Fila: Exportar -->
    <button
      onclick={handleExport}
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 text-left"
      style="background: var(--vault-section-bg-alt)"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-card-hover-bg)")}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-section-bg-alt)")}
    >
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style="
        background: rgba(124,77,255,0.18);
        border: 1px solid rgba(124,77,255,0.3);
      "
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vault-primary)"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p
          class="text-sm font-semibold"
          style="font-family: var(--font-display); color: var(--vault-on-bg)"
        >
          {t('settings.export_backup')}
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          {t('settings.export_desc')}
        </p>
      </div>
      {#if exportStatus === "success"}
        <span
          class="text-xs font-semibold"
          style="color: var(--vault-success); font-family: var(--font-display)"
          >{t('settings.saved')}</span
        >
      {:else if exportStatus === "error"}
        <span
          class="text-xs font-semibold"
          style="color: #f87171; font-family: var(--font-display)">✗ Error</span
        >
      {:else}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vault-on-bg-muted)"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      {/if}
    </button>

    <!-- Ruta de guardado -->
    {#if exportStatus === "success" && exportSavedPath}
      <div class="px-4 sm:px-5 pb-2" style="animation: fadeIn 0.2s ease">
        <p
          class="text-xs font-mono"
          style="
          color: var(--vault-success);
          word-break: break-all;
          line-height: 1.5;
        "
        >
          📁 {exportSavedPath}
        </p>
      </div>
    {/if}

    <!-- Separador -->
    <div
      style="height: 1px; background: var(--vault-divider); margin: 0 16px"
    ></div>

    <!-- Fila: Importar -->
    <label
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 cursor-pointer"
      style="background: var(--vault-section-bg-alt); display:flex"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-card-hover-bg)")}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-section-bg-alt)")}
    >
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style="
        background: rgba(0,188,212,0.15);
        border: 1px solid rgba(0,188,212,0.28);
      "
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vault-secondary)"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p
          class="text-sm font-semibold"
          style="font-family: var(--font-display); color: var(--vault-on-bg)"
        >
          {t('settings.import_backup')}
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          {t('settings.import_desc')}
        </p>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--vault-on-bg-muted)"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <input
        type="file"
        accept=".json"
        class="hidden"
        onchange={handleImport}
      />
    </label>
  </div>

  <!-- ── Sección: Privacidad ──────────────────────────── -->
  <p
    class="text-xs font-semibold uppercase mb-2.5 px-1"
    style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  "
  >
    {t('settings.privacy')}
  </p>

  <div
    class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7"
    style="
    border: 1px solid var(--vault-section-border);
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  "
  >
    {#each [{ icon: "🔒", label: t('settings.all_local'), desc: t('settings.all_local_desc') }, { icon: "☁️", label: t('settings.no_cloud'), desc: t('settings.no_cloud_desc') }, { icon: "🚫", label: t('settings.no_tracking'), desc: t('settings.no_tracking_desc') }] as item, i}
      {#if i > 0}
        <div
          style="height: 1px; background: var(--vault-divider); margin: 0 16px"
        ></div>
      {/if}
      <div
        class="flex items-center gap-3.5 px-4 sm:px-5 py-3.5"
        style="background: var(--vault-section-bg)"
      >
        <span style="font-size: 1.1rem; line-height: 1">{item.icon}</span>
        <div class="flex-1 min-w-0">
          <p
            class="text-sm font-semibold"
            style="font-family: var(--font-display); color: var(--vault-on-bg)"
          >
            {item.label}
          </p>
          <p class="text-xs" style="color: var(--vault-on-bg-muted)">
            {item.desc}
          </p>
        </div>
      </div>
    {/each}
  </div>

  <!-- ── Acerca de ──────────────────────────────────── -->
  <p
    class="text-xs font-semibold uppercase mb-2.5 px-1"
    style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  "
  >
    {t('settings.about')}
  </p>

  <div
    class="rounded-2xl sm:rounded-3xl overflow-hidden"
    style="
    border: 1px solid var(--vault-section-border);
  "
  >
    <!-- Fila: info de la app -->
    <div
      class="flex items-center gap-3.5 p-4 sm:p-5"
      style="background: var(--vault-section-bg)"
    >
      <div
        class="w-10 h-10 rounded-full overflow-hidden shrink-0"
        style="box-shadow: 0 3px 12px rgba(0,0,0,0.5)"
      >
        <img
          src="/icon-app.png"
          alt="ThreadsVault"
          style="width:100%; height:100%; object-fit:cover; display:block;"
        />
      </div>
      <div class="flex-1 min-w-0">
        <p
          class="font-bold text-sm"
          style="font-family: var(--font-brand); color: var(--vault-on-bg)"
        >
          ThreadsVault
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          Desktop v2.2.0 · ES/EN
        </p>
      </div>
      <span
        class="text-xs px-2 py-1 rounded-full"
        style="
        background: rgba(124,77,255,0.12);
        border: 1px solid rgba(124,77,255,0.25);
        color: var(--vault-primary);
        font-family: var(--font-display);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
      ">v2.2</span
      >
    </div>

    <!-- Separador -->
    <div
      style="height: 1px; background: rgba(255,255,255,0.07); margin: 0 16px"
    ></div>

    <!-- Fila: About Dev -->
    <button
      onclick={() => (showAboutDev = true)}
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 text-left"
      style="background: var(--vault-section-bg)"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-card-hover-bg)")}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--vault-section-bg)")}
    >
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style="
        background: rgba(124,77,255,0.14);
        border: 1px solid rgba(124,77,255,0.28);
      "
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vault-primary)"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p
          class="text-sm font-semibold"
          style="font-family: var(--font-display); color: var(--vault-on-bg)"
        >
          About Dev
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          D4vRAM369 · GitHub · BuyMeACoffee
        </p>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--vault-on-bg-muted)"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>

  <!-- ── Atajos de teclado ─────────────────────────────────────────────────── -->
  <div class="mt-6 mb-2">
    <button
      onclick={() => (showShortcuts = !showShortcuts)}
      class="flex items-center gap-1.5 text-xs transition-colors duration-200"
      style="color: var(--vault-on-bg-muted); background: none; border: none; padding: 0; cursor: pointer;"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.color = "var(--vault-on-bg)")}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.color =
          "var(--vault-on-bg-muted)")}
      aria-expanded={showShortcuts}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        style="shrink-0:0; opacity:0.7"
      >
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <line x1="6" y1="10" x2="6" y2="10" /><line
          x1="10"
          y1="10"
          x2="10"
          y2="10"
        />
        <line x1="14" y1="10" x2="14" y2="10" /><line
          x1="18"
          y1="10"
          x2="18"
          y2="10"
        />
        <line x1="6" y1="14" x2="6" y2="14" /><line
          x1="18"
          y1="14"
          x2="18"
          y2="14"
        />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
      <span style="font-family: var(--font-body)">{t('settings.shortcuts')}</span>
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        style="transition: transform 0.22s ease; transform: rotate({showShortcuts
          ? 180
          : 0}deg); opacity:0.5"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      style="
      max-height: {showShortcuts ? '420px' : '0'};
      overflow: hidden;
      transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    "
    >
      <div
        class="mt-3 flex flex-col gap-1"
        style="opacity: {showShortcuts
          ? 1
          : 0}; transition: opacity 0.2s ease 0.05s"
      >
        {#each [{ keys: ["Esc"], desc: t('shortcut.back'), ctx: t('shortcut.ctx_global') }, { keys: ["Ctrl", "N"], desc: t('shortcut.add_post'), ctx: t('shortcut.ctx_global') }, { keys: ["/"], desc: t('shortcut.search_posts'), ctx: t('shortcut.ctx_vault') }, { keys: ["Ctrl", "F"], desc: t('shortcut.search_app'), ctx: t('shortcut.ctx_global') }, { keys: ["←", "→"], desc: t('shortcut.navigate'), ctx: t('shortcut.ctx_post') }, { keys: ["Ctrl", "="], desc: t('shortcut.zoom_in'), ctx: t('shortcut.ctx_global') }, { keys: ["Ctrl", "-"], desc: t('shortcut.zoom_out'), ctx: t('shortcut.ctx_global') }, { keys: ["Ctrl", "0"], desc: t('shortcut.zoom_reset'), ctx: t('shortcut.ctx_global') }] as shortcut}
          <div class="flex items-center gap-3 py-1">
            <div
              class="flex items-center gap-1 shrink-0"
              style="min-width: 110px"
            >
              {#each shortcut.keys as key, i}
                {#if i > 0}<span
                    style="color: var(--vault-on-bg-muted); font-size: 9px; opacity:0.5"
                    >+</span
                  >{/if}
                <span
                  style="
                  font-family: var(--font-mono, 'DM Mono', monospace);
                  font-size: 10px;
                  padding: 1px 6px;
                  border-radius: 4px;
                  border: 1px solid var(--vault-kbd-border);
                  background: var(--vault-kbd-bg);
                  color: var(--vault-on-bg);
                  line-height: 1.6;
                ">{key}</span
                >
              {/each}
            </div>
            <span class="text-xs" style="color: var(--vault-on-bg); flex:1"
              >{shortcut.desc}</span
            >
            <span
              class="text-xs"
              style="
              color: var(--vault-on-bg-muted);
              font-family: var(--font-body);
              font-size: 10px;
              opacity: 0.5;
            ">{shortcut.ctx}</span
            >
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<!-- ── Modal About Dev ─────────────────────────────────────────────────── -->
{#if showAboutDev}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.7); backdrop-filter: blur(8px)"
    onclick={() => (showAboutDev = false)}
    role="dialog"
    aria-modal="true"
    aria-label="About Dev"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="rounded-2xl max-w-sm w-full flex flex-col animate-fade-up overflow-hidden"
      style="
        background: linear-gradient(160deg, #0e0e22 0%, #0a0a1a 60%, #0c0e20 100%);
        border: 1px solid rgba(100,120,255,0.22);
        box-shadow: 0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 8px 32px rgba(80,100,255,0.12);
      "
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Accent top bar -->
      <div
        style="height: 2px; background: linear-gradient(90deg, #7C4DFF, #00BCD4, #7C4DFF); opacity: 0.8"
      ></div>

      <!-- Header -->
      <div
        class="flex items-center gap-4 px-6 pt-6 pb-5"
        style="border-bottom: 1px solid rgba(100,120,255,0.10)"
      >
        <div
          class="w-14 h-14 rounded-2xl shrink-0 relative overflow-hidden"
          style="
          border: 1px solid rgba(124,77,255,0.40);
          box-shadow: 0 4px 16px rgba(80,60,200,0.25);
        "
        >
          <img
            src={DEV_AVATAR}
            alt="D4vRAM369"
            style="width:100%; height:100%; object-fit:cover; object-position: center 20%; display:block;"
          />
          <div
            style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(124,77,255,0.15),transparent);pointer-events:none"
          ></div>
        </div>
        <div>
          <p
            class="font-bold"
            style="font-family: var(--font-display); color: #e8e8ff; font-size: 1rem; letter-spacing: -0.01em"
          >
            D4vRAM369
          </p>
          <p
            class="text-xs mt-0.5"
            style="color: rgba(160,175,255,0.65); font-family: var(--font-body)"
          >
            {t('settings.dev_title')}
          </p>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex flex-col gap-2 px-5 py-4">
        <!-- GitHub -->
        <button
          onclick={() =>
            openExternal("https://github.com/D4vRAM369/ThreadsVault-desktop")}
          class="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 text-left"
          style="
            background: rgba(30,38,100,0.55);
            border: 1px solid rgba(80,110,255,0.28);
            color: #c5d0ff;
            backdrop-filter: blur(4px);
          "
          onmouseenter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(40,55,140,0.65)";
            el.style.borderColor = "rgba(100,140,255,0.45)";
            el.style.color = "#dde5ff";
          }}
          onmouseleave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(30,38,100,0.55)";
            el.style.borderColor = "rgba(80,110,255,0.28)";
            el.style.color = "#c5d0ff";
          }}
        >
          <div
            class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style="
            background: rgba(20,30,80,0.8);
            border: 1px solid rgba(80,110,255,0.30);
          "
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color:#c5d0ff"
            >
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <span style="font-family: var(--font-display)"
              >GitHub — ThreadsVault</span
            >
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            style="opacity:0.4; shrink-0:0"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <!-- BuyMeACoffee -->
        <button
          onclick={() => openExternal("https://buymeacoffee.com/d4vram369")}
          class="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 text-left"
          style="
            background: rgba(60,44,8,0.50);
            border: 1px solid rgba(200,155,20,0.28);
            color: #f0c44a;
          "
          onmouseenter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(80,60,10,0.65)";
            el.style.borderColor = "rgba(220,175,40,0.45)";
          }}
          onmouseleave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(60,44,8,0.50)";
            el.style.borderColor = "rgba(200,155,20,0.28)";
          }}
        >
          <div
            class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style="
            background: rgba(40,28,4,0.8);
            border: 1px solid rgba(200,155,20,0.30);
            font-size: 0.95rem; line-height: 1;
          "
          >
            ☕
          </div>
          <div class="flex-1 min-w-0">
            <span style="font-family: var(--font-display)">BuyMeACoffee</span>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            style="opacity:0.4; shrink-0:0"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <!-- Close -->
      <div class="px-5 pb-5">
        <button
          onclick={() => (showAboutDev = false)}
          class="w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
          style="
            background: rgba(255,255,255,0.04);
            color: rgba(160,175,220,0.55);
            border: 1px solid rgba(100,120,255,0.12);
            font-family: var(--font-display);
            letter-spacing: 0.04em;
          "
          onmouseenter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(255,255,255,0.07)";
            el.style.color = "rgba(180,195,240,0.80)";
          }}
          onmouseleave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(255,255,255,0.04)";
            el.style.color = "rgba(160,175,220,0.55)";
          }}>CERRAR</button
        >
      </div>
    </div>
  </div>
{/if}

<!-- ── Modal de importación ──────────────────────────────────────────────
  El modal NUNCA se cierra solo. Muestra 4 estados secuenciales:
    confirm  → botones "Importar y reemplazar" / "Cancelar"
    importing→ spinner + "Importando…"
    success  → resumen con posts/categorías importados + "Ver mi vault →"
    error    → mensaje de error + "Reintentar" / "Cerrar"
  El overlay solo permite cerrar en estado confirm (no durante importación ni éxito).
-->
{#if pendingFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.75); backdrop-filter: blur(10px)"
    onclick={() => {
      if (modalPhase === "confirm") closeModal();
    }}
    role="dialog"
    aria-modal="true"
    aria-label={t('settings.import_backup')}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="glass rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 animate-fade-up"
      onclick={(e) => e.stopPropagation()}
    >
      {#if modalPhase === "confirm"}
        <!-- ── Estado 1: Confirmación ── -->
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f87171"
              stroke-width="2"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p
              class="font-bold text-sm"
              style="font-family: var(--font-display); color: var(--vault-on-bg)"
            >
              {t('settings.import_question')}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              {pendingFile.name}
            </p>
          </div>
        </div>

        <p
          class="text-sm"
          style="color: var(--vault-on-bg-muted); line-height: 1.6"
        >
          Esto <strong style="color: #f87171"
            >{t('settings.delete_warning')}</strong
          >
          {t('settings.import_warning_suffix')}
        </p>

        <div class="flex gap-2">
          <button
            onclick={doImport}
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
            style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3)"
            onmouseenter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.25)")}
            onmouseleave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.15)")}>{t('settings.import_replace')}</button
          >
          <button
            onclick={closeModal}
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
            onmouseenter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--vault-surface-hover)")}
            onmouseleave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--vault-surface)")}>{t('common.cancel')}</button
          >
        </div>
      {:else if modalPhase === "importing"}
        <!-- ── Estado 2: Importando (spinner) ── -->
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style="background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.25)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--vault-secondary)"
              stroke-width="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p
              class="font-bold text-sm"
              style="font-family: var(--font-display); color: var(--vault-on-bg)"
            >
              {t('settings.importing')}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              {pendingFile.name}
            </p>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3 py-3">
          <div
            class="w-10 h-10 rounded-full animate-spin"
            style="
            border: 2.5px solid rgba(0,188,212,0.15);
            border-top-color: var(--vault-secondary);
            border-right-color: var(--vault-primary);
          "
          ></div>
          <div class="text-center">
            <p
              class="text-sm font-semibold"
              style="color: var(--vault-on-bg); font-family: var(--font-display)"
            >
              {t('settings.processing')}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              {t('settings.processing_detail')}
            </p>
          </div>
        </div>
      {:else if modalPhase === "success" && importResult}
        <!-- ── Estado 3: Éxito — resumen concluyente ── -->
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style="background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4ade80"
              stroke-width="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p
              class="font-bold text-sm"
              style="font-family: var(--font-display); color: var(--vault-on-bg)"
            >
              {t('settings.import_completed')}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              {pendingFile.name}
            </p>
          </div>
        </div>

        <!-- Resumen con cifras -->
        <div class="flex gap-2">
          <div
            class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl"
            style="
            background: rgba(74,222,128,0.07);
            border: 1px solid rgba(74,222,128,0.18);
          "
          >
            <span
              class="text-xl font-bold"
              style="font-family: var(--font-display); color: #4ade80"
            >
              {importResult.posts}
            </span>
            <span class="text-xs" style="color: var(--vault-on-bg-muted)">
              post{importResult.posts !== 1 ? "s" : ""}
            </span>
          </div>
          <div
            class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl"
            style="
            background: rgba(0,188,212,0.07);
            border: 1px solid rgba(0,188,212,0.18);
          "
          >
            <span
              class="text-xl font-bold"
              style="font-family: var(--font-display); color: var(--vault-secondary)"
            >
              {importResult.categories}
            </span>
            <span class="text-xs" style="color: var(--vault-on-bg-muted)">
              categoría{importResult.categories !== 1 ? "s" : ""}
            </span>
          </div>
          {#if importResult.errors > 0}
            <div
              class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl"
              style="
              background: rgba(251,191,36,0.07);
              border: 1px solid rgba(251,191,36,0.18);
            "
            >
              <span
                class="text-xl font-bold"
                style="font-family: var(--font-display); color: #fbbf24"
              >
                {importResult.errors}
              </span>
              <span class="text-xs" style="color: var(--vault-on-bg-muted)"
                >omitido{importResult.errors !== 1 ? "s" : ""}</span
              >
            </div>
          {/if}
        </div>

        {#if importResult.errors > 0}
          <p
            class="text-xs"
            style="color: var(--vault-on-bg-muted); line-height: 1.5"
          >
            {t('settings.import_skipped_note')}
          </p>
        {/if}

        <button
          onclick={goToVault}
          class="w-full py-3 rounded-xl text-sm font-bold transition-all duration-300 text-white"
          style="
            background: linear-gradient(135deg, var(--vault-primary) 0%, var(--vault-secondary) 100%);
            box-shadow: 0 4px 16px rgba(124,77,255,0.35);
            font-family: var(--font-display);
          "
          onmouseenter={(e) =>
            ((e.currentTarget as HTMLElement).style.boxShadow =
              "0 6px 22px rgba(124,77,255,0.55)")}
          onmouseleave={(e) =>
            ((e.currentTarget as HTMLElement).style.boxShadow =
              "0 4px 16px rgba(124,77,255,0.35)")}>{t('settings.view_vault')}</button
        >
      {:else if modalPhase === "error"}
        <!-- ── Estado 4: Error — dentro del modal, no barra roja ── -->
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f87171"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p
              class="font-bold text-sm"
              style="font-family: var(--font-display); color: var(--vault-on-bg)"
            >
              {t('settings.import_error_title')}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              {pendingFile.name}
            </p>
          </div>
        </div>

        <div
          class="px-3 py-2.5 rounded-xl text-xs"
          style="
          background: rgba(239,68,68,0.09);
          border: 1px solid rgba(239,68,68,0.22);
          color: #fca5a5;
          font-family: var(--font-body);
          line-height: 1.6;
          word-break: break-word;
        "
        >
          {importError || t('settings.import_error_fallback')}
        </div>

        <div class="flex gap-2">
          <button
            onclick={() => {
              modalPhase = "confirm";
              importError = "";
            }}
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
            style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.28)"
            onmouseenter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.22)")}
            onmouseleave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.12)")}>{t('common.retry')}</button
          >
          <button
            onclick={closeModal}
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
            onmouseenter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--vault-surface-hover)")}
            onmouseleave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--vault-surface)")}>{t('common.close')}</button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}
