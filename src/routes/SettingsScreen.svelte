<script lang="ts">
  import { getStorage } from '../lib/storage/index'
  import { loadVault } from '../lib/stores/vault'
  import CategoryManager from '../components/CategoryManager.svelte'
  import type { ImportResult } from '../lib/storage/adapter'

  import { invoke } from '@tauri-apps/api/core'

  let exportStatus = $state<'idle' | 'success' | 'error'>('idle')
  let exportSavedPath = $state('')
  // pendingFile: archivo seleccionado mientras el usuario decide si confirmar.
  let pendingFile    = $state<File | null>(null)
  // modalPhase: controla qué vista muestra el modal (sin afectar pendingFile).
  let modalPhase     = $state<'confirm' | 'importing' | 'success' | 'error'>('confirm')
  let importResult   = $state<ImportResult | null>(null)
  let importError    = $state('')
  let showAboutDev   = $state(false)
  let showShortcuts  = $state(false)

  async function openExternal(url: string) {
    if ('__TAURI_INTERNALS__' in window) {
      await invoke('open_url', { url })
    } else {
      window.open(url, '_blank', 'noopener')
    }
  }

  async function handleExport() {
    const storage  = await getStorage()
    const json     = await storage.exportBackup()
    const filename = `threadsvault-backup-${Date.now()}.json`

    if ('__TAURI_INTERNALS__' in window) {
      // En Tauri: WebView2 descarta los downloads via Blob URL.
      // Usamos el comando Rust save_backup que escribe directamente en ~/Downloads.
      try {
        const savedPath = await invoke<string>('save_backup', { content: json, filename })
        exportSavedPath = savedPath
        exportStatus    = 'success'
        setTimeout(() => { exportStatus = 'idle'; exportSavedPath = '' }, 6000)
      } catch {
        exportStatus = 'error'
        setTimeout(() => exportStatus = 'idle', 3000)
      }
    } else {
      // Fallback modo browser web
      const blob = new Blob([json], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      exportStatus = 'success'
      setTimeout(() => exportStatus = 'idle', 3000)
    }
  }

  // Paso 1: el usuario selecciona un archivo → mostrar modal de confirmación.
  function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    pendingFile  = file
    modalPhase   = 'confirm'
    importResult = null
    importError  = ''
    ;(e.target as HTMLInputElement).value = ''
  }

  function closeModal() {
    pendingFile = null
    modalPhase  = 'confirm'
    importResult = null
    importError  = ''
  }

  // Paso 2: el usuario confirmó → ejecutar importación.
  async function doImport() {
    if (!pendingFile) return

    modalPhase  = 'importing'
    importError = ''

    let json: string
    try {
      json = await pendingFile.text()
    } catch {
      importError = 'No se pudo leer el archivo seleccionado.'
      modalPhase  = 'error'
      return
    }

    try {
      const storage = await getStorage()
      const result  = await storage.importBackup(json)
      await loadVault()
      importResult = result
      modalPhase   = 'success'
    } catch (err) {
      importError = err instanceof Error
        ? (err.message || 'Error desconocido al importar')
        : String(err)
      modalPhase = 'error'
    }
  }

  function goToVault() {
    closeModal()
    window.location.hash = '#/'
  }
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fade-up">

  <!-- Header navegación — mismo patrón que ShareScreen -->
  <div class="flex items-center gap-3 mb-6 sm:mb-8">
    <button
      onclick={() => window.location.hash = '#/'}
      class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
      style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
      aria-label="Volver"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--vault-on-bg)">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--vault-on-bg)">
        Ajustes
      </h1>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">Categorías · Backup · Privacidad</p>
    </div>
  </div>

  <div class="mb-6 sm:mb-7">
    <CategoryManager compact={true} />
  </div>

  <!-- ── Sección: Backup & Restore ─────────────────────── -->
  <p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  ">Datos</p>

  <div class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7" style="
    border: 1px solid var(--vault-section-border);
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  ">
    <!-- Fila: Exportar -->
    <button
      onclick={handleExport}
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 text-left"
      style="background: rgba(255,255,255,0.06)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
    >
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="
        background: rgba(124,77,255,0.18);
        border: 1px solid rgba(124,77,255,0.3);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-primary)" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold" style="font-family: var(--font-display); color: var(--vault-on-bg)">
          Exportar backup
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          Guarda tus posts en JSON
        </p>
      </div>
      {#if exportStatus === 'success'}
        <span class="text-xs font-semibold" style="color: #4ade80; font-family: var(--font-display)">✓ Guardado</span>
      {:else if exportStatus === 'error'}
        <span class="text-xs font-semibold" style="color: #f87171; font-family: var(--font-display)">✗ Error</span>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-on-bg-muted)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      {/if}
    </button>

    <!-- Ruta de guardado -->
    {#if exportStatus === 'success' && exportSavedPath}
      <div class="px-4 sm:px-5 pb-2" style="animation: fadeIn 0.2s ease">
        <p class="text-xs font-mono" style="
          color: #4ade80;
          opacity: 0.85;
          word-break: break-all;
          line-height: 1.5;
        ">📁 {exportSavedPath}</p>
      </div>
    {/if}

    <!-- Separador -->
    <div style="height: 1px; background: rgba(255,255,255,0.07); margin: 0 16px"></div>

    <!-- Fila: Importar -->
    <label
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 cursor-pointer"
      style="background: rgba(255,255,255,0.06); display:flex"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
    >
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="
        background: rgba(0,188,212,0.15);
        border: 1px solid rgba(0,188,212,0.28);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-secondary)" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold" style="font-family: var(--font-display); color: var(--vault-on-bg)">
          Importar backup
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">
          Compatible con ThreadsVault Android
        </p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-on-bg-muted)" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <input type="file" accept=".json" class="hidden" onchange={handleImport} />
    </label>
  </div>

  <!-- ── Sección: Privacidad ──────────────────────────── -->
  <p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  ">Privacidad</p>

  <div class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7" style="
    border: 1px solid var(--vault-section-border);
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  ">
    {#each [
      { icon: '🔒', label: 'Todo local', desc: 'Los datos nunca salen de tu dispositivo' },
      { icon: '☁️', label: 'Sin cloud',   desc: 'No hay sincronización ni servidores' },
      { icon: '🚫', label: 'Sin tracking', desc: 'Cero analíticas, cero publicidad' },
    ] as item, i}
      {#if i > 0}
        <div style="height: 1px; background: rgba(255,255,255,0.07); margin: 0 16px"></div>
      {/if}
      <div class="flex items-center gap-3.5 px-4 sm:px-5 py-3.5" style="background: rgba(255,255,255,0.04)">
        <span style="font-size: 1.1rem; line-height: 1">{item.icon}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold" style="font-family: var(--font-display); color: var(--vault-on-bg)">{item.label}</p>
          <p class="text-xs" style="color: var(--vault-on-bg-muted)">{item.desc}</p>
        </div>
      </div>
    {/each}
  </div>

  <!-- ── Acerca de ──────────────────────────────────── -->
  <p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  ">Acerca de</p>

  <div class="rounded-2xl sm:rounded-3xl overflow-hidden" style="
    border: 1px solid rgba(255,255,255,0.09);
  ">
    <!-- Fila: info de la app -->
    <div class="flex items-center gap-3.5 p-4 sm:p-5" style="background: rgba(255,255,255,0.04)">
      <div class="w-10 h-10 rounded-full overflow-hidden shrink-0" style="box-shadow: 0 3px 12px rgba(0,0,0,0.5)">
        <img src="/icon-app.png" alt="ThreadsVault" style="width:100%; height:100%; object-fit:cover; display:block;" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-sm" style="font-family: var(--font-brand); color: var(--vault-on-bg)">
          ThreadsVault
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">Desktop v2.0.0 · Privacy-first</p>
      </div>
      <span class="text-xs px-2 py-1 rounded-full" style="
        background: rgba(124,77,255,0.12);
        border: 1px solid rgba(124,77,255,0.25);
        color: var(--vault-primary);
        font-family: var(--font-display);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
      ">v2.0</span>
    </div>

    <!-- Separador -->
    <div style="height: 1px; background: rgba(255,255,255,0.07); margin: 0 16px"></div>

    <!-- Fila: About Dev -->
    <button
      onclick={() => showAboutDev = true}
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 text-left"
      style="background: rgba(255,255,255,0.04)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
    >
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="
        background: rgba(124,77,255,0.14);
        border: 1px solid rgba(124,77,255,0.28);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-primary)" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold" style="font-family: var(--font-display); color: var(--vault-on-bg)">
          About Dev
        </p>
        <p class="text-xs" style="color: var(--vault-on-bg-muted)">D4vRAM369 · GitHub · BuyMeACoffee</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-on-bg-muted)" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  </div>

  <!-- ── Atajos de teclado ─────────────────────────────────────────────────── -->
  <div class="mt-6 mb-2">
    <button
      onclick={() => showShortcuts = !showShortcuts}
      class="flex items-center gap-1.5 text-xs transition-colors duration-200"
      style="color: var(--vault-on-bg-muted); background: none; border: none; padding: 0; cursor: pointer;"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--vault-on-bg)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--vault-on-bg-muted)'}
      aria-expanded={showShortcuts}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="shrink-0:0; opacity:0.7">
        <rect x="2" y="6" width="20" height="14" rx="2"/>
        <line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/>
        <line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/>
        <line x1="6" y1="14" x2="6" y2="14"/><line x1="18" y1="14" x2="18" y2="14"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
      <span style="font-family: var(--font-body)">Atajos de teclado</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        style="transition: transform 0.22s ease; transform: rotate({showShortcuts ? 180 : 0}deg); opacity:0.5"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <div style="
      max-height: {showShortcuts ? '420px' : '0'};
      overflow: hidden;
      transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    ">
      <div class="mt-3 flex flex-col gap-1" style="opacity: {showShortcuts ? 1 : 0}; transition: opacity 0.2s ease 0.05s">
        {#each [
          { keys: ['Esc'],          desc: 'Volver atrás',                  ctx: 'Global' },
          { keys: ['Ctrl', 'N'],    desc: 'Añadir post',                   ctx: 'Global' },
          { keys: ['/'],            desc: 'Buscar posts',                  ctx: 'En vault' },
          { keys: ['Ctrl', 'F'],    desc: 'Buscar en la app',              ctx: 'Global' },
          { keys: ['←', '→'],      desc: 'Navegar entre posts',           ctx: 'En post' },
          { keys: ['Ctrl', '='],   desc: 'Acercar (zoom in)',              ctx: 'Global' },
          { keys: ['Ctrl', '-'],   desc: 'Alejar (zoom out)',              ctx: 'Global' },
          { keys: ['Ctrl', '0'],   desc: 'Zoom normal',                   ctx: 'Global' },
        ] as shortcut}
          <div class="flex items-center gap-3 py-1">
            <div class="flex items-center gap-1 shrink-0" style="min-width: 110px">
              {#each shortcut.keys as key, i}
                {#if i > 0}<span style="color: var(--vault-on-bg-muted); font-size: 9px; opacity:0.5">+</span>{/if}
                <span style="
                  font-family: var(--font-mono, 'DM Mono', monospace);
                  font-size: 10px;
                  padding: 1px 6px;
                  border-radius: 4px;
                  border: 1px solid rgba(255,255,255,0.13);
                  background: rgba(255,255,255,0.05);
                  color: var(--vault-on-bg);
                  line-height: 1.6;
                ">{key}</span>
              {/each}
            </div>
            <span class="text-xs" style="color: var(--vault-on-bg); flex:1">{shortcut.desc}</span>
            <span class="text-xs" style="
              color: var(--vault-on-bg-muted);
              font-family: var(--font-body);
              font-size: 10px;
              opacity: 0.5;
            ">{shortcut.ctx}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

</div>

<!-- ── Modal About Dev ─────────────────────────────────────────────────── -->
{#if showAboutDev}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.7); backdrop-filter: blur(8px)"
    onclick={() => showAboutDev = false}
    role="dialog"
    aria-modal="true"
    aria-label="About Dev"
  >
    <div
      class="glass rounded-2xl p-6 max-w-sm w-full flex flex-col gap-5 animate-fade-up"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="
          background: linear-gradient(135deg, rgba(124,77,255,0.25), rgba(0,188,212,0.15));
          border: 1px solid rgba(124,77,255,0.35);
          font-size: 1.4rem; line-height: 1;
        ">👨‍💻</div>
        <div>
          <p class="font-bold text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg)">
            D4vRAM369
          </p>
          <p class="text-xs" style="color: var(--vault-on-bg-muted)">Desarrollador de ThreadsVault</p>
        </div>
      </div>

      <div class="flex flex-col gap-2.5">
        <button
          onclick={() => openExternal('https://github.com/D4vRAM369/ThreadsVault-desktop')}
          class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 text-left"
          style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: var(--vault-on-bg)"
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color: var(--vault-on-bg); shrink-0: 0">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span>GitHub — ThreadsVault</span>
        </button>

        <button
          onclick={() => openExternal('https://buymeacoffee.com/d4vram369')}
          class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 text-left"
          style="background: rgba(255,212,0,0.08); border: 1px solid rgba(255,212,0,0.2); color: #ffd700"
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,212,0,0.14)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,212,0,0.08)'}
        >
          <span style="font-size: 1.1rem; line-height: 1">☕</span>
          <span>BuyMeACoffee</span>
        </button>
      </div>

      <button
        onclick={() => showAboutDev = false}
        class="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
        style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
        onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
        onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
      >Cerrar</button>
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
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.75); backdrop-filter: blur(10px)"
    onclick={() => { if (modalPhase === 'confirm') closeModal() }}
    role="dialog"
    aria-modal="true"
    aria-label="Importar backup"
  >
    <div
      class="glass rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 animate-fade-up"
      onclick={(e) => e.stopPropagation()}
    >

      {#if modalPhase === 'confirm'}
        <!-- ── Estado 1: Confirmación ── -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <p class="font-bold text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg)">
              ¿Importar este backup?
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">{pendingFile.name}</p>
          </div>
        </div>

        <p class="text-sm" style="color: var(--vault-on-bg-muted); line-height: 1.6">
          Esto <strong style="color: #f87171">borrará todos tus posts y categorías actuales</strong>
          y los reemplazará con los del archivo seleccionado. Esta acción no se puede deshacer.
        </p>

        <div class="flex gap-2">
          <button
            onclick={doImport}
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
            style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.25)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'}
          >Importar y reemplazar</button>
          <button
            onclick={closeModal}
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
          >Cancelar</button>
        </div>

      {:else if modalPhase === 'importing'}
        <!-- ── Estado 2: Importando (spinner) ── -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style="background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.25)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vault-secondary)" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <p class="font-bold text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg)">
              Importando backup…
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">{pendingFile.name}</p>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3 py-3">
          <div class="w-10 h-10 rounded-full animate-spin" style="
            border: 2.5px solid rgba(0,188,212,0.15);
            border-top-color: var(--vault-secondary);
            border-right-color: var(--vault-primary);
          "></div>
          <div class="text-center">
            <p class="text-sm font-semibold" style="color: var(--vault-on-bg); font-family: var(--font-display)">
              Procesando…
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">
              Posts, categorías y media
            </p>
          </div>
        </div>

      {:else if modalPhase === 'success' && importResult}
        <!-- ── Estado 3: Éxito — resumen concluyente ── -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style="background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div>
            <p class="font-bold text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg)">
              Importación completada
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">{pendingFile.name}</p>
          </div>
        </div>

        <!-- Resumen con cifras -->
        <div class="flex gap-2">
          <div class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl" style="
            background: rgba(74,222,128,0.07);
            border: 1px solid rgba(74,222,128,0.18);
          ">
            <span class="text-xl font-bold" style="font-family: var(--font-display); color: #4ade80">
              {importResult.posts}
            </span>
            <span class="text-xs" style="color: var(--vault-on-bg-muted)">
              post{importResult.posts !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl" style="
            background: rgba(0,188,212,0.07);
            border: 1px solid rgba(0,188,212,0.18);
          ">
            <span class="text-xl font-bold" style="font-family: var(--font-display); color: var(--vault-secondary)">
              {importResult.categories}
            </span>
            <span class="text-xs" style="color: var(--vault-on-bg-muted)">
              categoría{importResult.categories !== 1 ? 's' : ''}
            </span>
          </div>
          {#if importResult.errors > 0}
            <div class="flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl" style="
              background: rgba(251,191,36,0.07);
              border: 1px solid rgba(251,191,36,0.18);
            ">
              <span class="text-xl font-bold" style="font-family: var(--font-display); color: #fbbf24">
                {importResult.errors}
              </span>
              <span class="text-xs" style="color: var(--vault-on-bg-muted)">omitido{importResult.errors !== 1 ? 's' : ''}</span>
            </div>
          {/if}
        </div>

        {#if importResult.errors > 0}
          <p class="text-xs" style="color: var(--vault-on-bg-muted); line-height: 1.5">
            Los elementos omitidos tenían datos incompatibles. El resto se importó correctamente.
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
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 22px rgba(124,77,255,0.55)'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(124,77,255,0.35)'}
        >Ver mi vault →</button>

      {:else if modalPhase === 'error'}
        <!-- ── Estado 4: Error — dentro del modal, no barra roja ── -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <p class="font-bold text-sm" style="font-family: var(--font-display); color: var(--vault-on-bg)">
              Error al importar
            </p>
            <p class="text-xs mt-0.5" style="color: var(--vault-on-bg-muted)">{pendingFile.name}</p>
          </div>
        </div>

        <div class="px-3 py-2.5 rounded-xl text-xs" style="
          background: rgba(239,68,68,0.09);
          border: 1px solid rgba(239,68,68,0.22);
          color: #fca5a5;
          font-family: var(--font-body);
          line-height: 1.6;
          word-break: break-word;
        ">{importError || 'No se pudo completar la importación. Verifica que el archivo sea un backup válido de ThreadsVault.'}</div>

        <div class="flex gap-2">
          <button
            onclick={() => { modalPhase = 'confirm'; importError = '' }}
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
            style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.28)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.22)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'}
          >Reintentar</button>
          <button
            onclick={closeModal}
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style="background: var(--vault-surface); color: var(--vault-on-bg-muted); border: 1px solid var(--vault-border)"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
          >Cerrar</button>
        </div>
      {/if}

    </div>
  </div>
{/if}
