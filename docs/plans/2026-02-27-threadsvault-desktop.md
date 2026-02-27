# ThreadsVault Desktop & PWA — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construir ThreadsVault como app de escritorio (Tauri v2) y PWA desde un único codebase Svelte 5 + TypeScript + Vite, produciendo `.exe`, `.AppImage`, `.deb`, Flatpak y PWA deployable en GitHub Pages.

**Architecture:** Monorepo con capa de abstracción `StorageAdapter` que enruta a Dexie.js (IndexedDB) en PWA y a `tauri-plugin-sql` (SQLite) en desktop. La UI en Svelte es idéntica para ambas plataformas. El backup JSON es compatible con el esquema del Android app.

**Tech Stack:** Svelte 5, TypeScript, Vite 7, Tailwind CSS v4, Dexie.js, Tauri v2, tauri-plugin-sql, Vitest, @testing-library/svelte

---

## Task 1: Configurar Tailwind CSS v4

**Por qué:** `@tailwindcss/vite` ya está instalado pero no conectado a Vite. Sin este paso, las clases Tailwind no generan CSS.

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/app.css`

**Step 1: Añadir plugin Tailwind a Vite**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
  ],
})
```

**Step 2: Reemplazar app.css con variables de ThreadsVault**

```css
/* src/app.css */
@import "tailwindcss";

:root {
  --vault-primary:   #7C4DFF;
  --vault-secondary: #00BCD4;
  --vault-tertiary:  #26A69A;
  --vault-bg:        #0F0F0F;
  --vault-surface:   #1A1A2E;
  --vault-on-bg:     #E8E8F0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--vault-bg);
  color: var(--vault-on-bg);
  font-family: system-ui, sans-serif;
  min-height: 100vh;
}

#app {
  min-height: 100vh;
}
```

**Step 3: Verificar que el servidor arranca sin errores**

```bash
npm run dev
```

Expected: servidor en `http://localhost:5173` sin errores en consola.

**Step 4: Commit**

```bash
git add vite.config.ts src/app.css
git commit -m "feat: configurar Tailwind CSS v4 con variables ThreadsVault"
```

---

## Task 2: Instalar dependencias y configurar Tauri v2

**Por qué:** Tauri v2 es el motor que empaqueta la app web como binario nativo. `tauri-cli` es la herramienta de línea de comandos. Los plugins son la capa entre Svelte (JS) y el sistema operativo (Rust).

**Prerrequisito sistema:**
```bash
# Windows: instalar Rust
winget install Rustlang.Rustup
rustup update stable

# Linux (Ubuntu/Debian): instalar dependencias del sistema
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

**Step 1: Instalar Tauri CLI**

```bash
cargo install tauri-cli --version "^2"
```

**Step 2: Instalar dependencias frontend**

```bash
npm install dexie
npm install @tauri-apps/api
npm install @tauri-apps/plugin-sql
npm install -D vitest @testing-library/svelte @testing-library/jest-dom jsdom
```

**Por qué cada paquete:**
- `dexie`: wrapper elegante sobre IndexedDB para la PWA
- `@tauri-apps/api`: helpers para detectar entorno Tauri y llamar al backend Rust
- `@tauri-apps/plugin-sql`: cliente JS del plugin SQLite de Tauri
- `vitest`: test runner nativo de Vite (más rápido que Jest, cero config extra)

**Step 3: Inicializar Tauri en el proyecto**

```bash
cargo tauri init
```

Responder a las preguntas así:
```
✔ What is your app name? ThreadsVault
✔ What should the window title be? ThreadsVault
✔ Where are your web assets located? ../dist
✔ What is the URL of your dev server? http://localhost:5173
✔ What is your frontend dev command? npm run dev
✔ What is your frontend build command? npm run build
```

Esto crea la carpeta `src-tauri/`.

**Step 4: Añadir plugins Rust al proyecto Tauri**

```bash
cd src-tauri
cargo add tauri-plugin-sql --features sqlite
cargo add tauri-plugin-fs
cd ..
```

**Step 5: Registrar plugins en main.rs**

```rust
// src-tauri/src/main.rs
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 6: Verificar que Tauri compila**

```bash
cargo tauri dev
```

Expected: se abre una ventana nativa con la app Svelte de ejemplo. F12 abre DevTools.

**Step 7: Commit**

```bash
git add src-tauri/ package.json package-lock.json
git commit -m "feat: inicializar Tauri v2 con plugins sql y fs"
```

---

## Task 3: Definir tipos y StorageAdapter

**Por qué:** Si defines los tipos primero, el compilador TypeScript te avisa en tiempo de compilación (no en runtime) cuando algo no encaja. Es el equivalente a los `data class` de Kotlin.

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/storage/adapter.ts`
- Create: `src/lib/storage/index.ts`

**Step 1: Escribir tipos base**

```ts
// src/lib/types.ts
export interface Post {
  id: string            // crypto.randomUUID()
  url: string
  author: string        // "@usuario" extraído de URL
  note: string
  categoryId: string
  savedAt: number       // Date.now() — timestamp Unix ms
  previewTitle?: string
  previewImage?: string
}

