# PBL — Fix: Reproductor de vídeo embebido en ThreadsVault

**Sesión**: 28 febrero 2026
**Archivos modificados**:
- `src/lib/utils/post-extractor.ts`
- `src/routes/PostDetailScreen.svelte`

---

## El problema raíz — Por qué el vídeo nunca cargaba

### Conceptos clave

**SPA (Single Page Application)**
Una SPA es una web que carga una sola vez un "shell" HTML vacío, y el resto del contenido lo genera JavaScript en el navegador del usuario. Threads es una SPA React. Cuando haces `fetch("https://www.threads.net/@usuario/post/ID")` en código, obtienes el shell vacío — no el contenido del post. El servidor no renderiza el HTML del post, lo hace el cliente.

**CDN con URLs firmadas**
CDN = Content Delivery Network. Es una red de servidores distribuidos que sirven los archivos (imágenes, vídeos) de forma rápida según la ubicación del usuario. Meta/Instagram usa URLs firmadas para sus vídeos: incluyen un token de autenticación que caduca a los pocos minutos. Si intentas acceder a esa URL sin el token correcto (o con uno caducado), el servidor rechaza la petición.

Ejemplo de URL firmada de Meta CDN:
```
https://scontent-mad1-1.cdninstagram.com/v/t51.71878-15/video.mp4
  ?_nc_cat=108
  &ccb=1-7
  &_nc_sid=18de74
  &_nc_ohc=TOKEN_SECRETO_QUE_CADUCA
  ...
```

**Por qué el fix anterior (Jina Reader) no encontraba el vídeo**
Jina Reader (`r.jina.ai`) hace un fetch con headless browser y devuelve el contenido renderizado como markdown. Pero el contenido que devuelve para Threads incluye el thumbnail del vídeo (imagen previa, CDN tipo `t51.71878`) — no la URL del stream `.mp4`. Threads nunca incluye la URL del vídeo en el HTML público.

---

## La solución — API oEmbed de Threads

### ¿Qué es oEmbed?

oEmbed es un estándar web abierto (especificado en oembed.com) que permite a una web ofrecer su contenido "incrustable" en otras páginas. Funciona así:
1. Tienes la URL de un post: `https://www.threads.net/@pabloparedes.mx/post/DVOvDwMCsCY`
2. Llamas al endpoint oEmbed: `https://www.threads.net/oembed?url=URL_DEL_POST`
3. Threads devuelve un JSON con el HTML del reproductor oficial

Ejemplo de respuesta:
```json
{
  "author_name": "pabloparedes.mx",
  "html": "<blockquote class=\"text-post-media\" data-media-id=\"DVOvDwMCsCY\">
              <p>Convertir cualquier #imagen a #icono svg</p>
           </blockquote>
           <script async src=\"https://www.threads.net/embed/embed.js\"></script>"
}
```

Ese `html` es el **reproductor oficial de Threads** — es exactamente el mismo código que Threads usa cuando alguien quiere embeber un post en un blog o web externa.

### ¿Por qué oEmbed funciona cuando fetch directo no funciona?

| Método | Qué hace | Problema |
|--------|----------|---------|
| `fetch(URL_POST)` directo | Pide el HTML del post | Threads devuelve SPA shell vacío |
| Jina Reader | Renders SPA, devuelve markdown | Markdown tiene thumbnail, no .mp4 |
| oEmbed API | Pide el reproductor embebido | **Threads lo tiene que dar** — es su API oficial de embedding |

La API oEmbed es diferente porque es un endpoint de API REST, no una página SPA. Devuelve JSON, no HTML React.

---

## `<iframe srcdoc="...">` — El truco central

### ¿Qué es un iframe?

Un `<iframe>` (Inline Frame) es un elemento HTML que renderiza otra página web dentro de la página actual. Es como una ventana dentro de tu ventana.

### `src` vs `srcdoc`

