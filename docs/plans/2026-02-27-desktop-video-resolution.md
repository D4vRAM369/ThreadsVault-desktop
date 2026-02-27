# Desktop Video Resolution — Implementation Plan

## Goal

Añadir base Tauri y una ruta desktop-only para resolver vídeo en `PostDetailScreen` sin romper el fallback web/PWA.

## Task 1

Crear `src-tauri` mínimo con:
- `Cargo.toml`
- `tauri.conf.json`
- `build.rs`
- `src/main.rs`

## Task 2

Definir un comando Rust con contrato simple:
- input: `post_url`
- output:
  - `playable_url?: string`
  - `download_url?: string`
  - `reason?: string`

## Task 3

Crear un helper frontend:
- detecta Tauri
- invoca el comando nativo
- cae al resolver web actual fuera de desktop

## Task 4

Actualizar `PostDetailScreen.svelte`:
- prioridad desktop resolver
- luego resolver web
- si ambos fallan, mostrar estado no disponible + `Abrir enlace`

## Task 5

Verificar:
- `npm run check`
- `npm run build`

Si el comando nativo no puede resolver aún el post objetivo, dejar el contrato y la integración preparados, documentando el límite real.
