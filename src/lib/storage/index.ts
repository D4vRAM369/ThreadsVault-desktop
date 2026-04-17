import type { StorageAdapter } from './adapter'

export type DataSpace = 'pc' | 'android'

const ACTIVE_SPACE_KEY = 'threadsvault.active-data-space'

const SPACE_CONFIG: Record<DataSpace, { sqlite: string; dexie: string }> = {
  pc: {
    sqlite: 'threadsvault.db',
    dexie: 'threadsvault',
  },
  android: {
    sqlite: 'threadsvault-android.db',
    dexie: 'threadsvault_android',
  },
}

const _adapters = new Map<DataSpace, StorageAdapter>()
// Singleton promise por espacio: evita inicializaciones paralelas duplicadas.
const _initPromises = new Map<DataSpace, Promise<StorageAdapter>>()

function readPersistedSpace(): DataSpace {
  if (typeof window === 'undefined') return 'pc'
  const raw = window.localStorage.getItem(ACTIVE_SPACE_KEY)
  return raw === 'android' ? 'android' : 'pc'
}

let _activeSpace: DataSpace = readPersistedSpace()

export function getActiveSpace(): DataSpace {
  return _activeSpace
}

export async function setActiveSpace(space: DataSpace): Promise<void> {
  _activeSpace = space
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_SPACE_KEY, space)
  }
  await getStorageForSpace(space)
}

export async function getStorageForSpace(space: DataSpace): Promise<StorageAdapter> {
  const cached = _adapters.get(space)
  if (cached) return cached

  const pending = _initPromises.get(space)
  if (pending) return pending

  const initPromise = (async () => {
    // __TAURI_INTERNALS__ es inyectado por Tauri en la ventana nativa.
    // Si existe → desktop (SQLite). Si no → navegador (IndexedDB).
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    const config = SPACE_CONFIG[space]

    if (isTauri) {
      const { SqliteStorage } = await import('./sqlite')
      const s = new SqliteStorage(config.sqlite)
      await s.init()
      _adapters.set(space, s)
      return s
    }

    const { DexieStorage } = await import('./dexie')
    const d = new DexieStorage(config.dexie)
    await d.init()
    _adapters.set(space, d)
    return d
  })()

  _initPromises.set(space, initPromise)
  return initPromise
}

export async function getStorage(): Promise<StorageAdapter> {
  return getStorageForSpace(getActiveSpace())
}
