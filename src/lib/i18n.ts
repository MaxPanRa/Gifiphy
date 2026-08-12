import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Traducción ES/EN.
 *
 * El español es la fuente de verdad; el tipo de `EN` se deriva de `ES`, así que
 * olvidarse una clave al traducir es un error de compilación y no un texto
 * faltante descubierto en producción.
 *
 * Los mensajes que nacen en Rust (errores, progreso, ajustes del solver) llegan
 * como clave + parámetros, nunca como frases ya redactadas. Por eso el selector
 * de idioma alcanza también al backend sin reiniciar nada.
 */

export type Lang = "es" | "en";

const ES = {
  "app.subtitle": "Video → GIF, con techo de 20 MB",
  "app.reset": "Empezar de nuevo",
  "app.lang": "English",

  "step1.title": "Origen",
  "step1.subtitle": "Elige el video que quieres convertir",
  "step1.pick": "Seleccionar video",
  "step1.analyzing": "Analizando…",

  "stat.resolution": "Resolución",
  "stat.duration": "Duración",
  "stat.fps": "FPS",
  "stat.codec": "Códec",
  "stat.motion": "Movimiento",
  "stat.rotation": "Rotación",

  "step2.title": "Proporción y tamaño",
  "step2.subtitle": "El tamaño es el factor que más pesa",
  "step2.fitLabel": "Cuando la proporción no coincide",
  "fit.crop": "Recortar",
  "fit.cropHint": "Llena el cuadro",
  "fit.pad": "Barras",
  "fit.padHint": "Muestra todo",

  "aspect.native": "Original",
  "aspect.nativeHint": "Sin recorte ni barras",
  "aspect.16:9Hint": "Horizontal / YouTube",
  "aspect.9:16Hint": "Vertical / Reels",
  "aspect.1:1Hint": "Cuadrado",
  "aspect.4:5Hint": "Feed vertical",
  "aspect.4:3Hint": "Clásico",
  "aspect.21:9Hint": "Ultra panorámico",

  "weight.light": "ligero",
  "weight.medium": "medio",
  "weight.heavy": "pesado",
  "weight.veryHeavy": "muy pesado",
  "weight.extreme": "extremo",

  "step3.title": "Velocidad",
  "step3.subtitle": "Acelerar saltea frames del original",
  "step3.smoothness": "Fluidez (fps del GIF)",
  "step3.summary": "Resultado: {duration} s · {frames} frames a {fps} fps",

  "speed.slower": "Más lento",
  "speed.slowerHint": "Muestrea más frames",
  "speed.normal": "Normal",
  "speed.normalHint": "Ritmo original",
  "speed.faster": "Más rápido",
  "speed.fasterHint": "Saltea frames",

  "smooth.25Hint": "Muy suave, pesado",
  "smooth.20Hint": "Suave",
  "smooth.12Hint": "Equilibrado",
  "smooth.10Hint": "Liviano",
  "smooth.5Hint": "Mínimo, tipo slideshow",

  "step4.title": "Recorte",
  "step4.subtitle": "La palanca más efectiva para bajar peso",
  "trim.start": "Inicio: {value} s",
  "trim.end": "Fin: {value} s",

  "side.title": "Resultado",
  "side.noVideo": "Carga un video para ver la estimación.",
  "side.estimatedLabel": "Tamaño estimado {kind}",
  "side.kindMeasured": "(medido)",
  "side.kindApprox": "(aproximado)",
  "side.framesLimit": "{frames} frames · límite 20 MB",
  "side.probe": "Medir con precisión (~2 s)",

  "warn.judder":
    "El origen tiene {sourceFps} fps y esta combinación pide {needed} fps de tiempo-fuente. Se van a duplicar frames y el movimiento puede verse entrecortado.",
  "warn.tooFewFrames":
    "Solo {frames} frames: el resultado va a parecer una secuencia de imágenes más que una animación. Prueba bajar la velocidad o alargar el recorte.",
  "warn.vfr": "El video tiene frame rate variable; se normaliza a ritmo constante.",
  "warn.hdr": "Fuente HDR: se aplica tone mapping a SDR para conservar el color.",

  "risk.over":
    "La estimación ({size}) supera el límite de 20 MB. Si generas con estos parámetros, el archivo va a quedar fuera de spec.",
  "risk.risky":
    "Podría superar los 20 MB según cuánto comprima el contenido. Mide con precisión o usa la versión sugerida.",

  "btn.create": "Crear GIF",
  "btn.createSuggested": "Crear GIF sugerido (< 20 MB)",
  "btn.cancel": "Cancelar",

  "stage.probing": "Analizando",
  "stage.estimating": "Estimando",
  "stage.decoding": "Decodificando",
  "stage.encoding": "Generando",
  "stage.optimizing": "Optimizando",
  "stage.verifying": "Verificando",
  "stage.done": "Listo",
  "stage.cancelled": "Cancelado",
  "stage.failed": "Falló",

  "msg.decodingWith": "Decodificando con {accel}",
  "msg.measuringCompressibility": "Midiendo compresibilidad del clip…",
  "msg.evaluatingRung": "Evaluando ajuste {index}/{total}…",
  "msg.overshootRetry": "Se pasó del límite, ajustando un peldaño más…",

  "adj.resolution": "Resolución {from} → {to}",
  "adj.smoothness": "Fluidez {from} → {to}",
  "adj.palette": "Paleta {from} → {to} colores",
  "adj.lossy": "Compresión lossy {from} → {to}",
  "adj.noGifsicle":
    "gifsicle no está disponible: el GIF se generó sin la optimización final.",
  "adj.overLimit": "Atención: el resultado pesa {from} y supera el límite de {to}.",

  "err.toolMissing": "No se encontró {tool}. Instálalo o agrégalo al PATH.",
  "err.noVideoStream": "El archivo no contiene ningún stream de video.",
  "err.probeFailed": "El video no se pudo leer.",
  "err.ffmpegFailed": "FFmpeg falló.",
  "err.gifsicleFailed": "gifsicle falló.",
  "err.cancelled": "Operación cancelada.",
  "err.unsatisfiable":
    "Ni con los ajustes mínimos se baja de 20 MB (mejor intento: {bestMb} MB). Recorta el clip a ~{suggestedSec} s o menos.",
  "err.ioError": "Error de entrada/salida.",
  "err.unknown": "Ocurrió un error inesperado.",
};