```html
<!-- src: carga una URL externa -->
<iframe src="https://www.threads.net/embed/post/ID"></iframe>
<!-- PROBLEMA: Threads envía X-Frame-Options: SAMEORIGIN
     → el navegador bloquea el iframe -->

<!-- srcdoc: inyecta HTML como string directamente -->
<iframe srcdoc="<!DOCTYPE html>...<script src=embed.js></script>..."></iframe>
<!-- SOLUCIÓN: el HTML viene de nosotros, no de Threads
     → no hay X-Frame-Options, el script embed.js carga y renderiza el vídeo -->
```

**X-Frame-Options: SAMEORIGIN** es una cabecera HTTP que dice "este contenido solo puede aparecer en un iframe si el iframe y la página principal tienen el mismo dominio". Threads la usa para evitar que terceros embeben posts sin pasar por su sistema oficial. Pero con `srcdoc`, el HTML del iframe viene del propio sistema de la app, no de la URL de Threads, por lo que no aplica.

### El atributo `sandbox`

```html
<iframe sandbox="allow-scripts allow-same-origin allow-popups">
```

`sandbox` es una capa extra de seguridad para iframes. Sin `sandbox`, el iframe puede hacer todo. Con `sandbox` vacío, no puede hacer nada. Los valores que desbloqueamos:

| Valor | ¿Qué desbloquea? | ¿Por qué lo necesitamos? |
|-------|-----------------|--------------------------|
| `allow-scripts` | Ejecutar JavaScript | El `embed.js` de Threads necesita correr para renderizar el vídeo |
| `allow-same-origin` | Acceso a cookies y fetch de origen | embed.js necesita llamar a la API de Threads para cargar el contenido |
| `allow-popups` | Abrir ventanas nuevas | Los links del post embebido pueden abrirse en el navegador |

---

## `Promise.all` — Paralelismo explicado

### El problema de secuencialidad (el bug anterior del extractor)

```typescript
// ANTES — Secuencial. Cada await espera a que el anterior termine.
const result1 = await fetchA()  // espera 8s
const result2 = await fetchB()  // espera otros 8s
const result3 = await fetchC()  // espera otros 8s
// Tiempo total: 8 + 8 + 8 = 24 segundos
```

### La solución con `Promise.all`

```typescript
// DESPUÉS — Paralelo. Las 3 peticiones arrancan al mismo tiempo.
const [result1, result2, result3] = await Promise.all([
  fetchA(),  // arranca en t=0
  fetchB(),  // arranca en t=0
  fetchC(),  // arranca en t=0
])
// Tiempo total: max(8, 8, 8) = 8 segundos
```

**¿Qué es una Promise?**
Una Promise es un objeto que representa una operación asíncrona que aún no ha terminado. Tiene 3 estados:
- `pending` → la operación está en curso
- `fulfilled` → la operación terminó con éxito (tiene un valor)
- `rejected` → la operación falló (tiene un error)

`await` pausa la ejecución hasta que la Promise cambia de `pending` a `fulfilled` o `rejected`.

`Promise.all([p1, p2, p3])` crea una nueva Promise que:
- Arranca p1, p2 y p3 **al mismo tiempo**
- Espera a que **todas** terminen
- Devuelve un array con los resultados en el mismo orden

### En este fix: 3 métodos en paralelo

```typescript
const [desktopResolution, resolvedUrl, oembedHtml] = await Promise.all([
  resolveDesktopVideo(postUrl),     // Tauri/Rust → fetch nativo sin CORS
  resolvePlayableVideoUrl(postUrl), // JS → intenta extraer .mp4 del HTML
  fetchOEmbedHtml(postUrl),         // oEmbed API → HTML del reproductor oficial
])
```

Prioridad de uso del resultado:
1. Si `desktopResolution.playableUrl` → URL directa (mejor para descargar)
2. Si `resolvedUrl` → URL directa desde web (raro en Threads)
3. Si `oembedHtml` → iframe con reproductor oficial (**nuestro fix**)
4. Si todo falla → estado de error

---

## Flujo completo del vídeo — antes y después

### Antes

```
onMount
  └─ loadInlineVideo(media)
       ├─ await resolveDesktopVideo()     → 8s → null (Threads oculta URLs)
       ├─ await resolvePlayableVideoUrl() → 8s → null (mismo motivo)
       └─ status = 'error' ← el usuario ve "No se pudo resolver el stream"
```

