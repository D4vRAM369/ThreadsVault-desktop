# ThreadsVault Desktop

<img width="400" height="400" alt="threadsvault-desktop-icon" src="https://github.com/user-attachments/assets/e336810d-5130-4b7a-a275-fac97b15acec" />

<!-- badges -->
![Platform](https://img.shields.io/badge/plataforma-Windows%20%7C%20Linux-blue)
![Cross Platform](https://img.shields.io/badge/Cross--Platform-Desktop%20%7C%20Web-blueviolet)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Local_DB-003B57?logo=sqlite&logoColor=white)
![IndexedDB](https://img.shields.io/badge/IndexedDB-Dexie-yellow)
![License](https://img.shields.io/badge/licencia-GPL--3.0-green)
![PBL](https://img.shields.io/badge/método-PBL-blueviolet)
[![Claude Code](https://img.shields.io/badge/Assistant-Claude%20Code-D97706)](https://www.anthropic.com/claude-code)
[![Codex](https://img.shields.io/badge/Assistant-Codex-111827)](https://openai.com/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/D4vRAM369/ThreadsVault-desktop)

> A local vault for your Threads posts. No cloud. No tracking. No account required.

ThreadsVault Desktop is the desktop version of [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault). Its workflow is simple: paste the URL of a Threads post, it gets extracted, stored locally, and becomes yours. Close the app and open it whenever you want: the text and images of your saved posts will still be there (the program stores everything locally in the background after each save).

You can classify posts into different categories. The app indexes hashtags from publications, and you can also use them in personal notes when saving a post for easier searching inside your small personal vault of threads that you find interesting or relevant — stored locally without relying only on the basic “Saved” feature of Threads 🗄🧵

---

## Screenshots

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="assets/screenshots/vault_empty.png" alt="Bóveda vacía" /><br/>
      <b>Empty vault</b><br/>
      <sub>Main screen on first launch</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_categories.png" alt="Categorías" /><br/>
      <b>Categories</b><br/>
      <sub>Create and organize with color and icon</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_privacy.png" alt="Ajustes" /><br/>
      <b>Privacy & Settings</b><br/>
      <sub>Backup, privacy, keyboard shortcuts</sub>
    </td>
  </tr>
    <tr>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/c1b6d4e5-96eb-4736-8d11-67a78626a307" alt="Bóveda con posts en modo claro" /><br/>
      <b>Vault on new light mode (new light mode included in v2.1)</b><br/>
      <sub>Main screen with new light mode</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/57389305-7c3c-4ad5-b5a5-876a5a8c4c37" alt="Categorías - Modo claro" /><br/>
      <b>Categories</b><br/>
      <sub>Category view in light mode</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/8b901aa7-4d31-4687-b3f2-7c525cce76a0" alt="Ajustes" /><br/>
      <b>Privacy & Settings</b><br/>
      <sub>Backup, privacy, keyboard shortcuts</sub>
    </td>
  </tr>
</table>


---

## Main Features

- **Save posts by URL** — paste a Threads link and click save. Title, author, text, and images are extracted automatically.
- **Local storage** — SQLite on desktop (via Tauri), IndexedDB in the browser. Nothing leaves your device.
- **Categories** — organize posts into custom categories. Uncategorized posts go to a default inbox.
- **Backup & restore** — export your entire vault as JSON and import it whenever you want. When importing, the app shows the progress and confirms how many posts and categories were restored. ThreadsVault backups for Android can be imported here without any problems (Android → Desktop ✅). The reverse direction (Desktop → Android) is not yet supported and will be resolved in a future version.
- **Media caching** — images are cached locally as data URLs so posts survive CDN expiration.
- **Personal notes** — add, edit, or delete notes on any saved post directly from its detail screen.
- **Keyboard shortcuts** — navigate and search without a mouse: `Esc` back, `Ctrl+N` add, `/` or `Ctrl+F` search, `←` `→` navigate between posts.
- **No telemetry** — no analytics, no crash reports, no external requests beyond post extraction. Everything runs 100% locally (client-side): not even the developer has access to your data.

---

## Installation

### Windows

Download the `.exe` installer from [Releases](../../releases) and run it.  
It installs to `%LocalAppData%\threadsvault-desktop` and creates a shortcut in the Start Menu.

### Linux

Two options available in [Releases](../../releases):

| Format | How to use |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |

> *Note: If the AppImage does not launch on Ubuntu 22.04+, run `sudo apt install libfuse2`.*

Flatpak planned for future versions.

---

## How It Works

1. Copy the URL of a Threads post (e.g. `https://www.threads.net/@user/post/abc123`)
2. Open the app → click the **+Add** button in the top-right corner.
3. Paste the URL, click **Save**, and optionally add extra notes.
4. The app uses Jina Reader to extract the content — a service that acts like a real browser to read Threads posts, since direct access returns an empty page.
5. The post is stored locally. Done.

---

## Privacy

- All data is stored in a local SQLite database (`%AppData%\threadsvault-desktop` on Windows, `~/.local/share/threadsvault-desktop` on Linux)
- The only external requests go to `r.jina.ai`: when explicitly saving a post, and in the background if the app detects outdated images during loading
- No usage data, no crash reports, no telemetry of any kind

---

## Known Limitations

- **Threads only** — specifically designed for Threads posts; other URLs may not extract properly
- **Extraction depends on Jina** — if `r.jina.ai` is down or rate-limited, extraction fails gracefully
- **Threads videos** — videos are not played inline nor stored locally. Threads protects videos using signed, temporary CDN URLs. If a post contains video, the text, images, and a “View on Threads” button are saved, which opens the post directly in the system browser.
- **No bulk operations** — deleting or recategorizing multiple posts at once: v1.1+
- **macOS not supported** — requires an Apple Developer account ($99/year) for notarization; not planned for v1.x (likely not for 2.x either).

---

## Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable toolchain)
- On Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, `patchelf` (`sudo apt install ...`)

```bash
git clone https://github.com/D4vRAM369/threadsvault-desktop
cd threadsvault-desktop
npm install
npm run tauri build
```

The compiled binary will be located in `src-tauri/target/release/bundle/`.

For development with hot-reload:
```bash
npm run tauri dev
```

Browser-only mode (without Tauri, uses IndexedDB instead of SQLite):
```bash
npm run dev
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 |
| Frontend | Svelte 5 (runes) + TypeScript |
| Styling | Tailwind CSS v4 |
| Storage (desktop) | SQLite via `@tauri-apps/plugin-sql` |
| Storage (browser) | Dexie (IndexedDB) |
| Post extraction | Jina Reader (`r.jina.ai`) |

---

## Development Method

Built using **PBL (Project-Based Learning)** — documented with learning artifacts not included in the repository for personal use and theoretical study sessions with the program open.

Developed primarily with assistance from **Claude Code**, and to a lesser extent with **ChatGPT-5.3-Codex**.

---

## License

[GPL-3.0](LICENSE) — same as [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault).
