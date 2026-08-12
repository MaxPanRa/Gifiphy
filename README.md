# Gifiphy

> ## 🛡️ Is this safe? Read this first — ¿Esto es seguro? Lee esto primero
>
> ### 👉 **[SECURITY-ANALYSIS.md](SECURITY-ANALYSIS.md)** 👈
>
> **EN** — Gifiphy is not a virus and contains no malware. It makes **zero network
> requests**, collects **no data**, and every line of its source code is in this
> repository. Windows may still warn you, because the executable is unsigned —
> that is a warning about a *missing certificate*, not about *dangerous code*.
> The linked document explains exactly why, and gives you a **ready-made prompt
> you can paste into any AI assistant to audit this code yourself** in about five
> minutes. Don't take my word for it. Verify it.
>
> **ES** — Gifiphy no es un virus ni contiene malware. No hace **ninguna petición
> de red**, no recolecta **ningún dato**, y todo su código fuente está en este
> repositorio. Windows puede advertirte de todos modos, porque el ejecutable no
> está firmado — esa es una advertencia sobre un *certificado ausente*, no sobre
> *código peligroso*. El documento enlazado explica exactamente por qué, y te da
> un **prompt listo para pegar en cualquier asistente de IA y auditar este código
> tú mismo** en unos cinco minutos. No me creas a mí. Compruébalo.

---

Video to animated GIF converter with a hard **20 MB** cap, GPU-accelerated
decoding, and a solver that steps quality down on purpose when the result
doesn't fit.

*Conversor de video a GIF animado con un techo duro de **20 MB**, decodificación
acelerada por GPU y un solver que baja la calidad de forma dirigida cuando el
resultado no entra en el límite.*

---

## English

### Option 1 — Just download it (no code required)

1. Go to **[Releases](https://github.com/MaxPanRa/Gifiphy/releases/latest)**.
2. Download `Gifiphy-portable.zip`, unzip it anywhere, and run `Gifiphy.exe`.
   Alternatively download `Gifiphy-setup.exe` if you prefer an installer.
3. Install **FFmpeg** and make sure `ffmpeg` and `ffprobe` are on your `PATH`.
   Gifiphy uses them to decode video. Get it from
   [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (the `full` build) or run
   `winget install Gyan.FFmpeg`.

That's it. `gifsicle` ships inside the download; only FFmpeg is external.

### Option 2 — Run it from source

Requires [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs), and the
MSVC C++ build tools (installed with Visual Studio or the standalone
Build Tools).

```bash
git clone https://github.com/MaxPanRa/Gifiphy.git
cd Gifiphy
npm install
npm run app
```

### Option 3 — Build the EXE yourself

```bash
npm install
npm run app:build
```

When it finishes, **`Gifiphy.exe` is placed in the repository root**, next to
`gifsicle.exe`. Those two files are all you need — copy them anywhere and run.

The installers (`.msi` and `.exe`) are also generated, under
`src-tauri/target/release/bundle/`.

---

## Español

### Opción 1 — Solo descárgalo (no necesitas el código)

1. Ve a **[Releases](https://github.com/MaxPanRa/Gifiphy/releases/latest)**.
2. Descarga `Gifiphy-portable.zip`, descomprímelo donde quieras y ejecuta
   `Gifiphy.exe`. También puedes descargar `Gifiphy-setup.exe` si prefieres un
   instalador.
3. Instala **FFmpeg** y asegúrate de que `ffmpeg` y `ffprobe` estén en tu
   `PATH`. Gifiphy los usa para decodificar el video. Puedes obtenerlo en
   [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (la versión `full`) o con
   `winget install Gyan.FFmpeg`.

Eso es todo. `gifsicle` viene incluido en la descarga; solo FFmpeg es externo.

### Opción 2 — Ejecutarlo desde el código

Requiere [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs) y las
herramientas de compilación C++ de MSVC (vienen con Visual Studio o con las
Build Tools por separado).

```bash
git clone https://github.com/MaxPanRa/Gifiphy.git
cd Gifiphy
npm install
npm run app
```

### Opción 3 — Construir el EXE tú mismo

```bash
npm install
npm run app:build
```

Al terminar, **`Gifiphy.exe` queda en la raíz del repositorio**, junto a
`gifsicle.exe`. Esos dos archivos son todo lo que necesitas — cópialos a donde
quieras y ejecuta.

Los instaladores (`.msi` y `.exe`) también se generan, en
`src-tauri/target/release/bundle/`.

---

## License / Licencia

Gifiphy's own code is MIT — see [LICENSE](LICENSE).

The bundled `gifsicle.exe` is a separate program by Eddie Kohler, distributed
under the GPL-2.0. Its source is at
[github.com/kohler/gifsicle](https://github.com/kohler/gifsicle). FFmpeg is not
distributed with this project; you install it yourself.

*El código propio de Gifiphy es MIT — ver [LICENSE](LICENSE). El `gifsicle.exe`
incluido es un programa aparte de Eddie Kohler, distribuido bajo GPL-2.0. Su
código fuente está en [github.com/kohler/gifsicle](https://github.com/kohler/gifsicle).
FFmpeg no se distribuye con este proyecto; lo instalas tú.*
