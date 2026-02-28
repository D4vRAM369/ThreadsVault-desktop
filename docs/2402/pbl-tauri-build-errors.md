# PBL Session — Errores de compilación Tauri en Windows

**Fecha:** 2026-02-28
**Proyecto:** ThreadsVault Desktop
**Stack:** Tauri v2 + Rust + Vite 7 + Svelte 5
**Duración:** 1 sesión

---

## Contexto de la sesión

Durante la sesión anterior implementamos el resolver GraphQL en Rust (`main.rs`) para obtener
URLs directas de vídeos de Threads. El código fue commiteado, pero no pudo verificarse porque
`cargo` no está en el PATH del shell bash de este entorno. Al ejecutar `npm run tauri dev` en
PowerShell apareció el error `Missing script: "tauri"` y luego errores de compilación Rust.

Esta sesión documenta los tres bugs encontrados, por qué ocurrieron y cómo se solucionaron.

---

## Error 1 — `npm error Missing script: "tauri"`

### ¿Qué pasó?

```
PS C:\Users\psico\threadsvault-desktop> npm run tauri dev
npm error Missing script: "tauri"
```

### ¿Por qué ocurrió?

**`npm run <nombre>`** busca el nombre en la sección `"scripts"` del `package.json`. Si no existe,
falla con ese error. El proyecto tenía estos scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "check": "svelte-check ..."
}
```

No había ningún script `"tauri"`. Además, `@tauri-apps/cli` (el binario de la CLI de Tauri) no
estaba instalado como devDependencia.

### ¿Qué es `@tauri-apps/cli`?

Es el paquete npm que contiene el ejecutable `tauri`. Ese binario hace de **orquestador**:
- Arranca el servidor de desarrollo de Vite (`beforeDevCommand`)
- Lanza la compilación de Rust con `cargo`
- Abre la ventana nativa WebView
- Vigila cambios en `src-tauri/` para recompilar en caliente

Sin este paquete instalado, no existe el comando `tauri` y npm no puede ejecutarlo.

### Fix aplicado

```bash
npm install --save-dev @tauri-apps/cli@^2
```

Y en `package.json` se añadió el script puente:

```json
"scripts": {
  "tauri": "tauri"
}
```

El script `"tauri": "tauri"` le dice a npm que cuando alguien escriba `npm run tauri <args>`,
ejecute el binario `tauri` de `node_modules/.bin/tauri` con esos argumentos. En este caso
`npm run tauri dev` → ejecuta `tauri dev`.

---

## Error 2 — `icons/icon.ico not found`

### El error completo

```
error: failed to run custom build command for threadsvault-desktop v0.0.0
Caused by:
  process didn't exit successfully: ...build-script-build (exit code: 1)

  icons/icon.ico not found; required for generating a Windows Resource file during tauri-build
```

### ¿Qué es un "build script" en Rust?

En Rust, un archivo llamado `build.rs` en la raíz del crate es un **build script**: código que
se ejecuta **antes** de compilar el código real. Se declara en `Cargo.toml` con `build = "build.rs"`.

`tauri-build` (la dependencia de build del proyecto) usa este mecanismo para:
1. Leer `tauri.conf.json` y generar código de configuración
2. En Windows: crear un **Windows Resource File** (`.rc`) que embebe el ícono en el `.exe`

Un Resource File le dice a Windows "este ejecutable tiene este ícono". Sin él, el `.exe` no
tendría ícono en el Explorador de archivos ni en la barra de tareas.

### ¿Por qué no existía `icons/icon.ico`?

El proyecto nunca había pasado por el paso de inicialización completo de Tauri (`tauri init`),
que genera la carpeta `src-tauri/icons/` con iconos por defecto. El directorio `src-tauri/` fue
creado a mano y no incluía esos assets.

### ¿Qué formatos de icono genera Tauri?

| Archivo | Plataforma | Uso |
|---------|------------|-----|
| `icon.ico` | Windows | Embebido en el `.exe`, mostrado en Explorer y barra de tareas |
| `icon.icns` | macOS | Bundle de la app `.app`, mostrado en Finder y Dock |
| `icon.png` | Linux | Escritorio y menú |
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | Todas | Varios contextos |
| `Square*Logo.png` | Windows (MSIX) | Microsoft Store packaging |
| `AppIcon-*.png` | iOS | App Store y pantalla de inicio |
| `mipmap-*/ic_launcher*.png` | Android | Google Play y lanzador |

### Fix aplicado

```bash
npm run tauri icon public/icon-app.png
```

`tauri icon <imagen>` toma una imagen PNG de al menos 1024×1024px y genera automáticamente
todos los tamaños y formatos necesarios para cada plataforma, colocándolos en `src-tauri/icons/`.

**¿Por qué funciona con `public/icon-app.png` aunque no sea 1024×1024?**
Tauri escala la imagen de origen. No es lo ideal para producción (la calidad sufre), pero es
perfectamente válido para desarrollo. Para producción se debería usar una imagen vectorial
exportada a PNG a 1024×1024px.

---

## Error 3 — La ventana se abrió y se cerró (port mismatch)

### ¿Qué pasó?

La ventana de Tauri se abrió brevemente y luego se cerró. El log mostraba:

```
Port 5173 is in use, trying another one...
Port 5174 is in use, trying another one...
VITE v7.3.1 ready in 984 ms
➜  Local:   http://localhost:5175/
```

Pero `tauri.conf.json` tenía:

```json
"devUrl": "http://localhost:5173"
```

### ¿Por qué ocurre el "port mismatch"?

Cuando ejecutas `npm run tauri dev`, Tauri:
1. Lanza el comando `beforeDevCommand` → `npm run dev` → Vite
2. Espera a que la URL definida en `devUrl` responda con HTTP 200
3. Abre la ventana WebView apuntando a `devUrl`

Si Vite arranca en el **puerto 5175** porque 5173 y 5174 ya los tiene ocupados (por sesiones
anteriores de `npm run dev` que no se cerraron), Tauri intenta cargar `localhost:5173` que no
existe → la WebView no carga → la app parece que se cierra.

### ¿Por qué había puertos ocupados?

Durante el desarrollo frontend normal se usa `npm run dev` directamente. Si no se detiene
(Ctrl+C), el proceso Vite sigue vivo en background y conserva el puerto. La siguiente vez que
se lanza otro `npm run dev` (ya sea manualmente o por Tauri), Vite detecta el conflicto y busca
el siguiente puerto libre.

### Fix aplicado

**1. Fijar el puerto en `vite.config.ts`:**

```typescript
server: {
  port: 1420,
  strictPort: true,
}
```

- `port: 1420` — Puerto fijo. 1420 es el puerto convencional de Tauri (poco usado por otras apps).
- `strictPort: true` — Si el puerto está ocupado, Vite **falla con error en vez de buscar el
  siguiente**. Esto hace el problema visible ("puerto en uso") en lugar de silencioso (saltar al
  5175 sin avisar).

**2. Actualizar `tauri.conf.json`:**

```json
"devUrl": "http://localhost:1420"
```

Para que Tauri espere en el mismo puerto donde Vite siempre arranca.

### ¿Por qué 1420 y no 5173?

5173 es el puerto por defecto de Vite. Cualquier proyecto Vite lo usa, lo que aumenta la
probabilidad de conflictos si tienes varios proyectos abiertos. 1420 es el puerto que el propio
equipo de Tauri usa en su template oficial, precisamente para evitar este conflicto.

---

## Diagrama de lo que hace `npm run tauri dev`

```
npm run tauri dev
│
├─ Lee tauri.conf.json
│   └─ beforeDevCommand: "npm run dev"
│   └─ devUrl: "http://localhost:1420"
│
├─ Ejecuta npm run dev  ─────────────────── Vite arranca en :1420
│   (espera hasta que devUrl responde 200)
│
├─ Ejecuta cargo run ────────────────────── Compila src-tauri/
│   └─ build.rs (tauri-build) ──────────── Lee tauri.conf.json
│       └─ Windows: lee icons/icon.ico ─── Embebe en .exe
│       └─ Genera código de permisos
│   └─ main.rs ─────────────────────────── Tu código Rust
│
└─ Abre WebView ─────────────────────────── Carga http://localhost:1420
    └─ Muestra el frontend Svelte
    └─ Expone invoke() para llamar funciones Rust