### Después

```
onMount
  └─ loadInlineVideo(media)
       └─ Promise.all([
            resolveDesktopVideo(),       → 8s → null
            resolvePlayableVideoUrl(),   → 8s → null
            fetchOEmbedHtml()            → ~1-2s → "<blockquote>...<script>..."
          ])
          │
          ├─ desktopResolution.playableUrl? → NO
          ├─ resolvedUrl? → NO
          ├─ oembedHtml?  → SÍ ✓
          └─ status = 'ready', embedHtml = buildEmbedPage(oembedHtml)
               └─ <iframe srcdoc="..."> renderiza el reproductor de Threads
```

---

## Código completo de cada función

### `fetchOEmbedHtml` — `post-extractor.ts`

```typescript
export async function fetchOEmbedHtml(postUrl: string): Promise<string | null> {
  // tryFetchJson hace un fetch con timeout de 8s y devuelve el JSON parseado o null
  const data = await tryFetchJson(
    `https://www.threads.net/oembed?url=${encodeURIComponent(postUrl)}`
  )
  // encodeURIComponent convierte la URL en formato seguro para query strings:
  // "https://threads.net/@user/post/ID" → "https%3A%2F%2Fthreads.net%2F%40user..."
  return data?.html ?? null
  // data?.html → acceso seguro: si data es null, devuelve undefined (no error)
  // ?? null    → si undefined, devuelve null
}
```

### `buildEmbedPage` — `PostDetailScreen.svelte`

```typescript
function buildEmbedPage(embedHtml: string): string {
  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>',
    'html,body{margin:0;padding:8px;background:#0a0a14;box-sizing:border-box;}',
    'blockquote{margin:0!important;max-width:100%!important;}',
    '</style>',
    '</head><body>',
    embedHtml,   // ← el blockquote + script de Threads se insertan aquí
    '</body></html>',
  ].join('')
  // .join('') une el array de strings sin separador → una sola cadena HTML
}
```

El CSS dentro:
- `background:#0a0a14` → fondo oscuro igual al de la app (no queda blanco raro)
- `padding:8px` → pequeño margen interior para que el reproductor no quede pegado al borde
- `blockquote{margin:0!important}` → el blockquote de Threads tiene un margen por defecto que queremos eliminar

### El `<iframe>` en la plantilla

```svelte
{:else if state.status === 'ready' && state.embedHtml}
  <iframe
    srcdoc={state.embedHtml}
    sandbox="allow-scripts allow-same-origin allow-popups"
    class="w-full rounded-xl mb-3"
    style="height: 520px; border: none; background: #0a0a14; border-radius: 12px; display: block;"
    title="Vídeo embebido de Threads"
  ></iframe>
```

Condición `{:else if state.status === 'ready' && state.embedHtml}`:
- El bloque anterior ya cubre `status === 'ready' && state.src` (vídeo directo)
- Este bloque cubre el caso en que tenemos el HTML del embed pero no una URL directa
- `&&` = "y" lógico: ambas condiciones deben ser verdaderas

`height: 520px` fija la altura del iframe. El embed de Threads tiene contenido de altura variable. 520px funciona para la mayoría de posts sin necesitar lógica de auto-resize.

---

## Variables de estado del vídeo — mapa completo

```typescript
inlineVideoState: Record<string, {
  status: 'idle'    // estado inicial, no se ha intentado cargar
        | 'loading' // Promise.all en vuelo, esperando respuestas
        | 'ready'   // vídeo listo para mostrar
        | 'error'   // todos los métodos fallaron

  src?: string        // URL directa del vídeo (.mp4/.m3u8) — para <video src>
  downloadSrc?: string // URL preferida para descargar (puede diferir de src)
  reason?: string     // mensaje de error human-readable

  source?: 'desktop'  // resuelta por Tauri/Rust
          | 'web'     // resuelta por fetch JS
          | 'embed'   // oEmbed iframe — nuestro nuevo fallback

  embedHtml?: string  // HTML completo de la página del iframe srcdoc
}>
```

