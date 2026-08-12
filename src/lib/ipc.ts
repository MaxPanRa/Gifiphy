import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  EncodeResult,
  GifSettings,
  JobProgress,
  SizeEstimate,
  VideoMeta,
} from "./types";

/**
 * Wrappers tipados sobre los comandos de Tauri. Tauri convierte camelCase de
 * JS a snake_case de Rust automáticamente, así que los nombres de argumento
 * de acá matchean los parámetros de `lib.rs`.
 */

export function newJobId(): string {
  return crypto.randomUUID();
}

export const probeVideo = (path: string) => invoke<VideoMeta>("probe_video", { path });

export const estimatePrecise = (meta: VideoMeta, settings: GifSettings, jobId: string) =>
  invoke<SizeEstimate>("estimate_precise", { meta, settings, jobId });

export const createGif = (
  meta: VideoMeta,
  settings: GifSettings,
  outputPath: string,
  jobId: string,
) => invoke<EncodeResult>("create_gif", { meta, settings, outputPath, jobId });

export const createSuggestedGif = (
  meta: VideoMeta,
  settings: GifSettings,
  outputPath: string,
  jobId: string,
) => invoke<EncodeResult>("create_suggested_gif", { meta, settings, outputPath, jobId });

export const cancelJob = (jobId: string) => invoke<void>("cancel_job", { jobId });

export const environmentReport = () =>
  invoke<{ ffmpeg: boolean; ffprobe: boolean; gifsicle: boolean }>("environment_report");

export function onProgress(cb: (p: JobProgress) => void) {
  return listen<JobProgress>("job://progress", (e) => cb(e.payload));
}