export interface Category {
  id: string
  name: string
  color: string         // hex: "#7C4DFF"
}

export type AppState = 'loading' | 'success' | 'empty' | 'error'
```

**Step 2: Escribir la interfaz StorageAdapter**

```ts
// src/lib/storage/adapter.ts
import type { Post, Category } from '../types'

export interface StorageAdapter {
  // Posts
  getPosts(): Promise<Post[]>
  getPost(id: string): Promise<Post | null>
  savePost(post: Post): Promise<void>
  deletePost(id: string): Promise<void>

  // Categories
  getCategories(): Promise<Category[]>
  saveCategory(cat: Category): Promise<void>
  deleteCategory(id: string): Promise<void>

  // Backup
  exportBackup(): Promise<string>          // devuelve JSON string
  importBackup(json: string): Promise<void>
}
```

**Step 3: Escribir el test del adapter**

```ts
// src/lib/storage/adapter.test.ts
import { describe, it, expect } from 'vitest'
import type { StorageAdapter } from './adapter'
import type { Post, Category } from '../types'

// Test helper: verifica que cualquier implementación cumple el contrato
export function testStorageAdapter(
  name: string,
  factory: () => StorageAdapter
) {
  describe(`StorageAdapter: ${name}`, () => {
    let adapter: StorageAdapter

    beforeEach(() => {
      adapter = factory()
    })

    it('empieza sin posts', async () => {
      const posts = await adapter.getPosts()
      expect(posts).toEqual([])
    })

    it('guarda y recupera un post', async () => {
      const post: Post = {
        id: 'test-id-1',
        url: 'https://www.threads.net/@testuser/post/abc123',
        author: '@testuser',
        note: 'nota de prueba',
        categoryId: 'cat-1',
        savedAt: Date.now(),
      }
      await adapter.savePost(post)
      const posts = await adapter.getPosts()
      expect(posts).toHaveLength(1)
      expect(posts[0]).toEqual(post)
    })

    it('elimina un post por id', async () => {
      const post: Post = {
        id: 'test-id-2',
        url: 'https://www.threads.net/@user/post/xyz',
        author: '@user',
        note: '',
        categoryId: 'cat-1',
        savedAt: Date.now(),
      }
      await adapter.savePost(post)
      await adapter.deletePost('test-id-2')
      const posts = await adapter.getPosts()
      expect(posts).toHaveLength(0)
    })

    it('exporta backup como JSON válido', async () => {
      const json = await adapter.exportBackup()
      const parsed = JSON.parse(json)
      expect(parsed).toHaveProperty('schemaVersion')
      expect(parsed).toHaveProperty('posts')
      expect(parsed).toHaveProperty('categories')
    })
  })
}
```

**Step 4: Escribir el enrutador de storage**

```ts
// src/lib/storage/index.ts
import type { StorageAdapter } from './adapter'

let _adapter: StorageAdapter | null = null

export async function getStorage(): Promise<StorageAdapter> {
  if (_adapter) return _adapter

  // Detecta si corre dentro de Tauri o en el navegador
  const isTauri = '__TAURI_INTERNALS__' in window

  if (isTauri) {
    const { SqliteStorage } = await import('./sqlite')
    _adapter = new SqliteStorage()
  } else {
    const { DexieStorage } = await import('./dexie')
    _adapter = new DexieStorage()
  }

  return _adapter
}
```

**Por qué `__TAURI_INTERNALS__`:** Es una variable global que Tauri inyecta en el contexto de la ventana. Si existe, estamos en desktop. Si no, estamos en el navegador. Más confiable que `navigator.userAgent`.

**Step 5: Configurar Vitest**

```ts
// vite.config.ts — añadir sección test
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

```ts
// src/test-setup.ts
import '@testing-library/jest-dom'
```

```json
// package.json — añadir script test
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json"
  }
}
```

**Step 6: Verificar que los tests corren**

```bash
npm run test:run
```

Expected: 0 tests run, 0 failures (aún no hay implementaciones).

**Step 7: Commit**

```bash
git add src/lib/ src/test-setup.ts vite.config.ts package.json
git commit -m "feat: definir tipos, StorageAdapter y configurar Vitest"
```

---

## Task 4: Implementar DexieStorage (PWA)

**Por qué:** Dexie es un wrapper sobre IndexedDB. IndexedDB es la base de datos del navegador — persiste datos aunque cierres la pestaña, a diferencia de `localStorage` que está limitada a 5 MB y es síncrona.

**Files:**
- Create: `src/lib/storage/dexie.ts`

**Step 1: Implementar DexieStorage**

