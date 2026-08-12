# Security analysis — Análisis de seguridad

*Last written: 2026-08-12, at the commit tagged in this repository's history.
Escrito por última vez: 2026-08-12, en el commit señalado en el historial de
este repositorio.*

This document exists for one reason: **an unsigned `.exe` from an individual
developer, downloaded off GitHub, is exactly the shape of file that security
training tells you to distrust.** That instinct is correct in general. This
page is here so you don't have to just trust me — you can verify the claim
in about five minutes, using the prompt at the bottom, on a machine you
don't mind experimenting on.

*Este documento existe por una sola razón: **un `.exe` sin firmar, hecho por un
desarrollador individual y descargado de GitHub, tiene exactamente la forma de
archivo de la que cualquier capacitación en seguridad te enseña a desconfiar.**
Esa desconfianza es correcta en general. Esta página existe para que no tengas
que confiar en mi palabra — puedes verificar la afirmación en unos cinco
minutos, con el prompt al final, en una máquina en la que no te importe
experimentar.*

---

## 1. What this program actually does — Qué hace este programa

**EN.** Gifiphy is a local video-to-GIF converter. Everything it touches is a
file on your own disk:

1. You pick a video file through a native file-open dialog.
2. It runs `ffprobe` and `ffmpeg` — the same tools millions of developers use
   daily — as local subprocesses, to read metadata and encode a GIF.
3. It runs the bundled `gifsicle.exe` to optimize that GIF.
4. It writes the result to a path you choose through a native save dialog.

**ES.** Gifiphy es un conversor local de video a GIF. Todo lo que toca es un
archivo en tu propio disco:

1. Eliges un video mediante un diálogo nativo de selección de archivo.
2. Ejecuta `ffprobe` y `ffmpeg` — las mismas herramientas que usan a diario
   millones de desarrolladores — como subprocesos locales, para leer
   metadatos y codificar un GIF.
3. Ejecuta el `gifsicle.exe` incluido para optimizar ese GIF.
4. Escribe el resultado en la ruta que elijas mediante un diálogo nativo de
   guardado.

## 2. What it does NOT do — Qué NO hace

**EN.**

- **No network access, anywhere, ever.** Check `src-tauri/Cargo.toml`: there
  is no HTTP client crate (no `reqwest`, `hyper`, `ureq`, `tokio` with network
  features — nothing). A Rust binary cannot make an HTTP request without
  linking one of these. Search the source yourself; there's nothing to find.
- **No telemetry, no analytics, no "phone home."**
- **No auto-update mechanism.** The app never fetches or executes new code
  after install. Updates only ever happen if *you* download a new release.
- **No credential harvesting, no clipboard access, no keylogging, no
  registry writes beyond what Windows does automatically for any installed
  app** (Start Menu shortcut, uninstall entry).
- **No admin/elevation prompt.** It runs with your normal user permissions.
- **No obfuscation.** The Rust and TypeScript source in this repository is
  what gets compiled — there is no separate "real" version. You can read
  every line before it becomes a binary.

**ES.**

- **Sin acceso a red, en ningún punto.** Revisa `src-tauri/Cargo.toml`: no
  hay ningún crate de cliente HTTP (nada de `reqwest`, `hyper`, `ureq`,
  `tokio` con funciones de red — nada). Un binario en Rust no puede hacer una
  petición HTTP sin enlazar uno de estos. Busca en el código tú mismo; no hay
  nada que encontrar.
- **Sin telemetría, sin analítica, sin "llamadas a casa."**
- **Sin mecanismo de auto-actualización.** La app nunca descarga ni ejecuta
  código nuevo después de instalarse. Las actualizaciones solo ocurren si
  *tú* descargas un nuevo release.
- **Sin recolección de credenciales, sin acceso al portapapeles, sin
  keylogging, sin escrituras al registro más allá de lo que Windows hace
  automáticamente para cualquier app instalada** (acceso directo en el menú
  Inicio, entrada de desinstalación).
- **Sin solicitud de administrador/elevación.** Corre con tus permisos
  normales de usuario.
- **Sin ofuscación.** El código en Rust y TypeScript de este repositorio es
  el que se compila — no existe una "versión real" separada. Puedes leer
  cada línea antes de que se convierta en binario.

## 3. Why Windows / your antivirus might still warn you — Por qué Windows o tu antivirus pueden advertirte igual

**EN.** This is the honest, important part. Windows SmartScreen and some
antivirus engines flag files based on two signals that have **nothing to do
with whether the code is malicious**:

1. **Code-signing certificate.** Signing costs roughly $200–500/year from a
   commercial certificate authority. This is a personal project without a
   publisher certificate, so Windows shows "Unknown Publisher." That warning
   means *"nobody paid to vouch for this identity,"* not *"this code does
   something bad."*
