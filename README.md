# ThreadsVault Desktop

<!-- badges -->
![Plataforma](https://img.shields.io/badge/plataforma-Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![Licencia](https://img.shields.io/badge/licencia-GPL--3.0-green)
![PBL](https://img.shields.io/badge/método-PBL-blueviolet)

> Una bóveda local para tus posts de Threads. Sin nube. Sin rastreo. Sin cuenta necesaria.

ThreadsVault Desktop es la versión de escritorio de [ThreadsVault para Android](https://github.com/D4vRAM369/ThreadsVault). Pega la URL de un post de Threads — se extrae, se guarda localmente, y es tuyo. Cierra la app, ábrela un año después: tus posts siguen ahí.

---

## Características principales

- **Guardar posts por URL** — pega un enlace de Threads y pulsa guardar. Título, autor, texto e imágenes se extraen automáticamente.
- **Almacenamiento local** — SQLite en escritorio (vía Tauri), IndexedDB en navegador. Nada sale de tu dispositivo.
- **Categorías** — organiza tus posts en categorías personalizadas. Los no categorizados van a una bandeja por defecto.
- **Backup y restauración** — exporta toda tu bóveda como JSON e impórtala cuando quieras.
- **Caché de medios** — las imágenes se cachean localmente como data URLs para que los posts sobrevivan la expiración de los enlaces CDN.
- **Reproductor de vídeo** — reproductor embebido para vídeos de Threads con manejo de fallos CDN.
- **Sin telemetría** — sin analíticas, sin informes de errores, sin peticiones externas más allá de la extracción del post.

---

## Instalación

### Windows

Descarga el instalador `.exe` desde [Releases](../../releases) y ejecútalo.
Instalador NSIS — instala en `%LocalAppData%\threadsvault-desktop` y crea un acceso directo en el Menú Inicio.

### Linux

Dos opciones disponibles en [Releases](../../releases):

| Formato | Cómo usarlo |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |

> **Nota:** AppImage requiere FUSE. En Ubuntu 22.04+ instala `sudo apt install libfuse2` si el AppImage no arranca.

---

## Cómo funciona

1. Copia la URL de un post de Threads (ej. `https://www.threads.net/@usuario/post/abc123`)
2. Abre la app → pulsa el botón **+** (pantalla Compartir)
3. Pega la URL y pulsa **Guardar**
4. La app extrae el contenido mediante [Jina Reader](https://jina.ai/reader/) — un proxy con navegador headless — porque Threads es una SPA en React que devuelve HTML vacío en peticiones directas
5. El post se guarda localmente. Listo.

---

## Privacidad

- Todos los datos se almacenan en una base de datos SQLite local (`%AppData%\threadsvault-desktop` en Windows, `~/.local/share/threadsvault-desktop` en Linux)
- La única petición externa que se realiza es a `r.jina.ai` durante la extracción del post — y solo cuando guardas un post explícitamente
- Sin datos de uso, sin informes de errores, sin telemetría de ningún tipo

---

## Limitaciones conocidas

- **Solo Threads** — diseñado específicamente para posts de Threads; otras URLs pueden no extraerse correctamente
- **La extracción depende de Jina** — si `r.jina.ai` está caído o aplica rate-limit, la extracción falla de forma controlada
- **Enlaces de vídeo CDN** — los CDN de Threads expiran; la app intenta un re-fetch de la página al fallar la reproducción
- **Sin búsqueda** — búsqueda de texto completo planificada para v1.1+
- **Sin operaciones en bulk** — borrar o recategorizar múltiples posts a la vez: v1.1+
- **macOS no soportado** — requiere cuenta Apple Developer ($99/año) para notarización; no planificado para v1.x

---

## Compilar desde el código fuente

**Requisitos previos:**
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (toolchain stable)
- En Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `patchelf` (`sudo apt install ...`)

```bash
git clone https://github.com/D4vRAM369/threadsvault-desktop
cd threadsvault-desktop
npm install
npm run tauri build
```

El binario compilado estará en `src-tauri/target/release/bundle/`.

Para desarrollo con hot-reload:
```bash
npm run tauri dev
```

O solo en navegador (sin Tauri, usa IndexedDB en lugar de SQLite):
```bash
npm run dev
```

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Shell | Tauri v2 |
| Frontend | Svelte 5 (runes) + TypeScript |
| Estilos | Tailwind CSS v4 |
| Almacenamiento (escritorio) | SQLite vía `@tauri-apps/plugin-sql` |
| Almacenamiento (navegador) | Dexie (IndexedDB) |
| Extracción de posts | Jina Reader (`r.jina.ai`) |

---

## Método de desarrollo

Construido mediante **PBL (Project-Based Learning)** — problemas reales impulsando funcionalidades reales, documentados como artefactos de aprendizaje. Las sesiones de desarrollo están registradas en `docs/`.

Desarrollado principalmente con asistencia de **Claude Code** y en menor medida con **ChatGPT-5.3-Codex**.

---

## Licencia

[GPL-3.0](LICENSE) — igual que ThreadsVault para Android.