```ts
// src/lib/storage/dexie.ts
import Dexie, { type Table } from 'dexie'
import type { StorageAdapter } from './adapter'
import type { Post, Category } from '../types'

const SCHEMA_VERSION = 1
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-default-1', name: 'General',    color: '#7C4DFF' },
  { id: 'cat-default-2', name: 'Inspiración', color: '#00BCD4' },
  { id: 'cat-default-3', name: 'Trabajo',     color: '#26A69A' },
]

class VaultDatabase extends Dexie {
  posts!: Table<Post>
  categories!: Table<Category>

  constructor() {
    super('threadsvault')
    this.version(1).stores({
      posts:      'id, categoryId, savedAt, author',
      categories: 'id, name',
    })
  }
}

export class DexieStorage implements StorageAdapter {
  private db: VaultDatabase

  constructor() {
    this.db = new VaultDatabase()
    this._seedDefaultCategories()
  }

  private async _seedDefaultCategories() {
    const count = await this.db.categories.count()
    if (count === 0) {
      await this.db.categories.bulkAdd(DEFAULT_CATEGORIES)
    }
  }

  async getPosts(): Promise<Post[]> {
    return this.db.posts.orderBy('savedAt').reverse().toArray()
  }

  async getPost(id: string): Promise<Post | null> {
    return (await this.db.posts.get(id)) ?? null
  }

  async savePost(post: Post): Promise<void> {
    await this.db.posts.put(post)
  }

  async deletePost(id: string): Promise<void> {
    await this.db.posts.delete(id)
  }

  async getCategories(): Promise<Category[]> {
    return this.db.categories.toArray()
  }

  async saveCategory(cat: Category): Promise<void> {
    await this.db.categories.put(cat)
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db.categories.delete(id)
  }

  async exportBackup(): Promise<string> {
    const posts = await this.getPosts()
    const categories = await this.getCategories()
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      posts,
      categories,
    }, null, 2)
  }

  async importBackup(json: string): Promise<void> {
    const data = JSON.parse(json)
    if (!data.schemaVersion || !data.posts || !data.categories) {
      throw new Error('Formato de backup inválido')
    }
    await this.db.transaction('rw', [this.db.posts, this.db.categories], async () => {
      await this.db.posts.clear()
      await this.db.categories.clear()
      await this.db.posts.bulkAdd(data.posts)
      await this.db.categories.bulkAdd(data.categories)
    })
  }
}
```

**Step 2: Añadir test de DexieStorage**

```ts
// src/lib/storage/dexie.test.ts
import { beforeEach, describe } from 'vitest'
import { DexieStorage } from './dexie'
import { testStorageAdapter } from './adapter.test'

// Dexie necesita indexedDB simulado — jsdom lo provee via fake-indexeddb
// Instalar: npm install -D fake-indexeddb
import 'fake-indexeddb/auto'

testStorageAdapter('DexieStorage', () => new DexieStorage())
```

```bash
npm install -D fake-indexeddb
```

**Step 3: Correr tests**

```bash
npm run test:run
```

Expected: todos los tests de `testStorageAdapter` pasan para DexieStorage.

**Step 4: Commit**

```bash
git add src/lib/storage/dexie.ts src/lib/storage/dexie.test.ts package.json
git commit -m "feat: implementar DexieStorage (IndexedDB) para PWA"
```

---

## Task 5: Implementar SqliteStorage (Desktop)

**Por qué:** En Tauri desktop usamos SQLite (vía Rust plugin) en vez de IndexedDB. SQLite es una base de datos real con queries SQL, ideal para búsqueda y filtrado eficiente.

**Files:**
- Create: `src/lib/storage/sqlite.ts`

**Step 1: Implementar SqliteStorage**

```ts
// src/lib/storage/sqlite.ts
import Database from '@tauri-apps/plugin-sql'
import type { StorageAdapter } from './adapter'
import type { Post, Category } from '../types'

const SCHEMA_VERSION = 1
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-default-1', name: 'General',    color: '#7C4DFF' },
  { id: 'cat-default-2', name: 'Inspiración', color: '#00BCD4' },
  { id: 'cat-default-3', name: 'Trabajo',     color: '#26A69A' },
]

export class SqliteStorage implements StorageAdapter {
  private db!: Database

  async init(): Promise<void> {
    this.db = await Database.load('sqlite:threadsvault.db')
    await this._createTables()
    await this._seedDefaultCategories()
  }

  private async _createTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id           TEXT PRIMARY KEY,
        url          TEXT NOT NULL,
        author       TEXT NOT NULL,
        note         TEXT NOT NULL DEFAULT '',
        categoryId   TEXT NOT NULL,
        savedAt      INTEGER NOT NULL,
        previewTitle TEXT,
        previewImage TEXT
      )
    `)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id    TEXT PRIMARY KEY,
        name  TEXT NOT NULL,
        color TEXT NOT NULL
      )
    `)
  }

  private async _seedDefaultCategories(): Promise<void> {
    const rows = await this.db.select<Category[]>('SELECT id FROM categories LIMIT 1')
    if (rows.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await this.saveCategory(cat)
      }
    }
  }

  async getPosts(): Promise<Post[]> {
    return this.db.select<Post[]>('SELECT * FROM posts ORDER BY savedAt DESC')
  }

  async getPost(id: string): Promise<Post | null> {
    const rows = await this.db.select<Post[]>('SELECT * FROM posts WHERE id = $1', [id])
    return rows[0] ?? null
  }

  async savePost(post: Post): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO posts
        (id, url, author, note, categoryId, savedAt, previewTitle, previewImage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [post.id, post.url, post.author, post.note, post.categoryId,
       post.savedAt, post.previewTitle ?? null, post.previewImage ?? null]
    )
  }

  async deletePost(id: string): Promise<void> {
    await this.db.execute('DELETE FROM posts WHERE id = $1', [id])
  }

  async getCategories(): Promise<Category[]> {
    return this.db.select<Category[]>('SELECT * FROM categories')
  }

  async saveCategory(cat: Category): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO categories (id, name, color) VALUES ($1,$2,$3)',
      [cat.id, cat.name, cat.color]
    )
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db.execute('DELETE FROM categories WHERE id = $1', [id])
  }

  async exportBackup(): Promise<string> {
    const posts = await this.getPosts()
    const categories = await this.getCategories()
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      posts,
      categories,
    }, null, 2)
  }

  async importBackup(json: string): Promise<void> {
    const data = JSON.parse(json)
    if (!data.schemaVersion || !data.posts || !data.categories) {
      throw new Error('Formato de backup inválido')
    }
    await this.db.execute('DELETE FROM posts')
    await this.db.execute('DELETE FROM categories')
    for (const post of data.posts) await this.savePost(post)
    for (const cat of data.categories) await this.saveCategory(cat)
  }
}
```