type Key = keyof typeof ES;

const EN: Record<Key, string> = {
  "app.subtitle": "Video → GIF, capped at 20 MB",
  "app.reset": "Start over",
  "app.lang": "Español",

  "step1.title": "Source",
  "step1.subtitle": "Pick the video to convert",
  "step1.pick": "Select video",
  "step1.analyzing": "Analyzing…",

  "stat.resolution": "Resolution",
  "stat.duration": "Duration",
  "stat.fps": "FPS",
  "stat.codec": "Codec",
  "stat.motion": "Motion",
  "stat.rotation": "Rotation",

  "step2.title": "Aspect ratio and size",
  "step2.subtitle": "Size is the single heaviest factor",
  "step2.fitLabel": "When the aspect ratio doesn't match",
  "fit.crop": "Crop",
  "fit.cropHint": "Fills the frame",
  "fit.pad": "Letterbox",
  "fit.padHint": "Shows everything",

  "aspect.native": "Original",
  "aspect.nativeHint": "No crop, no bars",
  "aspect.16:9Hint": "Landscape / YouTube",
  "aspect.9:16Hint": "Vertical / Reels",
  "aspect.1:1Hint": "Square",
  "aspect.4:5Hint": "Vertical feed",
  "aspect.4:3Hint": "Classic",
  "aspect.21:9Hint": "Ultra wide",

  "weight.light": "light",
  "weight.medium": "medium",
  "weight.heavy": "heavy",
  "weight.veryHeavy": "very heavy",
  "weight.extreme": "extreme",

  "step3.title": "Speed",
  "step3.subtitle": "Speeding up skips frames from the source",
  "step3.smoothness": "Smoothness (GIF fps)",
  "step3.summary": "Result: {duration} s · {frames} frames at {fps} fps",

  "speed.slower": "Slower",
  "speed.slowerHint": "Samples more frames",
  "speed.normal": "Normal",
  "speed.normalHint": "Original pace",
  "speed.faster": "Faster",
  "speed.fasterHint": "Skips frames",

  "smooth.25Hint": "Very smooth, heavy",
  "smooth.20Hint": "Smooth",
  "smooth.12Hint": "Balanced",
  "smooth.10Hint": "Light",
  "smooth.5Hint": "Minimum, slideshow-like",

  "step4.title": "Trim",
  "step4.subtitle": "The most effective lever to cut size",
  "trim.start": "Start: {value} s",
  "trim.end": "End: {value} s",

  "side.title": "Result",
  "side.noVideo": "Load a video to see the estimate.",
  "side.estimatedLabel": "Estimated size {kind}",
  "side.kindMeasured": "(measured)",
  "side.kindApprox": "(approximate)",
  "side.framesLimit": "{frames} frames · 20 MB limit",
  "side.probe": "Measure precisely (~2 s)",

  "warn.judder":
    "The source runs at {sourceFps} fps and this combination asks for {needed} fps of source time. Frames will be duplicated and motion may look choppy.",
  "warn.tooFewFrames":
    "Only {frames} frames: the result will read as a slideshow rather than an animation. Try lowering the speed or extending the trim.",
  "warn.vfr": "The video has a variable frame rate; it will be normalized to a constant one.",
  "warn.hdr": "HDR source: tone mapping to SDR is applied to preserve color.",

  "risk.over":
    "The estimate ({size}) exceeds the 20 MB limit. Generating with these settings will produce an out-of-spec file.",
  "risk.risky":
    "It could exceed 20 MB depending on how well the content compresses. Measure precisely or use the suggested version.",

  "btn.create": "Create GIF",
  "btn.createSuggested": "Create suggested GIF (< 20 MB)",
  "btn.cancel": "Cancel",

  "stage.probing": "Analyzing",
  "stage.estimating": "Estimating",
  "stage.decoding": "Decoding",
  "stage.encoding": "Encoding",
  "stage.optimizing": "Optimizing",
  "stage.verifying": "Verifying",
  "stage.done": "Done",
  "stage.cancelled": "Cancelled",
  "stage.failed": "Failed",

  "msg.decodingWith": "Decoding with {accel}",
  "msg.measuringCompressibility": "Measuring how well the clip compresses…",
  "msg.evaluatingRung": "Evaluating setting {index}/{total}…",
  "msg.overshootRetry": "Over the limit, stepping down one more rung…",

  "adj.resolution": "Resolution {from} → {to}",
  "adj.smoothness": "Smoothness {from} → {to}",
  "adj.palette": "Palette {from} → {to} colors",
  "adj.lossy": "Lossy compression {from} → {to}",
  "adj.noGifsicle": "gifsicle is unavailable: the GIF was produced without the final optimization.",
  "adj.overLimit": "Warning: the result is {from} and exceeds the {to} limit.",

  "err.toolMissing": "{tool} was not found. Install it or add it to your PATH.",
  "err.noVideoStream": "The file contains no video stream.",
  "err.probeFailed": "The video could not be read.",
  "err.ffmpegFailed": "FFmpeg failed.",
  "err.gifsicleFailed": "gifsicle failed.",
  "err.cancelled": "Operation cancelled.",
  "err.unsatisfiable":
    "Even at the lowest settings it stays above 20 MB (best attempt: {bestMb} MB). Trim the clip to about {suggestedSec} s or less.",
  "err.ioError": "Input/output error.",
  "err.unknown": "An unexpected error occurred.",
};

