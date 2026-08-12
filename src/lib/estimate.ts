import { fmtNum, type Lang } from "./i18n";
import { frameCount } from "./speed";
import type { GifSettings, SizeEstimate, VideoMeta } from "./types";

/**
 * Estimador heurístico instantáneo.
 *
 * Corre en cada cambio de control, así que no puede encodear nada. Modela el
 * peso como:
 *
 *     bytes ≈ N · (w · h) · bpp_efectivo + overhead
 *
 * donde `bpp_efectivo` sale de cuatro factores multiplicativos: movimiento,
 * paleta, dithering y lossy.
 *
 * IMPORTANTE: las constantes de abajo son un punto de partida calibrado
 * contra material mixto. El estimador de verdad es `probe_estimate` en Rust,
 * que encodea frames reales; esto sólo alimenta el aviso en vivo, que se
 * muestra siempre como rango justamente porque este modelo se equivoca.
 */

/** Bytes por píxel y por frame para el peor caso: 256 colores, con dithering,
 *  sin lossy.
 *
 *  Calibrado contra una medición real: 1080p → 480×270 a 12,5 fps dio
 *  0,097 B/px/frame. Es UNA muestra y de contenido sintético, así que el
 *  valor es provisional: material fotográfico real comprime peor. Sirve para
 *  ubicar el orden de magnitud, no para decidir; eso lo hace la sonda. */
const BASE_BPP = 0.22;

/** El dithering rompe las corridas planas que LZW aprovecha. Cuesta caro. */
const DITHER_PENALTY = 1.45;

/** Overhead fijo del contenedor + cabecera de paleta. */
const HEADER_BYTES = 800;

/** Coste por frame de la cabecera de bloque gráfico y el control de imagen. */
const PER_FRAME_OVERHEAD = 60;

/**
 * Acelerar saltea frames, así que dos frames consecutivos del GIF se parecen
 * menos entre sí y el delta-encoding rinde peor: N cae a la mitad pero los
 * bytes POR frame suben, y el ahorro neto no llega a ser del 50%.
 *
 * El exponente es chico porque el efecto medido resultó mucho más débil de lo
 * esperado. Sobre el clip de prueba, bytes por frame:
 *   speed 1,0 -> 12,29 KB   speed 2,0 -> 12,60 KB (+2,6%)
 *   speed 0,5 -> 11,22 KB (-8,7%)
 * Un exponente de 0,5 (raíz cuadrada) predecía cambios de ±40% y erraba feo.
 */
const SPEED_MOTION_EXPONENT = 0.2;

function effectiveMotion(meta: VideoMeta, settings: GifSettings): number {
  return Math.min(1, meta.motionIndex * Math.pow(settings.speed, SPEED_MOTION_EXPONENT));
}

/**
 * Contenido estático comprime ~4× mejor que contenido en movimiento pleno.
 * Los frames duplicados que genera ralentizar son casi gratis: gifsicle -O3
 * los colapsa a un delta transparente de unos pocos cientos de bytes, y eso
 * ya queda absorbido acá porque ralentizar baja el movimiento efectivo.
 */
function motionFactor(motion: number): number {
  return 0.25 + 0.75 * motion;
}

/** Menos colores = menos bits por índice antes de LZW. */
function paletteFactor(colors: number): number {
  const clamped = Math.min(256, Math.max(2, colors));
  return Math.log2(clamped) / 8;
}

/** `--lossy` de gifsicle: relación empírica, se aplana pasado ~120. */
function lossyFactor(lossy: number): number {
  if (lossy <= 0) return 1;
  return Math.max(0.35, 1 - Math.min(lossy, 200) / 320);
}

export function estimateSize(meta: VideoMeta, settings: GifSettings): SizeEstimate {
  const frames = frameCount(meta, settings);
  const pixels = settings.width * settings.height;

  const bpp =
    BASE_BPP *
    motionFactor(effectiveMotion(meta, settings)) *
    paletteFactor(settings.paletteColors) *
    (settings.dither ? DITHER_PENALTY : 1) *
    lossyFactor(settings.lossy);

  const expected = frames * (pixels * bpp + PER_FRAME_OVERHEAD) + HEADER_BYTES;

  // Banda ancha a propósito: sin encodear no se puede afinar más, y un
  // número puntual daría una falsa sensación de precisión.
  return {
    lowBytes: Math.round(expected * 0.62),
    expectedBytes: Math.round(expected),
    highBytes: Math.round(expected * 1.45),
    frameCount: frames,
    source: "heuristic",
  };
}

export function formatBytes(bytes: number, lang: Lang = "en"): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fmtNum(lang, bytes / 1024, 0)} KB`;
  return `${fmtNum(lang, bytes / (1024 * 1024), 1)} MB`;
}

export function formatRange(est: SizeEstimate, lang: Lang = "en"): string {
  // Con sonda el rango es angosto y mostrarlo como banda confunde más que ayuda.
  if (est.source === "probe") return `≈ ${formatBytes(est.expectedBytes, lang)}`;
  return `≈ ${formatBytes(est.lowBytes, lang)} – ${formatBytes(est.highBytes, lang)}`;
}