**Nota sobre tests:** SqliteStorage no se puede testear con Vitest porque requiere el runtime de Tauri. Se prueba manualmente con `cargo tauri dev`.

**Step 2: Commit**

```bash
git add src/lib/storage/sqlite.ts
git commit -m "feat: implementar SqliteStorage (SQLite) para Desktop via Tauri"
```

---

## Task 6: Svelte stores + URL parser

**Por qué:** Los stores de Svelte son el equivalente al `StateFlow` de Kotlin. Son reactivos: cuando cambia el valor, todos los componentes que los usan se re-renderizan automáticamente.

**Files:**
- Create: `src/lib/stores/vault.ts`
- Create: `src/lib/utils/url-parser.ts`
- Create: `src/lib/utils/url-parser.test.ts`

**Step 1: Escribir el test del URL parser primero (TDD)**

```ts
// src/lib/utils/url-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseThreadsAuthor, isValidThreadsUrl } from './url-parser'

describe('parseThreadsAuthor', () => {
  it('extrae autor de URL threads.net', () => {
    expect(parseThreadsAuthor('https://www.threads.net/@john_doe/post/abc123'))
      .toBe('@john_doe')
  })

  it('extrae autor de URL threads.com', () => {
    expect(parseThreadsAuthor('https://threads.com/@maria.perez/post/xyz'))
      .toBe('@maria.perez')
  })

  it('devuelve string vacío si no hay match', () => {
    expect(parseThreadsAuthor('https://twitter.com/user')).toBe('')
  })
})

describe('isValidThreadsUrl', () => {
  it('acepta URLs de threads.net', () => {
    expect(isValidThreadsUrl('https://www.threads.net/@user/post/123')).toBe(true)
  })

  it('rechaza URLs de otros dominios', () => {
    expect(isValidThreadsUrl('https://instagram.com/user')).toBe(false)
  })

  it('rechaza strings vacíos', () => {
    expect(isValidThreadsUrl('')).toBe(false)
  })
})
```

**Step 2: Correr tests (deben fallar)**

```bash
npm run test:run
```

Expected: FAIL con "Cannot find module './url-parser'".

**Step 3: Implementar url-parser**

```ts
// src/lib/utils/url-parser.ts
// Mismo regex que Android — compatibilidad garantizada
const THREADS_AUTHOR_REGEX = /threads(?:\.net|\.com)\/@([A-Za-z0-9._]+)/

export function parseThreadsAuthor(url: string): string {
  const match = THREADS_AUTHOR_REGEX.exec(url)
  return match ? `@${match[1]}` : ''
}

export function isValidThreadsUrl(url: string): boolean {
  if (!url) return false
  return THREADS_AUTHOR_REGEX.test(url)
}
```

**Step 4: Correr tests (deben pasar)**

```bash
npm run test:run
```

Expected: todos los tests de url-parser pasan.

**Step 5: Implementar vault store**

```ts
// src/lib/stores/vault.ts
import { writable, derived } from 'svelte/store'
import type { Post, Category, AppState } from '../types'
import { getStorage } from '../storage/index'

// Estado global de la app
export const posts        = writable<Post[]>([])
export const categories   = writable<Category[]>([])
export const appState     = writable<AppState>('loading')
export const searchQuery  = writable<string>('')
export const activeCategory = writable<string | null>(null)

// Posts filtrados (derivado — se recalcula automáticamente)
export const filteredPosts = derived(
  [posts, searchQuery, activeCategory],
  ([$posts, $query, $category]) => {
    let result = $posts

    if ($category) {
      result = result.filter(p => p.categoryId === $category)
    }

    if ($query.trim()) {
      const q = $query.toLowerCase()
      result = result.filter(p =>
        p.url.toLowerCase().includes(q)    ||
        p.author.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q)
      )
    }

    return result
  }
)

// Acciones
export async function loadVault() {
  appState.set('loading')
  try {
    const storage = await getStorage()
    const [loadedPosts, loadedCats] = await Promise.all([
      storage.getPosts(),
      storage.getCategories(),
    ])
    posts.set(loadedPosts)
    categories.set(loadedCats)
    appState.set(loadedPosts.length === 0 ? 'empty' : 'success')
  } catch (e) {
    console.error(e)
    appState.set('error')
  }
}

export async function savePost(post: Post) {
  const storage = await getStorage()
  await storage.savePost(post)
  await loadVault()
}

export async function deletePost(id: string) {
  const storage = await getStorage()
  await storage.deletePost(id)
  await loadVault()
}
```

**Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: url-parser (TDD) + vault store reactivo"
```

---

## Task 7: Componentes base UI

**Files:**
- Modify: `src/App.svelte`
- Create: `src/components/PostCard.svelte`
- Create: `src/components/CategoryBadge.svelte`
- Create: `src/components/EmptyState.svelte`
- Create: `src/components/LoadingSpinner.svelte`

**Step 1: Limpiar App.svelte y añadir router básico**

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { loadVault } from './lib/stores/vault'

  // Router simple basado en hash
  let currentRoute = $state(window.location.hash || '#/')

  onMount(() => {
    loadVault()
    window.addEventListener('hashchange', () => {
      currentRoute = window.location.hash || '#/'
    })
  })
</script>

<main class="min-h-screen" style="background: var(--vault-bg)">
  {#if currentRoute === '#/' || currentRoute === ''}
    {#await import('./routes/VaultScreen.svelte') then { default: VaultScreen }}
      <VaultScreen />
    {/await}
  {:else if currentRoute.startsWith('#/post/')}
    {#await import('./routes/PostDetailScreen.svelte') then { default: PostDetailScreen }}
      <PostDetailScreen postId={currentRoute.replace('#/post/', '')} />
    {/await}
  {:else if currentRoute === '#/settings'}
    {#await import('./routes/SettingsScreen.svelte') then { default: SettingsScreen }}
      <SettingsScreen />
    {/await}
  {:else if currentRoute === '#/share'}
    {#await import('./routes/ShareScreen.svelte') then { default: ShareScreen }}
      <ShareScreen />
    {/await}
  {/if}
</main>
```

**Step 2: CategoryBadge**

```svelte
<!-- src/components/CategoryBadge.svelte -->
<script lang="ts">
  import type { Category } from '../lib/types'
  let { category }: { category: Category } = $props()
</script>

<span
  class="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
  style="background-color: {category.color}"
>
  {category.name}
</span>
```

**Step 3: PostCard**

