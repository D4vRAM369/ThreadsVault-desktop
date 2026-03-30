# ThreadsVault Desktop

<img width="400" height="400" alt="threadsvault-desktop-icon" src="https://github.com/user-attachments/assets/e336810d-5130-4b7a-a275-fac97b15acec" />

<!-- badges -->
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)
![Cross Platform](https://img.shields.io/badge/Cross--Platform-Desktop%20%7C%20Web-blueviolet)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Local_DB-003B57?logo=sqlite&logoColor=white)
![IndexedDB](https://img.shields.io/badge/IndexedDB-Dexie-yellow)
![License](https://img.shields.io/badge/license-GPL--3.0-green)
![PBL](https://img.shields.io/badge/method-PBL-blueviolet)
[![Claude Code](https://img.shields.io/badge/Assistant-Claude%20Code-D97706)](https://www.anthropic.com/claude-code)
[![Codex](https://img.shields.io/badge/Assistant-Codex-111827)](https://openai.com/)

<p align="left">
  <a href="./README_spanish-version.md">Leer en español</a>
</p>

> A local vault for your Threads posts. No cloud. No tracking. No account needed.

ThreadsVault Desktop is the desktop version of [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault). The idea is simple: paste a Threads post URL, it gets extracted and saved locally — and it's yours. Close the app and reopen it whenever you want: the text and images of your saved posts will still be there.

You can organize posts into categories, the app indexes post hashtags, and you can attach personal notes when saving — making your vault easy to search without depending solely on Threads' built-in Saved feature 🗄🧵

---

## Screenshots

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="assets/screenshots/vault_empty.png" alt="Empty vault" /><br/>
      <b>Empty vault</b><br/>
      <sub>Main screen on first launch</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_categories.png" alt="Categories" /><br/>
      <b>Categories</b><br/>
      <sub>Create and organize with color and icon</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/screenshots/settings_privacy.png" alt="Settings" /><br/>
      <b>Privacy & settings</b><br/>
      <sub>Backup, privacy, keyboard shortcuts</sub>
    </td>
  </tr>
   <tr>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/c1b6d4e5-96eb-4736-8d11-67a78626a307" alt="Bóveda con posts en modo claro" /><br/>
      <b>Vault with posts (new light mode since v2.1.0)</b><br/>
      <sub>Home screen with light mode and saved posts</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/57389305-7c3c-4ad5-b5a5-876a5a8c4c37" alt="Categorías - Modo claro" /><br/>
      <b>Categories</b><br/>
      <sub>Category view in light mode</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://github.com/user-attachments/assets/8b901aa7-4d31-4687-b3f2-7c525cce76a0" alt="Ajustes" /><br/>
      <b>Privacy and Settings</b><br/>
      <sub>Light mode</sub>
    </td>
  </tr>
</table>

---

## Key features

- **Save posts by URL** — paste a Threads link and hit save. Title, author, text and images are extracted automatically.
- **Local storage** — SQLite on desktop (via Tauri), IndexedDB in browser. Nothing leaves your device.
- **Categories** — organize your posts into custom categories. Uncategorized posts go to a default inbox.
- **Backup & restore** — export your entire vault as JSON and import it whenever you want. On import, the app shows progress and confirms how many posts and categories were restored.
- **Media cache & built-in player** — images are cached locally as data URLs; videos are downloaded and stored offline, playable directly inside the app with an option to download them.
- **Personal notes** — add, edit or delete notes on any saved post directly from its detail screen.
- **Keyboard shortcuts** — navigate and search without a mouse: `Esc` go back, `Ctrl+N` add, `/` or `Ctrl+F` search, `←` `→` navigate between posts.
- **ES/EN internationalization** — the UI language is resolved automatically at startup from your OS locale. No configuration needed. Spanish and English fully supported across all screens.
- **No telemetry** — no analytics, no error reporting, no external requests beyond post extraction. Everything runs 100% locally: not even the developer has access to your data.

---

## Installation

### Windows

Download the installer from [Releases](../../releases) and run it:

| Format | Description |
|---|---|
| `.exe` | Standard installer — recommended |
| `.msi` | MSI package for managed/enterprise environments |

Installs to `%LocalAppData%\threadsvault-desktop` and creates a Start Menu shortcut.

### Linux

Multiple formats available in [Releases](../../releases):

| Format | How to use |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |
| `.rpm` | `sudo rpm -i threadsvault-desktop_*.rpm` |
| `.flatpak` | `flatpak install ThreadsVault-desktop-*.flatpak` |

> *Note: If the AppImage doesn't launch on Ubuntu 22.04+, run `sudo apt install libfuse2`.*

---

## How it works

1. Copy the URL of a Threads post (e.g. `https://www.threads.net/@user/post/abc123`)
2. Open the app → click the **+Add** button in the top right corner.
3. Paste the URL and click **Save**, optionally adding notes.
4. The app extracts the post content using a two-step system: Jina Reader is the primary method, with a direct fallback to Threads' embedded React state when Jina is unavailable or rate-limited.
5. If the URL is part of a thread, the app automatically detects and extracts all posts in the sequence — no need to save them one by one _(v2.2.0 update feature)_
6. The post (or thread) is saved locally. Done.

---

## Privacy

- All data is stored in a local SQLite database (`%AppData%\threadsvault-desktop` on Windows, `~/.local/share/threadsvault-desktop` on Linux)
- The only external requests go to `r.jina.ai`: when explicitly saving a post, and in the background if the app detects outdated images on load
- No usage data, no error reporting, no telemetry of any kind

---

## Known limitations

- **Threads only** — designed specifically for Threads posts; other URLs may not extract correctly
- **Extraction reliability** — occasionally a post may not extract perfectly on the first attempt. If text formatting or images look off, use the Refresh button to re-extract.
- **macOS not supported** — requires an Apple Developer account ($99/year) for notarization; not planned for v2.x
- **Backup compatibility** — importing backups from [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault/) into ThreadsVault-desktop works seamlessly *(Android → Desktop ✅)*. The reverse direction *(Desktop → Android)* is not yet supported and will be addressed in a future version.
---

## Build from source

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

The compiled binary will be in `src-tauri/target/release/bundle/`.

For development with hot-reload:
```bash
npm run tauri dev
```

Browser-only mode (no Tauri, uses IndexedDB instead of SQLite):
```bash
npm run dev
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 |
| Frontend | Svelte 5 (runes) + TypeScript |
| Styles | Tailwind CSS v4 |
| Storage (desktop) | SQLite via `@tauri-apps/plugin-sql` |
| Storage (browser) | Dexie (IndexedDB) |
| Post extraction | Jina Reader (`r.jina.ai`) + direct HTML fallback |
| i18n | Custom `i18n.ts` (~130 keys, ES/EN) |

---

## Development approach

Built through **PBL (Project-Based Learning)** — documented with learning artifacts for personal use and study sessions.

Developed primarily with assistance from **Claude Code** and to a lesser extent **ChatGPT-5.3-Codex**.

---

## License

[GPL-3.0](LICENSE) — same as [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault).
