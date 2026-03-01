# ThreadsVault Desktop

<!-- badges -->
![Plataforma](https://img.shields.io/badge/plataforma-Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![Licencia](https://img.shields.io/badge/licencia-GPL--3.0-green)
![PBL](https://img.shields.io/badge/método-PBL-blueviolet)

> Una bóveda local para tus posts de Threads. Sin nube. Sin rastreo. Sin cuenta necesaria.

ThreadsVault Desktop es la versión de escritorio de [ThreadsVault para Android](https://github.com/D4vRAM369/ThreadsVault). Su funcionamiento es sencillo: pega la URL de un post de Threads, ésta se extrae, se guarda localmente, y es tuyo. Cierra la app, ábrela un año después: el texto y las imágenes de tus posts guardados van a seguir ahí (la app los guarda localmente en segundo plano tras cada guardado).

Puedes clasificar los posts en distintas categorías, el programa indexa los hashtags de las publicaciones y tú puedes usarlos en notas personales al guardar un post, para una mayor facilidad de búsqueda en tu pequeña bóveda personal de hilos que te resulten interesantes o relevantes para guardarlos de forma local, sin depender únicamente del sencillo Guardados de Threads 🗄🧵

---

## Características principales

- **Guardar posts por URL** — pega un enlace de Threads y pulsa guardar. Título, autor, texto e imágenes se extraen automáticamente.
- **Almacenamiento local** — SQLite en escritorio (vía Tauri), IndexedDB en navegador. Nada sale de tu dispositivo.
- **Categorías** — organiza tus posts en categorías personalizadas. Los no categorizados van a una bandeja por defecto.
- **Backup y restauración** — exporta toda tu bóveda como JSON e impórtala cuando quieras *(puedes migrar tu bóveda entre ThreadsVault de Android y ThreadsVault-desktop sin problemas)*
- **Caché de medios** — las imágenes se cachean localmente como data URLs para que los posts sobrevivan la expiración de los enlaces CDN.
- **Sin telemetría** — sin analíticas, sin informes de errores, sin peticiones externas más allá de la extracción del post. Todo funciona 100% en local (client-side): ni el desarrollador tiene acceso a tus datos.

---

## Instalación

### Windows

Descarga el instalador `.exe` desde [Releases](../../releases) y ejecútalo.
Se instala en `%LocalAppData%\threadsvault-desktop` y crea un acceso directo en el Menú Inicio.

### Linux

Dos opciones disponibles en [Releases](../../releases):

| Formato | Cómo usarlo |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |


> *Nota: Si el AppImage no arranca en Ubuntu 22.04+, ejecuta `sudo apt install libfuse2`.*


Flatpak planificado para futuras versiones.

---

## Cómo funciona

1. Copia la URL de un post de Threads (ej. `https://www.threads.net/@usuario/post/abc123`)
2. Abre la app → pulsa el botón **+Añadir** en la esquina superior derecha.
3. Pega la URL y pulsa **Guardar**, y añade notas adicionales de forma opcional.
4. La app usa Jina Reader para extraer el contenido — un servicio que actúa como navegador real para poder leer posts de Threads, ya que el acceso directo devuelve la página vacía.
5. El post se guarda localmente. Listo.

---

## Privacidad

- Todos los datos se almacenan en una base de datos SQLite local (`%AppData%\threadsvault-desktop` en Windows, `~/.local/share/threadsvault-desktop` en Linux)
- Las únicas peticiones externas van a `r.jina.ai`: al guardar un post explícitamente, y en segundo plano si la app detecta imágenes desactualizadas al cargar
- Sin datos de uso, sin informes de errores, sin telemetría de ningún tipo

---

## Limitaciones conocidas

- **Solo Threads** — diseñado específicamente para posts de Threads; otras URLs pueden no extraerse correctamente
- **La extracción depende de Jina** — si `r.jina.ai` está caído o aplica rate-limit, la extracción falla de forma controlada
- **Vídeos de Threads** — los vídeos no se reproducen ni se almacenan localmente. Threads sirve los vídeos a través de URLs CDN temporales que Jina Reader no puede descargar como archivo. Si un post contiene vídeo, solo se guarda el texto, las imágenes y una referencia al post original.
- **Sin operaciones en bulk** — borrar o recategorizar múltiples posts a la vez: v1.1+
- **macOS no soportado** — requiere cuenta Apple Developer ($99/año) para notarización; no planificado para v1.x (probablemente tampoco para una 2.x).

---

## Compilar desde el código fuente

**Requisitos previos:**
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (toolchain stable)
- En Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, `patchelf` (`sudo apt install ...`)

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

Construido mediante **PBL (Project-Based Learning)** — y documentado con artefactos de aprendizaje no incluidos en el repositorio para uso personal y sesiones de estudio teóricas con el programa abierto.

Desarrollado principalmente con asistencia de **Claude Code** y en menor medida con **ChatGPT-5.3-Codex**.

---

## Licencia

[GPL-3.0](LICENSE) — igual que ThreadsVault para Android.