2. **Reputation / prevalence.** SmartScreen partly scores files by how many
   other Windows machines have already run them. A brand-new executable from
   a small project has low prevalence *by definition*, regardless of what it
   does. This is the same warning a solo indie developer's first release gets.

Neither signal inspects behavior. That's exactly why this document gives you
a way to inspect behavior yourself, below.

**ES.** Esta es la parte honesta e importante. Windows SmartScreen y algunos
antivirus marcan archivos según dos señales que **no tienen relación con si
el código es malicioso**:

1. **Certificado de firma de código.** Firmar cuesta entre $200 y $500 al
   año, a través de una autoridad certificadora comercial. Este es un
   proyecto personal sin certificado de editor, así que Windows muestra
   "Editor desconocido". Esa advertencia significa *"nadie pagó por avalar
   esta identidad"*, no *"este código hace algo malo"*.
2. **Reputación / prevalencia.** SmartScreen puntúa en parte los archivos
   según cuántas otras máquinas Windows ya los ejecutaron. Un ejecutable
   recién creado de un proyecto pequeño tiene baja prevalencia *por
   definición*, sin importar qué haga. Es la misma advertencia que recibe el
   primer lanzamiento de cualquier desarrollador independiente.

Ninguna de las dos señales inspecciona el comportamiento. Por eso este
documento te da, más abajo, una forma de inspeccionarlo tú mismo.

## 4. Third-party binary shipped in this repo — Binario de terceros incluido