```svelte
<!-- src/components/PostCard.svelte -->
<script lang="ts">
  import type { Post, Category } from '../lib/types'
  import CategoryBadge from './CategoryBadge.svelte'

  let {
    post,
    category,
    onDelete,
  }: {
    post: Post
    category: Category | undefined
    onDelete: (id: string) => void
  } = $props()

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  }
</script>

<article
  class="rounded-xl p-4 mb-3 cursor-pointer transition-transform hover:scale-[1.01]"
  style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
  onclick={() => window.location.hash = `#/post/${post.id}`}
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-sm" style="color: var(--vault-primary)">
        {post.author || 'Autor desconocido'}
      </p>
      <p class="text-xs mt-0.5 truncate opacity-60">{post.url}</p>
      {#if post.note}
        <p class="text-sm mt-2 opacity-80">{post.note}</p>
      {/if}
    </div>
    <button
      class="shrink-0 opacity-40 hover:opacity-100 transition-opacity p-1"
      onclick={(e) => { e.stopPropagation(); onDelete(post.id) }}
      aria-label="Eliminar post"
    >
      ✕
    </button>
  </div>

  <div class="flex items-center justify-between mt-3">
    {#if category}
      <CategoryBadge {category} />
    {:else}
      <span></span>
    {/if}
    <span class="text-xs opacity-40">{formatDate(post.savedAt)}</span>
  </div>
</article>
```

**Step 4: EmptyState**

```svelte
<!-- src/components/EmptyState.svelte -->
<div class="flex flex-col items-center justify-center h-64 gap-4 opacity-60">
  <div class="text-5xl">🔒</div>
  <p class="text-lg font-medium">Tu bóveda está vacía</p>
  <p class="text-sm text-center max-w-xs">
    Comparte un post de Threads con esta app para empezar a guardar
  </p>
</div>
```

**Step 5: LoadingSpinner**

```svelte
<!-- src/components/LoadingSpinner.svelte -->
<div class="flex items-center justify-center h-64">
  <div
    class="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
    style="border-color: var(--vault-primary); border-top-color: transparent"
  ></div>
</div>
```

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: componentes base PostCard, CategoryBadge, EmptyState, LoadingSpinner"
```

---

## Task 8: VaultScreen (pantalla principal)

**Files:**
- Create: `src/routes/VaultScreen.svelte`

**Step 1: Implementar VaultScreen**

```svelte
<!-- src/routes/VaultScreen.svelte -->
<script lang="ts">
  import { posts, categories, appState, filteredPosts,
           searchQuery, activeCategory, deletePost } from '../lib/stores/vault'
  import PostCard from '../components/PostCard.svelte'
  import EmptyState from '../components/EmptyState.svelte'
  import LoadingSpinner from '../components/LoadingSpinner.svelte'

  function getCategoryById(id: string) {
    return $categories.find(c => c.id === id)
  }

  function handleAdd() {
    window.location.hash = '#/share'
  }
</script>

<div class="max-w-2xl mx-auto px-4 pb-20">
  <!-- Header -->
  <header class="sticky top-0 z-10 py-4" style="background: var(--vault-bg)">
    <div class="flex items-center justify-between mb-3">
      <h1 class="text-xl font-bold" style="color: var(--vault-primary)">
        🔒 ThreadsVault
      </h1>
      <div class="flex gap-2">
        <button
          class="text-sm px-3 py-1.5 rounded-lg opacity-60 hover:opacity-100"
          onclick={() => window.location.hash = '#/settings'}
        >
          ⚙️
        </button>
        <button
          class="text-sm px-4 py-1.5 rounded-lg font-medium text-white"
          style="background: var(--vault-primary)"
          onclick={handleAdd}
        >
          + Añadir
        </button>
      </div>
    </div>

    <!-- Búsqueda -->
    <input
      type="search"
      placeholder="Buscar posts..."
      bind:value={$searchQuery}
      class="w-full px-4 py-2 rounded-xl text-sm outline-none"
      style="background: var(--vault-surface); color: var(--vault-on-bg);
             border: 1px solid rgba(124,77,255,0.2)"
    />

    <!-- Filtro por categoría -->
    {#if $categories.length > 0}
      <div class="flex gap-2 mt-2 overflow-x-auto pb-1">
        <button
          class="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
          style={$activeCategory === null
            ? 'background: var(--vault-primary); color: white'
            : 'background: var(--vault-surface); color: var(--vault-on-bg)'}
          onclick={() => activeCategory.set(null)}
        >
          Todos
        </button>
        {#each $categories as cat}
          <button
            class="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors text-white"
            style={$activeCategory === cat.id
              ? `background: ${cat.color}`
              : `background: ${cat.color}40`}
            onclick={() => activeCategory.set(cat.id)}
          >
            {cat.name}
          </button>
        {/each}
      </div>
    {/if}
  </header>

  <!-- Contenido -->
  {#if $appState === 'loading'}
    <LoadingSpinner />
  {:else if $appState === 'error'}
    <div class="text-center py-16 opacity-60">
      <p>Error cargando la bóveda</p>
    </div>
  {:else if $filteredPosts.length === 0}
    <EmptyState />
  {:else}
    <p class="text-xs opacity-40 mb-3">{$filteredPosts.length} posts</p>
    {#each $filteredPosts as post (post.id)}
      <PostCard
        {post}
        category={getCategoryById(post.categoryId)}
        onDelete={deletePost}
      />
    {/each}
  {/if}
</div>
```

**Step 2: Commit**

```bash
git add src/routes/VaultScreen.svelte
git commit -m "feat: VaultScreen con búsqueda y filtro por categoría"
```

---

## Task 9: ShareScreen (entrada de posts)

**Por qué:** Esta es la pantalla más importante de la app. En PWA recibe la URL via Web Share Target API. En desktop es un formulario para pegar URL manualmente.

**Files:**
- Create: `src/routes/ShareScreen.svelte`

**Step 1: Implementar ShareScreen**

```svelte
<!-- src/routes/ShareScreen.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { categories, savePost } from '../lib/stores/vault'
  import { parseThreadsAuthor, isValidThreadsUrl } from '../lib/utils/url-parser'
  import type { Post } from '../lib/types'

  let url = $state('')
  let note = $state('')
  let selectedCategoryId = $state('')
  let error = $state('')
  let saving = $state(false)

  onMount(() => {
    // PWA Share Target: la URL llega como query param
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get('url') || params.get('text') || ''
    if (sharedUrl) url = sharedUrl

    // Seleccionar primera categoría por defecto
    if ($categories.length > 0) {
      selectedCategoryId = $categories[0].id
    }
  })

  async function handleSave() {
    if (!isValidThreadsUrl(url)) {
      error = 'Introduce una URL válida de Threads'
      return
    }
    if (!selectedCategoryId) {
      error = 'Selecciona una categoría'
      return
    }

    saving = true
    error = ''

    const post: Post = {
      id: crypto.randomUUID(),
      url: url.trim(),
      author: parseThreadsAuthor(url),
      note: note.trim(),
      categoryId: selectedCategoryId,
      savedAt: Date.now(),
    }

    await savePost(post)
    window.location.hash = '#/'
  }
</script>

<div class="max-w-lg mx-auto px-4 py-6">
  <div class="flex items-center gap-3 mb-6">
    <button
      onclick={() => window.location.hash = '#/'}
      class="opacity-60 hover:opacity-100 text-lg"
    >←</button>
    <h1 class="text-lg font-bold">Guardar post</h1>
  </div>

  <div class="flex flex-col gap-4">
    <!-- URL -->
    <div>
      <label class="block text-sm opacity-60 mb-1">URL de Threads</label>
      <input
        type="url"
        bind:value={url}
        placeholder="https://www.threads.net/@usuario/post/..."
        class="w-full px-4 py-3 rounded-xl text-sm outline-none"
        style="background: var(--vault-surface); color: var(--vault-on-bg);
               border: 1px solid rgba(124,77,255,0.2)"
      />
    </div>

    <!-- Nota -->
    <div>
      <label class="block text-sm opacity-60 mb-1">Nota personal (opcional)</label>
      <textarea
        bind:value={note}
        rows="3"
        placeholder="¿Por qué guardas este post?"
        class="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
        style="background: var(--vault-surface); color: var(--vault-on-bg);
               border: 1px solid rgba(124,77,255,0.2)"
      ></textarea>
    </div>

    <!-- Categoría -->
    <div>
      <label class="block text-sm opacity-60 mb-2">Categoría</label>
      <div class="flex flex-wrap gap-2">
        {#each $categories as cat}
          <button
            class="px-3 py-1.5 rounded-full text-sm font-medium text-white transition-opacity"
            style={selectedCategoryId === cat.id
              ? `background: ${cat.color}; opacity: 1`
              : `background: ${cat.color}; opacity: 0.4`}
            onclick={() => selectedCategoryId = cat.id}
          >
            {cat.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Error -->
    {#if error}
      <p class="text-sm text-red-400">{error}</p>
    {/if}

    <!-- Botón guardar -->
    <button
      onclick={handleSave}
      disabled={saving}
      class="w-full py-3 rounded-xl font-semibold text-white mt-2 disabled:opacity-50"
      style="background: var(--vault-primary)"
    >
      {saving ? 'Guardando...' : '🔒 Guardar en bóveda'}
    </button>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add src/routes/ShareScreen.svelte
git commit -m "feat: ShareScreen con soporte PWA Share Target y entrada manual"
```

---

## Task 10: PostDetailScreen + SettingsScreen

**Files:**
- Create: `src/routes/PostDetailScreen.svelte`
- Create: `src/routes/SettingsScreen.svelte`

**Step 1: PostDetailScreen**

```svelte
<!-- src/routes/PostDetailScreen.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { categories, deletePost } from '../lib/stores/vault'
  import { getStorage } from '../lib/storage/index'
  import type { Post, Category } from '../lib/types'

  let { postId }: { postId: string } = $props()

  let post = $state<Post | null>(null)
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
    <button onclick={() => window.location.hash = '#/'} class="opacity-60 hover:opacity-100 text-lg">
      ← Volver
    </button>
    <button onclick={handleDelete} class="text-sm text-red-400 hover:text-red-300">
      Eliminar
    </button>
  </div>

  {#if !post}
    <p class="opacity-60 text-center py-16">Cargando...</p>
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
        class="text-sm break-all opacity-60 hover:opacity-100 underline"
      >
        {post.url}
      </a>

      {#if post.note}
        <p class="mt-4 text-sm leading-relaxed">{post.note}</p>
      {/if}

      <div class="flex items-center justify-between mt-4 pt-3"
           style="border-top: 1px solid rgba(255,255,255,0.1)">
        {#if category}
          <span
            class="px-2 py-0.5 rounded-full text-xs text-white"
            style="background: {category.color}"
          >{category.name}</span>
        {/if}
        <span class="text-xs opacity-40">{formatDate(post.savedAt)}</span>
      </div>
    </article>
  {/if}
</div>
```

**Step 2: SettingsScreen**

```svelte
<!-- src/routes/SettingsScreen.svelte -->
<script lang="ts">
  import { getStorage } from '../lib/storage/index'
  import { loadVault } from '../lib/stores/vault'

  let exportStatus = $state<'idle' | 'success' | 'error'>('idle')
  let importStatus = $state<'idle' | 'success' | 'error'>('idle')
  let importError = $state('')

  async function handleExport() {
    const storage = await getStorage()
    const json = await storage.exportBackup()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `threadsvault-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    exportStatus = 'success'
    setTimeout(() => exportStatus = 'idle', 3000)
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const json = await file.text()
      const storage = await getStorage()
      await storage.importBackup(json)
      await loadVault()
      importStatus = 'success'
      setTimeout(() => importStatus = 'idle', 3000)
    } catch (err) {
      importError = (err as Error).message
      importStatus = 'error'
    }
  }