`Record<string, T>` es un tipo TypeScript que significa "un objeto cuyas claves son strings y cuyos valores son de tipo T". Aquí la clave es el `media.id` de cada item de media del post. Así tenemos estado independiente para cada vídeo en el post.

---

## Qué ocurre en el template según cada estado

```
status = 'idle'    → nada visible aún
status = 'loading' → spinner animado + "Cargando vídeo…" + "Buscando fuente reproducible…"
status = 'ready' + src       → <video controls src="..."> (reproductor HTML5 nativo)
status = 'ready' + embedHtml → <iframe srcdoc="..."> (reproductor de Threads)
status = 'error'   → "Vídeo en Threads" + "Threads protege sus vídeos…" + [Reintentar] [Ver en Threads ↗]
```

---

## Lo que descubrimos en producción — El 503 de Threads

### Qué es un HTTP 503

HTTP es el protocolo de comunicación de la web. Cada respuesta del servidor incluye un **código de estado**:
- `200 OK` → éxito, el servidor devolvió lo que pedías
- `503 Service Unavailable` → el servidor rechaza la petición (por sobrecarga, mantenimiento, o bloqueo activo)

### Diagnóstico real con las Network Requests

Herramienta usada: `read_network_requests` del MCP de Chrome — muestra todas las peticiones HTTP que hace la página, sus URLs, métodos (GET/POST) y códigos de respuesta.

Al cargar el post `/post/67` en el navegador (localhost:5173), se realizaron estas 3 peticiones:

| URL | Método | Status |
|-----|--------|--------|
| `https://www.threads.com/@pabloparedes.mx/post/DVOvDwMCsCY` | GET | **503** |
| `https://r.jina.ai/https://www.threads.com/...` | GET | **200** |
| `https://www.threads.net/oembed?url=https%3A%2F%2F...` | GET | **503** |

**Conclusión**: Threads devuelve 503 a **todas** las peticiones automatizadas desde IPs de usuario normal. Esto incluye la petición directa al post Y la petición oEmbed. Solo Jina Reader devuelve 200 porque sus servidores tienen IPs de confianza que Threads no bloquea.

### Por qué el 503 no es un error CORS

Un error **CORS** (Cross-Origin Resource Sharing) ocurre cuando el servidor responde pero el navegador bloquea que tu código lea esa respuesta. El servidor devuelve 200 OK pero el navegador intercepta y lanza error.

Un **503** es diferente: el servidor directamente rechaza la petición antes de procesarla. No llega a tu código JavaScript. La distinción importa porque:
- CORS → fix posible con headers del servidor o proxies
- 503 de bot-detection → Threads activamente evita el acceso automatizado

### Por qué Jina funciona y el fetch directo no

```
fetch directo desde localhost:5173
  └─ IP del usuario → Threads identifica como bot → 503

Jina Reader (r.jina.ai)
  └─ IP de Jina (headless browser en sus servidores)
     → Threads confía en Jina → 200 → Jina convierte a markdown → devuelve a ti
```

Jina actúa como intermediario ("proxy"). Sus servidores hacen el fetch por ti usando un navegador real (Chromium headless), igual que si un humano abriera la página. Threads no puede distinguir a Jina de un usuario real.

### Por qué Jina tampoco da el stream del vídeo

Aunque Jina renderiza la página correctamente (obtiene 200), el stream del vídeo de Threads **no está en el HTML renderizado**. Los vídeos en Threads se cargan así:

```
1. El JS de Threads hace una petición autenticada a la API de Meta
   GET https://i.instagram.com/api/v1/media/{id}/info/
   Authorization: Bearer {TOKEN_DE_SESIÓN_DEL_USUARIO}

2. La API devuelve JSON con las URLs del vídeo (firmadas, caducan en minutos)

3. El player de Threads reproduce esa URL
```

Jina ejecuta el JS pero no tiene una sesión de usuario de Threads → la petición autenticada falla → el player no carga el vídeo → Jina no tiene la URL del stream para devolverte. Lo que sí devuelve Jina: el texto del post, las imágenes (incluyendo el thumbnail del vídeo), los hashtags.

