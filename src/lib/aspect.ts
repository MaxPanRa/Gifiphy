import type { FitMode, VideoMeta } from "./types";

export interface AspectPreset {
  id: string;
  /** Notación literal ("16:9"): no se traduce. Vacío si hay `labelKey`. */
  label: string;
  /** Sólo para etiquetas que sí son palabras, como "Original". */
  labelKey?: string;
  hintKey: string;
  /** null = usar el AR nativo del video. */
  ratio: number | null;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "native", label: "", labelKey: "aspect.native", hintKey: "aspect.nativeHint", ratio: null },
  { id: "16:9", label: "16:9", hintKey: "aspect.16:9Hint", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", hintKey: "aspect.9:16Hint", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", hintKey: "aspect.1:1Hint", ratio: 1 },
  { id: "4:5", label: "4:5", hintKey: "aspect.4:5Hint", ratio: 4 / 5 },
  { id: "4:3", label: "4:3", hintKey: "aspect.4:3Hint", ratio: 4 / 3 },
  { id: "21:9", label: "21:9", hintKey: "aspect.21:9Hint", ratio: 21 / 9 },
];

export interface SizeOption {
  width: number;
  height: number;
  label: string;
  /** Clave de la etiqueta cualitativa de coste, para orientar antes de estimar. */
  weightKey: string;
}

/**
 * Longitudes del LADO LARGO sobre las que se deriva el lado corto según el AR.
 * En proporciones horizontales el lado largo es el ancho; en verticales, el alto.
 *
 * Casi todos son múltiplos de 16, lo que hace que el 4:3 caiga siempre en
 * alturas enteras y reconocibles (320×240, 480×360, 640×480, 800×600,
 * 960×720, 1200×900) sin necesidad de una tabla aparte para esa proporción.
 * El 854 es la excepción, y está porque es el 480p de 16:9 de toda la vida.
 */
const BASE_LONG_SIDES = [240, 320, 400, 480, 560, 640, 720, 800, 854, 960, 1024, 1120, 1200];

/** GIF no exige dimensiones pares, pero los filtros de escala de FFmpeg sí. */
export function toEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Umbrales por cantidad de píxeles, no por lado: en GIF el coste escala con el
 * área, y un 1200×900 (1,08 MP) cuesta el doble que un 1200×675 pese a
 * compartir el lado largo.
 */
function weightFor(pixels: number): string {
  if (pixels <= 80_000) return "weight.light";
  if (pixels <= 200_000) return "weight.medium";
  if (pixels <= 420_000) return "weight.heavy";
  if (pixels <= 700_000) return "weight.veryHeavy";
  return "weight.extreme";
}

/**
 * Tamaño por defecto al elegir una proporción: el mayor que todavía entra en
 * "medio". Arrancar en el más chico subestima lo que la app puede hacer, y
 * arrancar en el más grande empuja al usuario contra el límite de 20 MB desde
 * el primer clic.
 */
export function defaultSize(options: SizeOption[]): SizeOption | undefined {
  const safe = options.filter((o) => o.width * o.height <= 200_000);
  return safe.at(-1) ?? options[0];
}

/**
 * Deriva los tamaños sugeridos para un AR. Nunca propone escalar por encima
 * de la resolución nativa: agrandar un GIF sólo suma peso sin sumar detalle.
 */
export function suggestedSizes(meta: VideoMeta, ratio: number | null): SizeOption[] {
  const ar = ratio ?? (meta.width * meta.sampleAspectRatio) / meta.height;
  const nativeWidth = meta.width * meta.sampleAspectRatio;

  const out: SizeOption[] = [];
  for (const base of BASE_LONG_SIDES) {
    // 854 sólo significa algo en 16:9, donde es el 480p de siempre. En 4:3
    // produciría un 854×640 desalineado entre dos vecinos limpios (800×600 y
    // 960×720), así que ahí no se ofrece.
    if (base === 854 && Math.abs(ar - 16 / 9) > 0.02) continue;

    // El lado largo se fija exacto y el corto se deriva, nunca al revés:
    // redondear primero el lado corto y derivar el largo de ahí lo empuja por
    // encima del tope (en 9:16 daba 676×1202, pasándose de 1200).
    const w = ar >= 1 ? base : toEven(base * ar);
    const h = ar >= 1 ? toEven(base / ar) : base;

    // No upscalear en ninguno de los dos ejes: agrandar suma peso sin sumar
    // detalle. Hay que mirar ambos, porque recortar a una proporción vertical
    // desde una fuente apaisada limita por el alto, no por el ancho.
    if (w > nativeWidth * 1.02 || h > meta.height * 1.02) continue;
    if (out.some((o) => o.width === w && o.height === h)) continue;

    out.push({ width: w, height: h, label: `${w} × ${h}`, weightKey: weightFor(w * h) });
  }

  // Fuentes muy chicas podrían no matchear ningún ancho base: al menos
  // ofrecer la resolución nativa ajustada al AR pedido.
  if (out.length === 0) {
    const w = toEven(Math.min(nativeWidth, 320));
    const h = toEven(w / ar);
    out.push({ width: w, height: h, label: `${w} × ${h}`, weightKey: weightFor(w * h) });
  }

  return out;
}

/**
 * Devuelve la cadena de filtros de FFmpeg que lleva del frame fuente al
 * lienzo destino exacto, respetando SAR y el modo de encaje elegido.
 */
export function fitFilter(
  meta: VideoMeta,
  targetW: number,
  targetH: number,
  mode: FitMode,
): string {
  const sourceAr = (meta.width * meta.sampleAspectRatio) / meta.height;
  const targetAr = targetW / targetH;

  // Diferencia despreciable: escalar directo y evitar un filtro de más.
  if (Math.abs(sourceAr - targetAr) < 0.01) {
    return `scale=${targetW}:${targetH}:flags=lanczos`;
  }

  if (mode === "crop") {
    // Escalar cubriendo el lienzo y recortar el excedente desde el centro.
    return [
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${targetW}:${targetH}`,
    ].join(",");
  }

  // pad: escalar hacia adentro y rellenar. El color de relleno importa,
  // porque en GIF una barra negra consume entradas de paleta igual que
  // cualquier otro color plano (aunque comprime casi gratis por RLE).
  return [
    `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black`,
  ].join(",");
}
