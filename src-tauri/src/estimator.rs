use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::error::Result;
use crate::pipeline::Encoder;
use crate::types::{EstimateSource, GifSettings, SizeEstimate, TrimRange, VideoMeta};

/// Cuantos frames encodear en la sonda. Suficientes para que la paleta y el
/// delta-encoding se comporten como en el clip real, sin pagar un encode largo.
const SAMPLE_FRAMES: u32 = 14;

/// Overhead fijo aproximado de cabecera + paleta global, en bytes. Se resta
/// antes de extrapolar: en una muestra de 14 frames pesa mucho, en el GIF
/// final es ruido, y no restarlo inflaria la estimacion de forma sistematica.
const HEADER_BYTES: f64 = 800.0;

/// `gifsicle -O3` rinde algo mejor cuanto mas largo es el GIF, porque tiene
/// mas redundancia entre frames para explotar. La muestra corta subestima esa
/// ganancia, asi que se corrige a la baja.
const LENGTH_BONUS: f64 = 0.93;

/// Estimacion por sonda: encodea un tramo real con los parametros exactos y
/// extrapola por cantidad de frames.
///
/// Es mucho mas fiable que el heuristico porque no adivina la compresibilidad
/// del contenido: la mide. El sesgo que queda es de representatividad, porque
/// se muestrea una sola ventana del clip.
pub fn probe_estimate(
    meta: &VideoMeta,
    settings: &GifSettings,
    cancel: Arc<AtomicBool>,
) -> Result<SizeEstimate> {
    let total_frames = settings.frame_count(meta);

    // Clip tan corto que la muestra seria el clip entero: encodearlo directo
    // es mas rapido y ademas exacto.
    if total_frames <= SAMPLE_FRAMES * 2 {
        let encoder = Encoder::new(meta, cancel)?;
        let tmp = tempfile::tempdir()?;
        let out = tmp.path().join("full.gif");
        let bytes = encoder.encode(meta, settings, &out, |_, _| {})?;
        return Ok(SizeEstimate {
            low_bytes: bytes,
            expected_bytes: bytes,
            high_bytes: bytes,
            frame_count: total_frames,
            source: EstimateSource::Probe,
        });
    }

    let clip_start = settings.trim.map(|t| t.start_sec).unwrap_or(0.0);
    let clip_dur = settings.clip_duration(meta);

    // Tiempo de FUENTE que cubren SAMPLE_FRAMES frames de salida. Depende de
    // la velocidad: a 2x cada frame del GIF consume el doble de video.
    let sample_src_dur = (SAMPLE_FRAMES as f64 / settings.fps()) * settings.speed;

    // Ventana centrada en el 45% del clip: evita intros en negro y creditos,
    // que son las zonas menos representativas.
    let start = (clip_start + clip_dur * 0.45).min(clip_start + clip_dur - sample_src_dur);
    let start = start.max(clip_start);

    let sample_settings = GifSettings {
        trim: Some(TrimRange {
            start_sec: start,
            end_sec: (start + sample_src_dur).min(clip_start + clip_dur),
        }),
        ..settings.clone()
    };

    let encoder = Encoder::new(meta, cancel)?;
    let tmp = tempfile::tempdir()?;
    let out = tmp.path().join("sample.gif");
    let sample_bytes = encoder.encode(meta, &sample_settings, &out, |_, _| {})? as f64;

    let sample_frames = sample_settings.frame_count(meta).max(1) as f64;
    let per_frame = ((sample_bytes - HEADER_BYTES).max(1.0)) / sample_frames;

    let expected = (per_frame * total_frames as f64 * LENGTH_BONUS + HEADER_BYTES).max(1.0);

    Ok(SizeEstimate {
        // Banda angosta: el error tipico contra el encode real ronda el 15%.
        low_bytes: (expected * 0.85) as u64,
        expected_bytes: expected as u64,
        high_bytes: (expected * 1.18) as u64,
        frame_count: total_frames,
        source: EstimateSource::Probe,
    })
}