---

## El fix real aplicado — UX honesta sobre la limitación

Como el stream es técnicamente inaccesible sin autenticación, el fix definitivo fue cambiar el **estado de error** de un mensaje técnico confuso a un estado informativo y accionable:

### Antes
```
[icono play]  Vídeo embebido
              No se pudo resolver un stream publico para este video.
[Cargando…]  [Abrir enlace]
```
Problemas:
- "No se pudo resolver" suena a bug de la app
- "Cargando…" es el botón cuando status es 'idle', en 'error' era "Reintentar vídeo"
- El usuario no sabe si es un error temporal o permanente

### Después
```
[spinner]     Cargando vídeo…               ← durante loading
              Buscando fuente reproducible…

[icono play]  Vídeo en Threads              ← en error
              Threads protege sus vídeos. Ábrelo directamente para reproducirlo.
[Reintentar]  [Ver en Threads ↗]
```
Mejoras:
- Spinner animado durante la carga (feedback visual activo)
- Mensaje honesto: "Threads protege sus vídeos" — no es un bug, es una limitación de la plataforma
- "Ver en Threads ↗" como CTA primario en color más prominente
- "Reintentar" disponible por si fue un error de red temporal

### Los cambios en el template

**Spinner de carga** — el `{#if state.status === 'loading'}` dentro del icono:
```svelte
{#if state.status === 'loading'}
  <div class="w-5 h-5 rounded-full animate-spin" style="
    border: 2px solid rgba(200,180,255,0.2);
    border-top-color: #c8b4ff;
  "></div>
{:else}
  <svg ...><polygon points="5 3 19 12 5 21 5 3"/></svg>
{/if}
```
`animate-spin` es una clase de Tailwind que aplica `animation: spin 1s linear infinite` — una rotación continua de 360°. El truco visual del spinner: el borde tiene opacidad baja (`rgba(200,180,255,0.2)`) excepto la parte superior (`border-top-color`) que es opaca — al girar, crea la ilusión de movimiento circular.

**Botones condicionales** — separados por estado:
```svelte
{#if state.status === 'loading'}
  <span ...>Cargando…</span>        <!-- no es botón, no clickable -->
{:else if state.status === 'error'}
  <button onclick={() => loadInlineVideo(media)}>Reintentar</button>
{/if}
<!-- siempre visible, independiente del estado -->
<a href={media.url}>Ver en Threads ↗</a>
```

La separación `{:else if}` es importante: evita mostrar "Reintentar" durante la carga (no tiene sentido) y evita el `span` de "Cargando…" cuando hay error. El link "Ver en Threads ↗" está **fuera** de los condicionales — siempre aparece, en cualquier estado.

---

## Posibles problemas y cómo diagnosticarlos

**El iframe aparece pero está en blanco**
→ La API oEmbed devolvió HTML pero el embed.js no cargó (Threads cambió la URL del script).
→ Abre DevTools (F12), tab Network, filtra por "embed.js". Comprueba status 200.

**El iframe muestra "Inicia sesión para ver"**
→ El post es privado o Threads exige sesión para el embed.
→ Limitación de Threads, no de la app.

**Sigue en "Cargando vídeo…" indefinidamente**
→ Los 3 métodos tienen timeout de 8s cada uno y corren en paralelo → máximo ~8s.
→ Si no cambia de estado después de 10s, hay un problema con el timeout. Comprueba la conexión.

**El vídeo se muestra pero no reproduce**
→ El embed.js de Threads necesita `allow-same-origin` para sus llamadas internas.
→ Verifica que el `<iframe>` tiene `sandbox="allow-scripts allow-same-origin allow-popups"`.

**El endpoint oEmbed devuelve 503**
→ Threads está bloqueando la petición desde tu IP/red.
→ En Tauri desktop esto se soluciona añadiendo un comando Rust que llame al oEmbed desde el backend (sin restricciones de bot-detection sobre el User-Agent del browser).