```

---

## Diferencias: `npm run build` vs `npm run tauri dev`

Esta es la pregunta clave: ¿por qué antes compilaba sin errores?

| | `npm run build` | `npm run tauri dev` |
|--|--|--|
| **Qué compila** | Solo el frontend (Vite → `dist/`) | Frontend Vite + backend Rust |
| **Qué valida** | TypeScript, Svelte, imports CSS | Todo lo anterior + Cargo.toml, main.rs |
| **Qué assets necesita** | HTML, JS, CSS, imágenes de `public/` | Todo lo anterior + `src-tauri/icons/` |
| **Resultado** | Carpeta `dist/` con HTML/JS/CSS | Ejecutable `.exe` con WebView integrado |
| **Dónde corre el código JS** | En el navegador | En el WebView de la ventana nativa |
| **Acceso a APIs nativas** | No (solo browser APIs) | Sí (vía `invoke()` → Rust) |

**Resumen:** `npm run build` solo verifica el frontend. El código Rust nunca se compilaba.
Los errores de Rust solo aparecen cuando se usa `npm run tauri dev` o `npm run tauri build`.

---

## Aprendizajes clave

1. **Un proyecto Tauri tiene dos compiladores**: Vite (para TypeScript/Svelte) y `cargo`
   (para Rust). Deben funcionar los dos.

2. **Los build scripts de Rust** (`build.rs`) se ejecutan antes del código principal y pueden
   requerir assets externos — en este caso los iconos.

3. **`strictPort: true` en Vite** es esencial cuando Tauri hardcodea un `devUrl`. Sin él,
   Vite silenciosamente cambia de puerto y la WebView carga una URL muerta.

4. **La ventana "que se cierra sola"** casi siempre es un port mismatch o un error de Rust
   en la inicialización. Mirar la salida completa del terminal (no solo la ventana) revela la causa.

5. **`npm run tauri icon <imagen>`** es el comando estándar para generar todos los assets de
   icono de un golpe desde una sola imagen fuente.

---

## Estado final del proyecto tras esta sesión

```
src-tauri/
├── icons/           ← NUEVO: generado con `tauri icon public/icon-app.png`
│   ├── icon.ico     ← necesario para compilar en Windows
│   ├── icon.icns    ← macOS
│   ├── icon.png     ← Linux
│   ├── 32x32.png, 64x64.png, 128x128.png, 128x128@2x.png
│   ├── Square*Logo.png   ← Windows Store
│   ├── ios/         ← AppIcon-*.png
│   └── android/     ← mipmap-*/
├── src/main.rs      ← GraphQL resolver (sesión anterior)
└── tauri.conf.json  ← devUrl: http://localhost:1420  ← ACTUALIZADO
vite.config.ts       ← server.port: 1420, strictPort: true  ← ACTUALIZADO
package.json         ← script "tauri": "tauri" + @tauri-apps/cli ← AÑADIDO
```

**Comando para lanzar la app en desarrollo (en PowerShell con Rust instalado):**

```powershell
npm run tauri dev
```