const DICT: Record<Lang, Record<Key, string>> = { es: ES, en: EN };

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/** Persistido en localStorage: la elección sobrevive al reinicio de la app. */
export const useLang = create<LangState>()(
  persist(
    (set) => ({
      // Arranca en el idioma del sistema; el usuario puede cambiarlo siempre.
      lang: navigator.language.toLowerCase().startsWith("es") ? "es" : "en",
      setLang: (lang) => set({ lang }),
    }),
    { name: "gifiphy.lang" },
  ),
);

export type TParams = Record<string, string | number>;

export function translate(lang: Lang, key: Key | string, params?: TParams): string {
  const table = DICT[lang];
  const raw = (table as Record<string, string>)[key];
  // Clave inexistente: se devuelve la clave misma en lugar de una cadena vacía,
  // para que el hueco sea evidente al probar y no un espacio en blanco mudo.
  if (raw === undefined) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    if (!(name in params)) return m;
    const v = params[name];
    // Los decimales se formatean según el idioma (12,5 vs 12.5); los enteros
    // (frames, índices) se dejan crudos para no volverlos "125,0".
    if (typeof v === "number" && !Number.isInteger(v)) return fmtNum(lang, v, 1);
    return String(v);
  });
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return useCallback(
    (key: Key | string, params?: TParams) => translate(lang, key, params),
    [lang],
  );
}

/**
 * Locale para formateo numérico: el separador decimal cambia con el idioma.
 * Se usa es-MX como referencia de español neutro latinoamericano.
 */
export function localeOf(lang: Lang): string {
  return lang === "es" ? "es-MX" : "en-US";
}

export function fmtNum(lang: Lang, value: number, digits = 1): string {
  return value.toLocaleString(localeOf(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
