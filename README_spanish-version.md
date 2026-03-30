# ThreadsVault Desktop

<img width="400" height="400" alt="threadsvault-desktop-icon" src="https://github.com/user-attachments/assets/e336810d-5130-4b7a-a275-fac97b15acec" />

<!-- badges -->
![Plataforma](https://img.shields.io/badge/plataforma-Windows%20%7C%20Linux-blue)
![Cross Platform](https://img.shields.io/badge/Cross--Platform-Desktop%20%7C%20Web-blueviolet)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Local_DB-003B57?logo=sqlite&logoColor=white)
![IndexedDB](https://img.shields.io/badge/IndexedDB-Dexie-yellow)
![Licencia](https://img.shields.io/badge/licencia-GPL--3.0-green)
![PBL](https://img.shields.io/badge/método-PBL-blueviolet)
[![Claude Code](https://img.shields.io/badge/Assistant-Claude%20Code-D97706)](https://www.anthropic.com/claude-code)
[![Codex](https://img.shields.io/badge/Assistant-Codex-111827)](https://openai.com/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/D4vRAM369/ThreadsVault-desktop)

<p align="left">
  <a href="./README_english-version.md">Read in english</a>
</p>


> Una bóveda local para tus posts de Threads. Sin nube. Sin rastreo. Sin cuenta necesaria.

ThreadsVault Desktop es la versión de escritorio de [ThreadsVault para Android](https://github.com/D4vRAM369/ThreadsVault). Su funcionamiento es sencillo: pega la URL de un post de Threads, ésta se extrae, se guarda localmente, y es tuyo. Cierra la app y ábrela cuando quieras: el texto y las imágenes de tus posts guardados van a seguir ahí (el programa los guarda localmente en segundo plano tras cada guardado).

Puedes clasificar los posts en distintas categorías, el programa indexa los hashtags de las publicaciones y tú puedes usarlos en notas personales al guardar un post, para una mayor facilidad de búsqueda en tu pequeña bóveda personal de hilos que te resulten interesantes o relevantes para guardarlos de forma local, sin depender únicamente del sencillo Guardados de Threads 🗄🧵

---

## Capturas

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="assets/screenshots/vault_empty.png" alt="Bóveda vacía" /><br/>
      <b>Bóveda vacía</b><br/>
      <sub>Pantalla principal al primer arranque</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_categories.png" alt="Categorías" /><br/>
      <b>Categorías</b><br/>
      <sub>Crea y organiza con color e icono</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_privacy.png" alt="Ajustes" /><br/>
      <b>Privacidad y ajustes</b><br/>
      <sub>Backup, privacidad, atajos de teclado</sub>
    </td>
  </tr>
    <tr>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/c1b6d4e5-96eb-4736-8d11-67a78626a307" alt="Bóveda con posts en modo claro" /><br/>
      <b>Bóveda con posts (nuevo modo claro en v2.1)</b><br/>
      <sub>Pantalla principal con modo claro y posts guardados</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/57389305-7c3c-4ad5-b5a5-876a5a8c4c37" alt="Categorías - Modo claro" /><br/>
      <b>Categorías</b><br/>
      <sub>Vista de categorías en modo claro</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/8b901aa7-4d31-4687-b3f2-7c525cce76a0" alt="Ajustes" /><br/>
      <b>Privacidad y ajustes</b><br/>
      <sub>Modo claro</sub>
    </td>
  </tr>
</table>

---

## Características principales

- **Guardar posts por URL** — pega un enlace de Threads y pulsa guardar. Título, autor, texto e imágenes se extraen automáticamente.
-  **Modo oscuro/claro**: cambia entre el tema oscuro predeterminado y el modo claro desde cualquier pantalla.
- **Almacenamiento local** — SQLite en escritorio (vía Tauri), IndexedDB en navegador. Nada sale de tu dispositivo.
- **Categorías** — organiza tus posts en categorías personalizadas. Los no categorizados van a una bandeja por defecto.
- **Backup y restauración** — exporta toda tu bóveda como JSON e impórtala cuando quieras. Al importar, la app muestra el progreso y confirma cuántos posts y categorías se restauraron.
- **Caché de medios** —  las imágenes y vídeos se almacenan localmente para que los posts sobrevivan la expiración de los enlaces CDN. Las imágenes se guardan como data URLs; los vídeos se descargan y quedan disponibles offline.
- **Reproductor integrado** —  reproduce los vídeos guardados en tu bóveda directamente desde la app, con posibilidad de descarga. Integrado en la versión 2.0 mediante yt-dlp y ffmpeg.
- **Notas personales** — añade, edita o elimina notas en cualquier post guardado directamente desde su pantalla de detalle.
- **Atajos de teclado** — navega y busca sin ratón: `Esc` volver, `Ctrl+N` añadir, `/` o `Ctrl+F` buscar, `←` `→` navegar entre posts. `Ctrl+` y `Ctrl-` para zoom-in y zoom-out respectivamente, y `Ctrl+0` regresa al zoom por defecto (la preferencia del zoom se queda guardada de forma persistente tras cerrar el programa).
- **Internacionalización ES/EN** — el idioma de la interfaz de usuario se determina automáticamente al iniciar la aplicación en función de la configuración regional del sistema operativo. No es necesario realizar ninguna configuración. El español y el inglés están totalmente disponibles en todas las pantallas.
- **Sin telemetría** — sin analíticas, sin informes de errores, sin peticiones externas más allá de la extracción del post. Todo funciona 100% en local (client-side): ni el desarrollador tiene acceso a tus datos.

---

## Instalación

### Windows

Descarga el instalador `.exe` desde [Releases](../../releases) y ejecútalo.

| Formato | Descripción |
|---|---|
| `.exe` | Instalador estándar — recomendado |
| `.msi` | Paquete MSI para entornos gestionados/empresariales |

Se instala en `%LocalAppData%\threadsvault-desktop` y crea un acceso directo en el Menú Inicio.

### Linux

Multiples formatos disponibles en [Releases](../../releases):

| Formato | Cómo utilizarlo |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |
| `.rpm` | `sudo rpm -i threadsvault-desktop_*.rpm` |
| `.flatpak` | `flatpak install ThreadsVault-desktop-*.flatpak` |


> *Nota: Si el AppImage no arranca en Ubuntu 22.04+, ejecuta `sudo apt install libfuse2`.*


---

## Cómo funciona

1. Copia la URL de una publicación de Threads (por ejemplo, `https://www.threads.net/@user/post/abc123`)
2. Abre la aplicación → haz clic en el botón **+Añadir** situado en la esquina superior derecha.
3. Pega la URL y haz clic en **Guardar**; si lo deseas, puedes añadir notas.
4. La aplicación extrae el contenido de la publicación mediante un sistema de dos pasos: Jina Reader es el método principal, con un recurso directo al estado React integrado de Threads cuando Jina no está disponible o tiene una limitación de velocidad.
5. Si la URL forma parte de un hilo, la aplicación detecta y extrae automáticamente todas las publicaciones de la secuencia; no es necesario guardarlas una por una _(función de la actualización v2.2.0)_
6. La publicación (o el hilo) se guarda localmente. Listo.

---

## Privacidad

- Todos los datos se almacenan en una base de datos SQLite local (`%AppData%\threadsvault-desktop` en Windows, `~/.local/share/threadsvault-desktop` en Linux)
- Las solicitudes externas se limitan a `r.jina.ai` (extracción principal) y `threads.net` (alternativa cuando Jina no está disponible).
- Sin datos de uso, sin informes de errores, sin telemetría de ningún tipo

---

## Limitaciones conocidas

- **Solo Threads** — diseñado específicamente para posts de Threads; otras URLs pueden no extraerse correctamente
- **Fiabilidad de la extracción**: en ocasiones, puede que una publicación no se extraiga correctamente al primer intento. Si el formato del texto o las imágenes no se ven bien, utiliza el botón «Refrescar» para volver a extraerla.
- **macOS no soportado** — requiere cuenta Apple Developer ($99/año) para notarización; no planificado para v1.x (probablemente tampoco para una 2.x).
- **Compatibilidad con copias de seguridad**: la importación de copias de seguridad desde [ThreadsVault para Android](https://github.com/D4vRAM369/ThreadsVault/) a ThreadsVault-desktop funciona a la perfección *(Android → PC ✅)*. La dirección inversa *(PC → Android)* aún no es compatible y se abordará en una versión futura.

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

[GPL-3.0](LICENSE) — igual que[ ThreadsVault para Android](https://github.com/D4vRAM369/ThreadsVault).
