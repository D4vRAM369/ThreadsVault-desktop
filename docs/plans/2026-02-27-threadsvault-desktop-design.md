# ThreadsVault Desktop & PWA — Design Doc
**Fecha:** 2026-02-27
**Método:** PBL (Project-Based Learning)

---

## Objetivo

Crear una versión desktop/web de ThreadsVault como proyecto separado del Android app.
Produce: PWA (GitHub Pages), `.exe` portable, `.AppImage`, `.deb`, Flatpak.
Privacy-first, local-only, sin backend, sin cloud.

---

## Decisiones clave

| Decisión | Elección | Por qué |
|---|---|---|
| Arquitectura | Monorepo (Enfoque A) | Una UI compartida para PWA + Desktop |
| Framework UI | Svelte 5 + TypeScript | Ligero, sintaxis simple, compila a JS vanilla |
| Build tool | Vite | Hot-reload instantáneo, integración nativa con Svelte y Tauri |
| Estilos | Tailwind CSS v4 + CSS variables | Sin config extra, variables para colores de marca |
| Storage PWA | Dexie.js (IndexedDB) | Browser-native, async, sin backend |
| Storage Desktop | tauri-plugin-sql (SQLite) | Mirrors Room de Android, queries nativas |
| Empaquetado | Tauri v2 | Binarios ~10 MB, usa WebView del sistema |
| Deploy PWA | GitHub Pages + GitHub Actions | Gratis, automático en push a main |

---

## Stack completo

```
threadsvault-desktop/
├── src/
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── adapter.ts          ← interfaz StorageAdapter
│   │   │   ├── dexie.ts            ← implementación PWA (IndexedDB)
│   │   │   └── sqlite.ts           ← implementación Desktop (SQLite)
│   │   ├── stores/
│   │   │   ├── posts.ts            ← Svelte store reactivo
│   │   │   └── categories.ts
│   │   └── utils/
│   │       ├── url-parser.ts       ← mismo regex que Android
│   │       └── backup.ts           ← export/import JSON compatible Android
│   ├── routes/
│   │   ├── +page.svelte            ← Vault (lista)
│   │   ├── post/[id]/+page.svelte  ← Detalle
│   │   ├── settings/+page.svelte   ← Ajustes + backup
│   │   └── share/+page.svelte      ← PWA share target
│   └── components/
│       ├── PostCard.svelte
│       ├── CategoryBadge.svelte
│       └── EmptyState.svelte
├── src-tauri/
│   ├── src/main.rs                 ← bootstrap Tauri (mínimo)
│   └── tauri.conf.json             ← targets: nsis, app-image, deb, flatpak
├── public/
│   └── manifest.webmanifest        ← PWA installable + share_target
└── vite.config.ts
```

---

## Modelo de datos

```ts
interface Post {
  id: string           // UUID (compatible entre plataformas)
  url: string
  author: string       // extraído via regex "@usuario"
  note: string
  categoryId: string
  savedAt: number      // timestamp Unix ms
  previewTitle?: string
  previewImage?: string
}

interface Category {
  id: string
  name: string
  color: string        // hex "#7C4DFF"
}
```

**Esquema JSON de backup idéntico al de Android** (compatibilidad Fase 5 del roadmap).

---

## Detección de entorno

```ts
import { isTauri } from '@tauri-apps/api/core'

export const storage: StorageAdapter = isTauri()
  ? new SqliteStorage()
  : new DexieStorage()
```

---

## Flujo de entrada de posts

- **PWA:** Web Share Target API (manifest `share_target`) — recibe URL desde botón compartir del navegador
- **Desktop:** campo pegar URL + atajo global `Ctrl+Shift+V` via `tauri-plugin-global-shortcut`

---

## Pipeline de build

```
npm run build       → /dist (Svelte compilado)
                         ↓
                    GitHub Pages  →  PWA live

cargo tauri build   → envuelve /dist con Tauri
                         ↓
  nsis   →  ThreadsVault_x64-setup.exe  (Windows portable)
  app-image  →  ThreadsVault.AppImage   (Linux)
  deb    →  ThreadsVault.deb            (Debian/Ubuntu)
  flatpak → ThreadsVault.flatpak        (Linux universal)
```

---

## CI/CD (GitHub Actions)

| Trigger | Acción |
|---|---|
| `push` a `main` | Build PWA → deploy GitHub Pages |
| `push` tag `v*` | `cargo tauri build` en matrix (Win + Linux) → subir a GitHub Release |

---

## Colores de marca

```css
:root {
  --vault-primary:   #7C4DFF;
  --vault-secondary: #00BCD4;
  --vault-tertiary:  #26A69A;
}
```

---

## Checklist de calidad

- [ ] Estado de pantalla: Loading, Success, Empty, Error en cada vista
- [ ] IDs como UUID, nunca autoincrement
- [ ] Todo acceso a storage es `async/await`
- [ ] Backup JSON compatible con Android desde día 1
- [ ] Sin strings hardcodeados (archivo `i18n/es.ts`)
- [ ] PWA instalable: manifest válido + service worker
- [ ] Tauri: ventana mínima 600x500
