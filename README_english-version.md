# ThreadsVault Desktop

<!-- badges -->
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Svelte](https://img.shields.io/badge/Svelte-5-red)
![License](https://img.shields.io/badge/license-GPL--3.0-green)
![PBL](https://img.shields.io/badge/method-PBL-blueviolet)

> A local vault for your Threads posts. No cloud. No tracking. No account required.

ThreadsVault Desktop is the desktop companion to [ThreadsVault for Android](https://github.com/D4vRAM369/ThreadsVault). Paste a Threads post URL — it gets extracted, stored locally, and stays yours. Close the app, open it a year later, your posts are still there.

---

## Key Features

- **Save posts by URL** — paste a Threads link, hit save. Title, author, text and images are extracted automatically.
- **Local-first storage** — SQLite on desktop (via Tauri), IndexedDB in browser. Nothing leaves your device.
- **Categories** — organize posts into custom categories. Uncategorized posts go to a default bucket.
- **Backup & restore** — export your entire vault as JSON, import it back anytime.
- **Media caching** — images are cached locally as data URLs so posts survive CDN link expiration.
- **Video player** — embedded video player for Threads videos with CDN fallback handling.
- **No telemetry** — no analytics, no crash reports, no external requests beyond post extraction.

---

## Installation

### Windows

Download the latest `.exe` installer from [Releases](../../releases) and run it.
NSIS installer — installs to `%LocalAppData%\threadsvault-desktop` and creates a Start Menu shortcut.

### Linux

Two options from [Releases](../../releases):

| Format | How to run |
|---|---|
| `.AppImage` | `chmod +x ThreadsVault_*.AppImage && ./ThreadsVault_*.AppImage` |
| `.deb` | `sudo dpkg -i threadsvault-desktop_*.deb` |

> **Note:** AppImage requires FUSE. On Ubuntu 22.04+ run `sudo apt install libfuse2` if the AppImage doesn't start.

---

## How It Works

1. Copy a Threads post URL (e.g. `https://www.threads.net/@user/post/abc123`)
2. Open the app → click the **+** button (Share screen)
3. Paste the URL and hit **Save**
4. The app extracts post content via [Jina Reader](https://jina.ai/reader/) — a headless-browser proxy — because Threads is a React SPA that returns empty HTML on direct fetch
5. Post is saved locally. Done.

---

## Privacy

- All data is stored in a local SQLite database (`%AppData%\threadsvault-desktop` on Windows, `~/.local/share/threadsvault-desktop` on Linux)
- The only external request made is to `r.jina.ai` during post extraction — and only when you explicitly save a post
- No usage data, no crash reports, no telemetry of any kind

---

## Known Limitations

- **Threads only** — designed specifically for Threads posts; other URLs may not extract correctly
- **Extraction depends on Jina** — if `r.jina.ai` is down or rate-limits, extraction fails gracefully
- **CDN video links** — Threads CDN URLs expire; the app attempts a page re-fetch on playback failure
- **No search** — full-text search planned for v1.1+
- **No bulk operations** — delete/recategorize multiple posts at once: v1.1+
- **macOS not supported** — requires Apple Developer account ($99/year) for notarization; not planned for v1.x

---

## Build From Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable toolchain)
- On Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `patchelf` (`sudo apt install ...`)

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

Or browser-only (no Tauri, uses IndexedDB instead of SQLite):
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

Built using **PBL (Project-Based Learning)** — real problems driving real features, documented as learning artifacts. Development sessions logged in `docs/`.

Developed primarily with **Claude Code**, and to a lesser extent with **ChatGPT-5.3-Codex**.

---

## License

[GPL-3.0](LICENSE) — same as ThreadsVault for Android.
