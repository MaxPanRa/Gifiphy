// Deja el ejecutable listo en la raiz del repo despues de `tauri build`.
//
// El binario que produce Tauri corre por si solo (el frontend va empotrado),
// pero los recursos declarados en `bundle.resources` unicamente los coloca el
// instalador. Por eso gifsicle se copia AL LADO del exe: `locate()` en
// ffmpeg.rs busca primero en la carpeta del propio ejecutable, asi que la
// version portable encuentra su sidecar sin instalar nada.
//
// Copy the built executable to the repository root after `tauri build`.
// gifsicle is placed next to it because `locate()` looks in the executable's
// own directory first, which is what makes the portable build self-contained.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  {
    from: join(root, "src-tauri", "target", "release", "gifiphy.exe"),
    to: join(root, "Gifiphy.exe"),
    required: true,
  },
  {
    from: join(root, "src-tauri", "bin", "gifsicle.exe"),
    to: join(root, "gifsicle.exe"),
    required: false,
  },
];

let failed = false;

for (const { from, to, required } of targets) {
  if (!existsSync(from)) {
    const msg = `missing: ${from}`;
    if (required) {
      console.error(`ERROR  ${msg}`);
      console.error("       Run `npm run app:build` first.");
      failed = true;
    } else {
      console.warn(`WARN   ${msg} (optional)`);
    }
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`OK     ${to}`);
}

if (failed) process.exit(1);

console.log("\nGifiphy.exe is ready at the repository root.");
console.log("FFmpeg and ffprobe must be available on PATH.");
