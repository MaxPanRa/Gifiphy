use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;

use crate::error::{AppError, Result};
use crate::estimator::probe_estimate;
use crate::pipeline::Encoder;
use crate::types::{
    Adjustment, EncodeResult, GifSettings, VideoMeta, MAX_BYTES, TARGET_BYTES,
};

/// Delays admisibles, en centesimas de segundo. Todos producen un fps
/// exactamente representable: GIF solo admite delays enteros, asi que 30 fps
/// (3,33 cs) simplemente no existe como opcion.
const DELAY_LADDER: [u32; 5] = [4, 5, 8, 10, 20];

/// Por debajo de esto el GIF deja de ser util aunque cumpla el limite.
const MIN_WIDTH: u32 = 120;

/// Un peldano de degradacion. El orden de la tabla codifica una decision de
/// producto: que sacrificar primero.
///
/// Se degrada antes la compresion lossy (invisible a bajo nivel) y el fps que
/// la resolucion, porque perder nitidez es lo que mas se nota. La velocidad
/// NO aparece: es intencion del usuario, no una palanca del solver.
struct Rung {
    scale: f64,
    delay_steps: usize,
    palette: u32,
    lossy: u32,
}

const LADDER: [Rung; 12] = [
    Rung { scale: 1.00, delay_steps: 0, palette: 256, lossy: 0 },
    Rung { scale: 1.00, delay_steps: 0, palette: 256, lossy: 30 },
    Rung { scale: 1.00, delay_steps: 1, palette: 256, lossy: 30 },
    Rung { scale: 0.85, delay_steps: 1, palette: 256, lossy: 40 },
    Rung { scale: 0.85, delay_steps: 1, palette: 192, lossy: 50 },
    Rung { scale: 0.72, delay_steps: 1, palette: 192, lossy: 60 },
    Rung { scale: 0.72, delay_steps: 2, palette: 160, lossy: 60 },
    Rung { scale: 0.60, delay_steps: 2, palette: 128, lossy: 80 },
    Rung { scale: 0.50, delay_steps: 2, palette: 128, lossy: 100 },
    Rung { scale: 0.42, delay_steps: 3, palette: 96, lossy: 120 },
    Rung { scale: 0.35, delay_steps: 3, palette: 64, lossy: 140 },
    Rung { scale: 0.28, delay_steps: 4, palette: 64, lossy: 160 },
];

fn even(n: f64) -> u32 {
    let v = (n / 2.0).round() * 2.0;
    (v as i64).max(2) as u32
}

/// Avanza `steps` posiciones hacia delays mas largos (menos fps), partiendo
/// del delay base del usuario.
fn stepped_delay(base: u32, steps: usize) -> u32 {
    let start = DELAY_LADDER
        .iter()
        .position(|d| *d >= base)
        .unwrap_or(DELAY_LADDER.len() - 1);
    let idx = (start + steps).min(DELAY_LADDER.len() - 1);
    DELAY_LADDER[idx].max(base)
}

fn apply(base: &GifSettings, rung: &Rung) -> GifSettings {
    let ar = base.width as f64 / base.height as f64;
    let w = even(base.width as f64 * rung.scale).max(MIN_WIDTH);
    let h = even(w as f64 / ar);

    GifSettings {
        width: w,
        height: h,
        delay_cs: stepped_delay(base.delay_cs, rung.delay_steps),
        palette_colors: base.palette_colors.min(rung.palette),
        lossy: base.lossy.max(rung.lossy),
        ..base.clone()
    }
}

/// Devuelve pares from/to estructurados, no frases: la redaccion depende del
/// idioma que elija el usuario y eso lo resuelve el frontend.
fn describe(base: &GifSettings, used: &GifSettings) -> Vec<Adjustment> {
    let mut out = Vec::new();
    if used.width != base.width || used.height != base.height {
        out.push(Adjustment::new(
            "resolution",
            format!("{}x{}", base.width, base.height),
            format!("{}x{}", used.width, used.height),
        ));
    }
    if used.delay_cs != base.delay_cs {
        out.push(Adjustment::new(
            "smoothness",
            format!("{:.1} fps", 100.0 / base.delay_cs as f64),
            format!("{:.1} fps", 100.0 / used.delay_cs as f64),
        ));
    }
    if used.palette_colors != base.palette_colors {
        out.push(Adjustment::new(
            "palette",
            base.palette_colors.to_string(),
            used.palette_colors.to_string(),
        ));
    }
    if used.lossy != base.lossy {
        out.push(Adjustment::new(
            "lossy",
            base.lossy.to_string(),
            used.lossy.to_string(),
        ));
    }
    out
}

