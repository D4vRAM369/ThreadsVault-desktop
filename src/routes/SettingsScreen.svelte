<script lang="ts">
  import { getStorage } from '../lib/storage/index'
  import { loadVault } from '../lib/stores/vault'
  import CategoryManager from '../components/CategoryManager.svelte'

  let exportStatus = $state<'idle' | 'success' | 'error'>('idle')
  let importStatus = $state<'idle' | 'success' | 'error'>('idle')
  let importError  = $state('')

  async function handleExport() {
    const storage = await getStorage()
    const json    = await storage.exportBackup()
    const blob    = new Blob([json], { type: 'application/json' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href        = url
    a.download    = `threadsvault-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    exportStatus  = 'success'
    setTimeout(() => exportStatus = 'idle', 3000)
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const json    = await file.text()
      const storage = await getStorage()
      await storage.importBackup(json)
      await loadVault()
      importStatus = 'success'
      setTimeout(() => importStatus = 'idle', 3000)
    } catch (err) {
      importError  = (err as Error).message
      importStatus = 'error'
    }
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
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">Categorias · Backup · Privacidad</p>
    </div>
  </div>

  <div class="mb-6 sm:mb-7">
    <CategoryManager compact={true} />
  </div>

  <!-- ── Sección: Backup & Restore ─────────────────────── -->
  <!--
    PBL: Usamos label="BACKUP" con mayúsculas y tracking-widest
    para crear jerarquía visual tipo "settings iOS".
    El truco es: sección header pequeño + contenido debajo.
  -->
  <p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  ">Datos</p>

  <div class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7" style="
    border: 1px solid rgba(255,255,255,0.11);
    box-shadow: 0 4px 24px rgba(0,0,0,0.28);
  ">
    <!-- Fila: Exportar -->
    <button
      onclick={handleExport}
      class="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 transition-all duration-200 text-left"
      style="background: rgba(255,255,255,0.06)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
    >
      <!-- Icono en contenedor de color -->
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
        <span class="text-xs font-semibold" style="color: #4ade80; font-family: var(--font-display)">✓ Listo</span>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-on-bg-muted)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      {/if}
    </button>

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
      {#if importStatus === 'success'}
        <span class="text-xs font-semibold" style="color: #4ade80; font-family: var(--font-display)">✓ Listo</span>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vault-on-bg-muted)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      {/if}
      <input type="file" accept=".json" class="hidden" onchange={handleImport} />
    </label>
  </div>

  {#if importStatus === 'error'}
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs mb-4" style="
      background: rgba(239,68,68,0.09);
      border: 1px solid rgba(239,68,68,0.22);
      color: #fca5a5;
      font-family: var(--font-display);
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {importError}
    </div>
  {/if}

  <!-- ── Sección: Privacidad ──────────────────────────── -->
  <p class="text-xs font-semibold uppercase mb-2.5 px-1" style="
    color: var(--vault-on-bg-muted);
    font-family: var(--font-display);
    letter-spacing: 0.12em;
  ">Privacidad</p>

  <div class="rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-7" style="
    border: 1px solid rgba(255,255,255,0.11);
    box-shadow: 0 4px 24px rgba(0,0,0,0.28);
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

  <div class="rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex items-center gap-3.5" style="
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
  ">
    <div class="w-10 h-10 rounded-full overflow-hidden shrink-0" style="box-shadow: 0 3px 12px rgba(0,0,0,0.5)">
      <img src="/icon-app.png" alt="ThreadsVault" style="width:100%; height:100%; object-fit:cover; display:block;" />
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-bold text-sm" style="font-family: var(--font-brand); color: var(--vault-on-bg)">
        ThreadsVault
      </p>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">Desktop v1.0.0 · Privacy-first</p>
    </div>
    <span class="text-xs px-2 py-1 rounded-full" style="
      background: rgba(124,77,255,0.12);
      border: 1px solid rgba(124,77,255,0.25);
      color: var(--vault-primary);
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
    ">v1.0</span>
  </div>
</div>
