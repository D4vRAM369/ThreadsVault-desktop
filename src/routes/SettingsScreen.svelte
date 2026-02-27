<script lang="ts">
  import { getStorage } from '../lib/storage/index'
  import { loadVault } from '../lib/stores/vault'

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

<div class="max-w-lg mx-auto px-4 py-6">
  <div class="flex items-center gap-3 mb-6">
    <button
      onclick={() => window.location.hash = '#/'}
      class="opacity-60 hover:opacity-100 transition-opacity"
    >←</button>
    <h1 class="text-lg font-bold">Ajustes</h1>
  </div>

  <!-- Backup -->
  <section
    class="rounded-xl p-5 mb-4"
    style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
  >
    <h2 class="font-semibold mb-1">Backup & Restore</h2>
    <p class="text-sm opacity-60 mb-4">
      Compatible con ThreadsVault Android. Exporta e importa el mismo JSON.
    </p>

    <button
      onclick={handleExport}
      class="w-full py-2.5 rounded-xl text-sm font-medium text-white mb-3 transition-opacity"
      style="background: var(--vault-primary)"
    >
      {exportStatus === 'success' ? '✓ Backup exportado' : '⬇ Exportar backup JSON'}
    </button>

    <label
      class="w-full py-2.5 rounded-xl text-sm font-medium text-center block cursor-pointer transition-opacity hover:opacity-80"
      style="border: 1px dashed rgba(124,77,255,0.4); color: var(--vault-on-bg)"
    >
      {importStatus === 'success' ? '✓ Backup restaurado' : '⬆ Importar backup JSON'}
      <input type="file" accept=".json" class="hidden" onchange={handleImport} />
    </label>

    {#if importStatus === 'error'}
      <p class="text-sm mt-2" style="color: #f87171">{importError}</p>
    {/if}
  </section>

  <!-- Acerca de -->
  <section
    class="rounded-xl p-5"
    style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
  >
    <h2 class="font-semibold mb-1">Acerca de</h2>
    <p class="text-sm opacity-60">ThreadsVault Desktop v1.0.0</p>
    <p class="text-sm opacity-40 mt-1">Privacy-first · Sin cloud · Sin tracking.</p>
  </section>
</div>
