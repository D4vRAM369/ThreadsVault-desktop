# Desktop Video Resolution — Design Doc
**Fecha:** 2026-02-27
**Método:** PBL

## Problema

La app ya reproduce imágenes y miniaturas del post, pero ciertos vídeos de Threads no se pueden reproducir inline porque el HTML público no expone una URL `mp4`, `m3u8` o `dash` reutilizable.

En web/PWA esto deja al frontend sin fuente reproducible. En desktop necesitamos una ruta nativa separada para resolver, cachear o descargar vídeo cuando sea posible.

## Objetivo

- Mantener el reproductor inline actual en la vista de detalle.
- Añadir una ruta desktop-first para intentar resolver el vídeo desde el backend nativo.
- Conservar fallback seguro en PWA: abrir enlace externo cuando no haya stream público.

## Enfoques considerados

### A. Seguir sólo con extracción frontend

- Ventaja: no añade backend.
- Desventaja: ya está agotado para este caso; el HTML público del post no trae stream reutilizable.

### B. Backend Tauri mínimo para resolución/caché

- Ventaja: separa el trabajo desktop del navegador y permite evolucionar a descarga/caché nativa.
- Desventaja: requiere crear `src-tauri` y un puente JS/Rust.

### C. Reproductor web embebiendo Threads completo

- Ventaja: fácil de montar.
- Desventaja: mala UX, no da descarga fiable, depende del login/upsell de Threads.

## Decisión

Elegimos **B**.

## Arquitectura

### Desktop

1. Svelte detecta entorno Tauri.
2. `PostDetailScreen` pide al backend nativo una resolución de vídeo para el post.
3. El backend responde con:
   - `playable`: URL reproducible encontrada
   - `downloadable`: URL o archivo descargable
   - `unavailable`: no se pudo resolver
4. La UI muestra:
   - `<video controls>` si hay `playable`
   - `Descargar` si hay fuente descargable
   - `Abrir enlace` siempre como fallback

### PWA

1. Se mantiene el resolver web actual.
2. Si no encuentra stream público, no simula éxito.
3. La UI deja `Abrir enlace` como salida honesta.

## Alcance de esta iteración

- Crear `src-tauri` base.
- Añadir un comando nativo de resolución de vídeo con contrato estable.
- Conectar el frontend a ese comando cuando esté en desktop.
- No rehacer storage ni layout.
- No prometer reproducción universal si Threads no entrega fuente pública.

## Riesgos

- Puede que el backend nativo siga sin resolver ciertos vídeos si Threads no expone un endpoint público suficiente.
- Sin una API privada o autenticada, la mejora más fuerte puede ser descarga/caché de recursos accesibles, no acceso universal a todos los vídeos.

## Criterios de éxito

- En desktop, la vista detalle intenta primero la resolución nativa.
- En PWA, el comportamiento actual no se rompe.
- Si no hay vídeo resoluble, la app informa bien y mantiene `Abrir enlace`.