**EN.** The only pre-compiled binary vendored in this repository (outside of
what you build yourself) is `src-tauri/bin/gifsicle.exe` — a well-known,
long-established open-source GIF tool (GPL-2.0, maintained by Eddie Kohler
since 1997). It is used exactly once in the pipeline, to run
`gifsicle -O3 --lossy=N input.gif -o output.gif`. Its own upstream source is
public at [github.com/kohler/gifsicle](https://github.com/kohler/gifsicle).

To verify the exact file in this repo hasn't been tampered with, check its
hash:

```
SHA-256: 6F60CC7F696AB4B861BF9E6FB5B4FD940B3CB6B9731E2EF04708334AF95A7DE4
File:    src-tauri/bin/gifsicle.exe
Size:    294616 bytes
Origin:  https://eternallybored.org/misc/gifsicle/releases/gifsicle-1.95-win64.zip
```

```powershell
Get-FileHash "src-tauri\bin\gifsicle.exe" -Algorithm SHA256
```

FFmpeg and ffprobe are **not** bundled — you install them yourself from
[gyan.dev](https://www.gyan.dev/ffmpeg/builds/), so their trustworthiness is
between you and that well-known distributor, not this project.

**ES.** El único binario precompilado incluido en este repositorio (fuera de
lo que tú mismo compiles) es `src-tauri/bin/gifsicle.exe` — una herramienta
de código abierto muy conocida y establecida (GPL-2.0, mantenida por Eddie
Kohler desde 1997). Se usa exactamente una vez en el proceso, para ejecutar
`gifsicle -O3 --lossy=N input.gif -o output.gif`. Su código fuente original es
público en [github.com/kohler/gifsicle](https://github.com/kohler/gifsicle).

Para verificar que el archivo exacto de este repositorio no fue alterado,
revisa su hash:

```
SHA-256: 6F60CC7F696AB4B861BF9E6FB5B4FD940B3CB6B9731E2EF04708334AF95A7DE4
Archivo: src-tauri/bin/gifsicle.exe
Tamaño:  294616 bytes
Origen:  https://eternallybored.org/misc/gifsicle/releases/gifsicle-1.95-win64.zip
```

```powershell
Get-FileHash "src-tauri\bin\gifsicle.exe" -Algorithm SHA256
```

FFmpeg y ffprobe **no** vienen incluidos — los instalas tú desde
[gyan.dev](https://www.gyan.dev/ffmpeg/builds/), así que su confiabilidad es
un asunto entre tú y ese distribuidor conocido, no de este proyecto.

## 5. Verify it yourself — Verifícalo tú mismo

**EN.** You don't have to take any of the above on faith. Three ways to
check, in increasing order of effort:

**A. The 30-second way.** Run the app inside Windows Sandbox (built into
Windows 10/11 Pro — search "Windows Sandbox" in the Start Menu) or a disposable
VM. Watch it in Task Manager → Resource Monitor while you use it: there is no
network tab activity to see, because there are no sockets opened.

**B. The 5-minute way — AI-assisted code audit.** Clone this repository and
paste the prompt from section 6 into Claude, ChatGPT, or any capable coding
assistant. It will read the actual source and report back, instead of relying
on this document's word.

**C. The thorough way.** Read `src-tauri/src/*.rs` yourself — it's about a
dozen small, commented files, roughly 1,500 lines total. Search for
`Command::new` to see every single process this app ever spawns (it's
`ffmpeg`, `ffprobe`, and `gifsicle` — nothing else). Search for anything
network-related — there's nothing to find.

**ES.** No tienes que creer nada de lo anterior por fe. Tres formas de
comprobarlo, en orden creciente de esfuerzo:

**A. La forma de 30 segundos.** Ejecuta la app dentro de Windows Sandbox
(incluido en Windows 10/11 Pro — búscalo en el menú Inicio) o una máquina
virtual desechable. Obsérvala en el Administrador de tareas → Monitor de
recursos mientras la usas: no hay actividad de red que ver, porque no se abre
ningún socket.

**B. La forma de 5 minutos — auditoría de código asistida por IA.** Clona
este repositorio y pega el prompt de la sección 6 en Claude, ChatGPT, o
cualquier asistente de código capaz. Va a leer el código fuente real y
reportar por su cuenta, en lugar de confiar en la palabra de este documento.

**C. La forma exhaustiva.** Lee tú mismo `src-tauri/src/*.rs` — son cerca de
una docena de archivos pequeños y comentados, unas 1500 líneas en total. Busca
`Command::new` para ver cada proceso que esta app llega a lanzar (son
`ffmpeg`, `ffprobe` y `gifsicle` — nada más). Busca cualquier cosa relacionada
con red — no hay nada que encontrar.

## 6. Ready-made audit prompt — Prompt de auditoría listo para usar

**EN.** Copy everything in the box below and paste it into an AI coding
assistant (Claude Code, Claude, ChatGPT, Cursor, etc.) after cloning this
repository, with the assistant's working directory set to the repo root.

**ES.** Copia todo lo que está dentro del recuadro y pégalo en un asistente de
IA para código (Claude Code, Claude, ChatGPT, Cursor, etc.) después de clonar
este repositorio, con el directorio de trabajo del asistente en la raíz del
repo.

````text
You are auditing a small open-source desktop app (Gifiphy: a video-to-GIF
converter built with Tauri 2 + Rust + React/TypeScript) for a user who wants
an independent second opinion on whether it is safe to run, before Windows
SmartScreen's "unknown publisher" warning makes them hesitate.

Please do the following and report back plainly, in the user's language:

1. List every third-party process this app can launch. Search for
   `Command::new` and `ffmpeg::locate` / `ffmpeg::command` across
   `src-tauri/src/*.rs`. Confirm the only external programs ever executed are
   ffmpeg, ffprobe, and gifsicle, and quote the exact call sites.
2. Search the entire repository (`src-tauri/Cargo.toml`, `package.json`, and
   all source files) for any networking capability: HTTP/TCP/UDP/WebSocket
   client or server crates or npm packages, any URL that isn't just a doc
   comment or README link, any use of `reqwest`, `hyper`, `ureq`, `fetch`,
   `XMLHttpRequest`, `net::`, sockets, or DNS lookups. Report whether you find
   any code path capable of sending data off the user's machine.
3. Search for filesystem access outside what the app's stated purpose
   requires (reading the chosen video, writing the chosen GIF output, and
   normal temp-directory use for intermediate encoding files). Flag anything
   that reads unrelated user files, browser profiles, credential stores, SSH
   keys, or similar.
4. Search for anything that touches the Windows registry, scheduled tasks,
   startup entries, or attempts to elevate privileges.
5. Check `src-tauri/tauri.conf.json` for the app's declared permissions
   (`capabilities/*.json`) and confirm they're limited to opening/saving
   files and window controls — nothing broader.
6. Look at `src-tauri/bin/gifsicle.exe`: confirm it's the only vendored
   binary, and if you can, verify its SHA-256 hash against the one published
   in `SECURITY-ANALYSIS.md` in this same repo.
7. Give a final verdict: based only on what you read (not on general trust of
   the author), does this codebase do anything other than what it claims —
   convert local video files to GIF using local tools, with no network
   activity? Call out anything suspicious explicitly, even minor; don't
   soften genuine findings to be reassuring.

Be concrete: cite file paths and line numbers for every claim.
````

## 7. If you still don't trust it — Si aun así no confías en él

**EN.** That's completely reasonable, and you're right to hold that line —
you should never run software you can't verify from someone you don't know.
You don't have to run this. If you're curious about the *idea* but not
comfortable running this specific binary, the entire source is here to read
or reimplement, no attribution required beyond what the MIT license already
grants you.

**ES.** Eso es completamente razonable, y haces bien en sostener ese límite —
nunca deberías ejecutar software que no puedas verificar, de alguien que no
conoces. No tienes que ejecutar esto. Si te interesa la *idea* pero no te
sientes cómodo ejecutando este binario en particular, todo el código fuente
está aquí para leerlo o reimplementarlo, sin más atribución que la que ya
otorga la licencia MIT.
