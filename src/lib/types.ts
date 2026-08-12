/**
 * Tipos compartidos con el core en Rust. Todo lo que cruza el IPC de Tauri
 * vive acá y debe mantenerse en sincronía con `src-tauri/src/types.rs`
 * (serde usa camelCase para que ambos lados hablen el mismo dialecto).
 */

/** Límite duro del entregable. Decimal, no binario: es el conservador. */
export const MAX_BYTES = 20_000_000;

/** Metadata normalizada que devuelve `probe_video`. */
export interface VideoMeta {
  path: string;
  /** Ya corregido por la metadata de rotación: es lo que el usuario ve. */
  width: number;
  height: number;
  durationSec: number;
  /** fps promedio real. En fuentes VFR es una media, no un contrato. */
  fps: number;
  /** true si el contenedor declara frame rate variable. */
  variableFrameRate: boolean;
  /** Grados aplicados desde la metadata de rotación (0/90/180/270). */
  rotationApplied: number;
  /** Sample aspect ratio; ≠ 1 significa fuente anamórfica. */
  sampleAspectRatio: number;
  codec: string;
  /** true para BT.2020 / PQ / HLG: necesita tone mapping a SDR. */
  isHdr: boolean;
  /**
   * Índice de movimiento 0..1 derivado de la varianza de tamaños de frame
   * comprimidos. Es la entrada más importante del estimador heurístico:
   * un screencast estático y un plano con cámara en mano difieren ~10× en
   * bytes por frame con los mismos parámetros.
   */
  motionIndex: number;
}

/** Recorte temporal. Si es null se usa el clip entero. */
export interface TrimRange {
  startSec: number;
  endSec: number;
}

/** Cómo resolver el desajuste entre el AR del video y el AR elegido. */
export type FitMode = "crop" | "pad";

export interface GifSettings {
  width: number;
  height: number;
  fitMode: FitMode;
  /** Delay entre frames en centésimas de segundo. Entero, ≥ 2. */
  delayCs: number;
  /** Factor de avance del tiempo fuente: 2 = doble de rápido (saltea frames). */
  speed: number;
  trim: TrimRange | null;
  /** Colores de la paleta, 2..256. */
  paletteColors: number;
  dither: boolean;
  /** Parámetro `--lossy` de gifsicle. 0 = desactivado. */
  lossy: number;
}

/**
 * El estimador devuelve un rango, nunca un número puntual: el error real
 * contra contenido arbitrario no baja del ~15% ni con sonda.
 */
export interface SizeEstimate {
  lowBytes: number;
  expectedBytes: number;
  highBytes: number;
  frameCount: number;
  /** "heuristic" = instantáneo mientras se mueven los controles.
   *  "probe" = se encodearon frames reales; mucho más ajustado. */
  source: "heuristic" | "probe";
}

export type JobStage =
  | "probing"
  | "estimating"
  | "decoding"
  | "encoding"
  | "optimizing"
  | "verifying"
  | "done"
  | "cancelled"
  | "failed";

export interface JobProgress {
  jobId: string;
  stage: JobStage;
  /** 0..1 dentro de la etapa actual. */
  fraction: number;
  /** Clave de traducción, no texto: el idioma lo decide el frontend. */
  messageCode: string | null;
  messageParams: Record<string, string | number> | null;
}

/** Cambio aplicado por el solver. `from`/`to` ya vienen formateados. */
export interface Adjustment {
  kind: string;
  from: string;
  to: string;
}

/** Forma serializada de `AppError` en Rust. */
export interface ErrorPayload {
  code: string;
  params: Record<string, string | number> | null;
  /** Salida cruda de la herramienta que falló. Nunca se traduce. */
  detail: string | null;
}

export interface EncodeResult {
  outputPath: string;
  /** Tamaño real medido en disco, no estimado. */
  bytes: number;
  frameCount: number;
  /** Settings efectivamente usados: difieren de los pedidos si corrió el solver. */
  settingsUsed: GifSettings;
  /** Lo que el solver degradó; vacío si no tocó nada. */
  adjustments: Adjustment[];
  elapsedMs: number;
}