/// Busca el peldano de mayor calidad que cabe en el limite y encodea ahi.
///
/// Estrategia: biseccion sobre la escalera usando la sonda como oraculo
/// (~1 s por consulta, ~4 consultas), y despues UN encode real. El encode
/// real es la unica fuente de verdad: si se pasa, se avanza de peldano y se
/// reintenta, con tope de intentos para no entrar en bucle.
pub fn solve_and_encode<F>(
    meta: &VideoMeta,
    base: &GifSettings,
    out_path: &Path,
    cancel: Arc<AtomicBool>,
    mut progress: F,
) -> Result<EncodeResult>
where
    F: FnMut(&'static str, f64, Option<&'static str>, serde_json::Value),
{
    let started = Instant::now();

    progress(
        "estimating",
        0.05,
        Some("measuringCompressibility"),
        serde_json::Value::Null,
    );

    // Biseccion: buscar el menor indice cuya estimacion entra en el objetivo.
    let (mut lo, mut hi) = (0usize, LADDER.len() - 1);
    let mut best_fit: Option<usize> = None;
    let mut worst_estimate = u64::MAX;
    let mut probes = 0;

    while lo <= hi {
        let mid = (lo + hi) / 2;
        let candidate = apply(base, &LADDER[mid]);
        let est = probe_estimate(meta, &candidate, cancel.clone())?;
        probes += 1;
        progress(
            "estimating",
            0.05 + 0.10 * probes as f64 / 4.0,
            Some("evaluatingRung"),
            serde_json::json!({ "index": probes, "total": 4 }),
        );

        if est.expected_bytes <= TARGET_BYTES {
            best_fit = Some(mid);
            if mid == 0 {
                break;
            }
            hi = mid - 1;
        } else {
            if mid == LADDER.len() - 1 {
                worst_estimate = est.expected_bytes;
            }
            lo = mid + 1;
        }
    }

    let Some(mut idx) = best_fit else {
        // Ni el peldano mas agresivo alcanza: hay que acortar el clip. Se
        // calcula cuanto, porque "no se puede" a secas no ayuda a nadie.
        let last = apply(base, &LADDER[LADDER.len() - 1]);
        let est = if worst_estimate != u64::MAX {
            worst_estimate
        } else {
            probe_estimate(meta, &last, cancel.clone())?.expected_bytes
        };
        let ratio = TARGET_BYTES as f64 / est as f64;
        return Err(AppError::Unsatisfiable {
            best_mb: est as f64 / 1_000_000.0,
            suggested_sec: base.clip_duration(meta) * ratio,
        });
    };

    // Encode real con verificacion. La estimacion orienta; el byte count manda.
    let encoder = Encoder::new(meta, cancel.clone())?;
    let mut attempts = 0;

    loop {
        let settings = apply(base, &LADDER[idx]);
        let bytes = encoder.encode(meta, &settings, out_path, |stage, f| {
            progress(stage, 0.15 + 0.85 * f, None, serde_json::Value::Null);
        })?;

        if bytes <= MAX_BYTES {
            return Ok(EncodeResult {
                output_path: out_path.to_string_lossy().to_string(),
                bytes,
                frame_count: settings.frame_count(meta),
                adjustments: describe(base, &settings),
                settings_used: settings,
                elapsed_ms: started.elapsed().as_millis() as u64,
            });
        }

        attempts += 1;
        if attempts >= 3 || idx >= LADDER.len() - 1 {
            return Err(AppError::Unsatisfiable {
                best_mb: bytes as f64 / 1_000_000.0,
                suggested_sec: base.clip_duration(meta) * (TARGET_BYTES as f64 / bytes as f64),
            });
        }
        idx += 1;
        progress(
            "encoding",
            0.2,
            Some("overshootRetry"),
            serde_json::Value::Null,
        );
    }
}
