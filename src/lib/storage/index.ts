import type { StorageAdapter } from './adapter'

let _adapter: StorageAdapter | null = null

export async function getStorage(): Promise<StorageAdapter> {
  if (_adapter) return _adapter

  // __TAURI_INTERNALS__ es inyectado por Tauri en la ventana nativa.
  // Si existe → desktop (SQLite). Si no → navegador (IndexedDB).
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  if (isTauri) {
    const { SqliteStorage } = await import('./sqlite')
    const s = new SqliteStorage()
    await s.init()
    _adapter = s
  } else {
    const { DexieStorage } = await import('./dexie')
    const d = new DexieStorage()
    await d.init()   // espera a que el seed de categorías termine
    _adapter = d
  }

  return _adapter
}
