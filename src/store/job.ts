import { create } from "zustand";
import { defaultSize, suggestedSizes } from "../lib/aspect";
import { estimateSize } from "../lib/estimate";
import { DEFAULT_DELAY_CS } from "../lib/speed";
import type {
  EncodeResult,
  GifSettings,
  JobProgress,
  SizeEstimate,
  TrimRange,
  VideoMeta,
} from "../lib/types";

interface JobState {
  meta: VideoMeta | null;
  aspectId: string;
  settings: GifSettings;
  /** Estimación heurística, recalculada en cada cambio de control. */
  estimate: SizeEstimate | null;
  /** Estimación por sonda; sólo existe tras pedirla explícitamente. */
  probed: SizeEstimate | null;
  progress: JobProgress | null;
  result: EncodeResult | null;
  error: string | null;
  busy: boolean;

  setMeta: (meta: VideoMeta) => void;
  setAspect: (aspectId: string, width: number, height: number) => void;
  patch: (partial: Partial<GifSettings>) => void;
  setTrim: (trim: TrimRange | null) => void;
  setProgress: (p: JobProgress | null) => void;
  setResult: (r: EncodeResult | null) => void;
  setError: (e: string | null) => void;
  setBusy: (b: boolean) => void;
  setProbed: (e: SizeEstimate | null) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: GifSettings = {
  width: 480,
  height: 270,
  fitMode: "crop",
  delayCs: DEFAULT_DELAY_CS,
  speed: 1,
  trim: null,
  paletteColors: 256,
  dither: true,
  lossy: 0,
};

/** Toda mutación de settings invalida la sonda y recalcula el heurístico:
 *  mostrar una estimación de parámetros viejos es peor que no mostrar nada. */
function recompute(meta: VideoMeta | null, settings: GifSettings) {
  return {
    settings,
    estimate: meta ? estimateSize(meta, settings) : null,
    probed: null,
    result: null,
  };
}

export const useJob = create<JobState>((set, get) => ({
  meta: null,
  aspectId: "native",
  settings: DEFAULT_SETTINGS,
  estimate: null,
  probed: null,
  progress: null,
  result: null,
  error: null,
  busy: false,

  setMeta: (meta) => {
    // Al cargar un video se arranca desde el AR nativo con un tamaño
    // intermedio, que es el default menos sorprendente.
    const pick = defaultSize(suggestedSizes(meta, null));
    const settings: GifSettings = {
      ...DEFAULT_SETTINGS,
      width: pick?.width ?? DEFAULT_SETTINGS.width,
      height: pick?.height ?? DEFAULT_SETTINGS.height,
    };
    set({
      meta,
      aspectId: "native",
      error: null,
      progress: null,
      ...recompute(meta, settings),
    });
  },

  setAspect: (aspectId, width, height) => {
    const { meta, settings } = get();
    set({ aspectId, ...recompute(meta, { ...settings, width, height }) });
  },

  patch: (partial) => {
    const { meta, settings } = get();
    set(recompute(meta, { ...settings, ...partial }));
  },

  setTrim: (trim) => {
    const { meta, settings } = get();
    set(recompute(meta, { ...settings, trim }));
  },

  setProgress: (progress) => set({ progress }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
  setProbed: (probed) => set({ probed }),

  reset: () =>
    set({
      meta: null,
      aspectId: "native",
      settings: DEFAULT_SETTINGS,
      estimate: null,
      probed: null,
      progress: null,
      result: null,
      error: null,
      busy: false,
    }),
}));
