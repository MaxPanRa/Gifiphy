import type { GifSettings, VideoMeta } from "./types";

/**
 * Velocidad y suavidad son dos ejes independientes, y confundirlos es el
 * error clásico al generar GIFs:
 *
 *  - `delayCs` (suavidad) fija a qué ritmo REPRODUCE el GIF. GIF sólo admite
 *    delays en centésimas de segundo ENTERAS, así que no todo fps es
 *    representable: 30 fps serían 3,33 cs y no existe tal cosa.
 *  - `speed` fija cuánto tiempo de video fuente avanza cada frame. Acelerar
 *    saltea frames del origen (decimación por frame más cercano, sin blending).
 */

/** Delay mínimo seguro. Por debajo de 2 cs los navegadores reinterpretan
 *  el valor como 10 cs y el GIF se reproduce 5× más lento de lo pedido. */
export const MIN_DELAY_CS = 2;
export const MAX_DELAY_CS = 100;

export interface SmoothnessPreset {
  delayCs: number;
  /** El número se formatea según el idioma (12,5 vs 12.5), no se guarda como texto. */
  fps: number;
  hintKey: string;
}

/** Sólo fps exactamente representables como delay entero en centésimas. */
export const SMOOTHNESS_PRESETS: SmoothnessPreset[] = [
  { delayCs: 4, fps: 25, hintKey: "smooth.25Hint" },
  { delayCs: 5, fps: 20, hintKey: "smooth.20Hint" },
  { delayCs: 8, fps: 12.5, hintKey: "smooth.12Hint" },
  { delayCs: 10, fps: 10, hintKey: "smooth.10Hint" },
  { delayCs: 20, fps: 5, hintKey: "smooth.5Hint" },
];

export const DEFAULT_DELAY_CS = 8;

export interface SpeedPreset {
  id: "slower" | "normal" | "faster";
  labelKey: string;
  factor: number;
  hintKey: string;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { id: "slower", labelKey: "speed.slower", factor: 0.5, hintKey: "speed.slowerHint" },
  { id: "normal", labelKey: "speed.normal", factor: 1, hintKey: "speed.normalHint" },
  { id: "faster", labelKey: "speed.faster", factor: 2, hintKey: "speed.fasterHint" },
];

/** Convierte un fps arbitrario al delay entero más cercano que GIF admite. */
export function fpsToDelayCs(fps: number): number {
  const raw = Math.round(100 / Math.max(0.01, fps));
  return Math.min(MAX_DELAY_CS, Math.max(MIN_DELAY_CS, raw));
}

/** fps que el GIF realmente va a reproducir. Puede diferir del pedido. */
export function delayCsToFps(delayCs: number): number {
  return 100 / delayCs;
}

/** Un GIF por debajo de esto deja de leerse como animación. */
export const MIN_FRAMES = 10;

export function clipDurationSec(meta: VideoMeta, settings: GifSettings): number {
  if (!settings.trim) return meta.durationSec;
  return Math.max(0, settings.trim.endSec - settings.trim.startSec);
}

/** Duración del GIF resultante, ya afectada por la velocidad. */
export function outputDurationSec(meta: VideoMeta, settings: GifSettings): number {
  return clipDurationSec(meta, settings) / settings.speed;
}

/**
 * Cantidad de frames del GIF. Es el multiplicador dominante del peso final:
 * N = duración_fuente / speed × fps_salida
 */
export function frameCount(meta: VideoMeta, settings: GifSettings): number {
  const fps = delayCsToFps(settings.delayCs);
  return Math.max(1, Math.round(outputDurationSec(meta, settings) * fps));
}

/**
 * Tasa de muestreo exigida al origen, en fps de tiempo-fuente.
 *
 * Es `fps_salida / speed`, no el producto: a 2× cada frame del GIF avanza el
 * DOBLE de tiempo fuente, así que se piden MENOS frames por segundo de video.
 * Ralentizar es lo que sube la exigencia, y si supera el fps real del origen
 * esos frames no existen: FFmpeg los duplica y aparece judder.
 *
 * Verificado midiendo: fuente 30 fps, salida 12,5 fps.
 *   speed 2,0 -> 6,25 fps de muestreo -> 63 frames en 10 s de fuente.
 *   speed 0,5 -> 25 fps de muestreo  -> 250 frames en 10 s de fuente.
 */
export function requiredSourceFps(settings: GifSettings): number {
  return delayCsToFps(settings.delayCs) / Math.max(0.01, settings.speed);
}

export type WarningKind = "judder" | "tooFewFrames" | "vfr" | "hdr" | "upscale";

export interface SettingsWarning {
  kind: WarningKind;
  /** Clave de traducción; el texto lo arma la UI con el idioma activo. */
  key: string;
  params?: Record<string, string | number>;
  severity: "info" | "warn";
}

/** Chequeos que dependen sólo de settings + metadata, sin encodear nada. */
export function inspectSettings(meta: VideoMeta, settings: GifSettings): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];

  // Ralentizar por debajo del fps de origen obliga a duplicar frames.
  const needed = requiredSourceFps(settings);
  if (needed > meta.fps * 1.05) {
    warnings.push({
      kind: "judder",
      severity: "warn",
      key: "warn.judder",
      params: { sourceFps: meta.fps, needed },
    });
  }

  const frames = frameCount(meta, settings);
  if (frames < MIN_FRAMES) {
    warnings.push({
      kind: "tooFewFrames",
      severity: "warn",
      key: "warn.tooFewFrames",
      params: { frames },
    });
  }

  if (meta.variableFrameRate) {
    warnings.push({ kind: "vfr", severity: "info", key: "warn.vfr" });
  }

  if (meta.isHdr) {
    warnings.push({ kind: "hdr", severity: "info", key: "warn.hdr" });
  }

  return warnings;
}