</script>

<div class="max-w-lg mx-auto px-4 py-6">
  <div class="flex items-center gap-3 mb-6">
    <button onclick={() => window.location.hash = '#/'} class="opacity-60 hover:opacity-100 text-lg">←</button>
    <h1 class="text-lg font-bold">Ajustes</h1>
  </div>

  <section
    class="rounded-xl p-5 mb-4"
    style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
  >
    <h2 class="font-semibold mb-1">Backup & Restore</h2>
    <p class="text-sm opacity-60 mb-4">
      El backup es compatible con ThreadsVault Android.
    </p>

    <button
      onclick={handleExport}
      class="w-full py-2.5 rounded-xl text-sm font-medium text-white mb-3"
      style="background: var(--vault-primary)"
    >
      {exportStatus === 'success' ? '✓ Backup exportado' : '⬇ Exportar backup JSON'}
    </button>

    <label
      class="w-full py-2.5 rounded-xl text-sm font-medium text-center block cursor-pointer"
      style="background: var(--vault-surface); border: 1px dashed rgba(124,77,255,0.4)"
    >
      {importStatus === 'success' ? '✓ Backup restaurado' : '⬆ Importar backup JSON'}
      <input type="file" accept=".json" class="hidden" onchange={handleImport} />
    </label>

    {#if importStatus === 'error'}
      <p class="text-sm text-red-400 mt-2">{importError}</p>
    {/if}
  </section>

  <section
    class="rounded-xl p-5"
    style="background: var(--vault-surface); border: 1px solid rgba(124,77,255,0.2)"
  >
    <h2 class="font-semibold mb-1">Acerca de</h2>
    <p class="text-sm opacity-60">ThreadsVault Desktop v1.0.0</p>
    <p class="text-sm opacity-40 mt-1">Privacy-first. Sin cloud. Sin tracking.</p>
  </section>
</div>
```

**Step 3: Commit**

```bash
git add src/routes/
git commit -m "feat: PostDetailScreen y SettingsScreen con backup/restore JSON"
```

---

## Task 11: PWA Manifest + Service Worker

**Por qué:** Sin el manifest, el navegador no puede instalar la app. Sin el service worker, la app no funciona offline.

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Modify: `index.html`

**Step 1: Crear manifest**

```json
// public/manifest.webmanifest
{
  "name": "ThreadsVault",
  "short_name": "ThreadsVault",
  "description": "Guarda posts de Threads localmente. Privacy-first.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F0F0F",
  "theme_color": "#7C4DFF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "share_target": {
    "action": "/#/share",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

**Step 2: Crear service worker básico (cache-first)**

```js
// public/sw.js
const CACHE = 'threadsvault-v1'
const ASSETS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
```

**Step 3: Registrar en index.html**

```html
<!-- index.html — añadir en <head> -->
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#7C4DFF" />
<meta name="mobile-web-app-capable" content="yes" />

<!-- añadir antes de </body> -->
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
</script>
```

**Nota:** Necesitas crear dos iconos PNG en `public/`:
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

Puedes exportarlos desde el icono de Android con cualquier editor de imágenes.

**Step 4: Commit**

```bash
git add public/ index.html
git commit -m "feat: PWA manifest con share_target y service worker offline"
```

---

## Task 12: Configurar Tauri para todos los targets

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Actualizar configuración Tauri**

```json
// src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ThreadsVault",
  "version": "1.0.0",
  "identifier": "com.d4vram.threadsvault",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "ThreadsVault",
        "width": 900,
        "height": 650,
        "minWidth": 600,
        "minHeight": 500,
        "center": true,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**Step 2: Generar iconos para Tauri**

```bash
# Requiere tener icon-512.png en public/
cargo tauri icon public/icon-512.png
```

Esto genera automáticamente todos los tamaños en `src-tauri/icons/`.

**Step 3: Build de prueba**

```bash
cargo tauri build
```

Expected en `src-tauri/target/release/bundle/`:
- Windows: `nsis/ThreadsVault_1.0.0_x64-setup.exe`
- Linux: `appimage/ThreadsVault_1.0.0_x86_64.AppImage`
- Linux: `deb/ThreadsVault_1.0.0_amd64.deb`

**Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/icons/
git commit -m "feat: configurar Tauri targets (exe, AppImage, deb)"
```

---

## Task 13: GitHub Actions — CI/CD

**Files:**
- Create: `.github/workflows/deploy-pwa.yml`
- Create: `.github/workflows/release-desktop.yml`

**Step 1: Workflow deploy PWA**

```yaml
# .github/workflows/deploy-pwa.yml
name: Deploy PWA

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**Step 2: Workflow release desktop**

```yaml
# .github/workflows/release-desktop.yml
name: Release Desktop

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            targets: nsis
          - os: ubuntu-latest
            targets: appimage,deb

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Install Linux deps
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt update
          sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev \
            libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - run: npm ci

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: ThreadsVault ${{ github.ref_name }}
          args: --target ${{ matrix.targets }}
```

**Step 3: Commit y push**

```bash
git add .github/
git commit -m "feat: GitHub Actions para deploy PWA y release desktop"
git push origin main
```

**Step 4: Crear primer release**

```bash
git tag v1.0.0
git push origin v1.0.0
```

Expected: GitHub Actions compila en Windows y Linux, crea Release con archivos adjuntos.

---

## Resumen de comandos clave

| Acción | Comando |
|---|---|
| Desarrollo desktop | `cargo tauri dev` |
| Desarrollo PWA | `npm run dev` (abrir `localhost:5173`) |
| Tests | `npm run test:run` |
| Build PWA | `npm run build` |
| Build desktop | `cargo tauri build` |
| Nuevo release | `git tag vX.Y.Z && git push origin vX.Y.Z` |
