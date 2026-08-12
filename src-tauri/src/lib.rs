mod error;
mod estimator;
mod ffmpeg;
mod pipeline;
mod probe;
mod solver;
mod types;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{Emitter, Manager, State};

use error::{AppError, Result};
use types::{
    Adjustment, EncodeResult, GifSettings, JobProgress, JobStage, SizeEstimate, VideoMeta,
    MAX_BYTES,
};

/// Registro de trabajos en curso. Cada uno tiene su bandera de cancelacion,
/// que los procesos hijos consultan entre etapas y entre lineas de progreso.
#[derive(Default)]
struct Jobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Jobs {
    fn start(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.0.lock().unwrap().insert(id.to_string(), flag.clone());
        flag
    }
    fn finish(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
    fn cancel(&self, id: &str) {
        if let Some(flag) = self.0.lock().unwrap().get(id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

fn stage_from(s: &str) -> JobStage {
    match s {
        "estimating" => JobStage::Estimating,
        "decoding" => JobStage::Decoding,
        "optimizing" => JobStage::Optimizing,
        "verifying" => JobStage::Verifying,
        _ => JobStage::Encoding,
    }
}

fn emit(
    app: &tauri::AppHandle,
    job_id: &str,
    stage: &str,
    fraction: f64,
    code: Option<&str>,
    params: serde_json::Value,
) {
    let _ = app.emit(
        "job://progress",
        JobProgress {
            job_id: job_id.to_string(),
            stage: stage_from(stage),
            fraction: fraction.clamp(0.0, 1.0),
            message_code: code.map(|c| c.to_string()),
            message_params: params,
        },
    );
}

#[tauri::command]
async fn probe_video(path: String) -> Result<VideoMeta> {
    tauri::async_runtime::spawn_blocking(move || probe::probe(&path))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

/// Estimacion por sonda: encodea un tramo real. Se llama al pulsar Generar,
/// no en cada cambio de control (para eso esta el heuristico en el frontend).
#[tauri::command]
async fn estimate_precise(
    meta: VideoMeta,
    settings: GifSettings,
    job_id: String,
    jobs: State<'_, Jobs>,
) -> Result<SizeEstimate> {
    let cancel = jobs.start(&job_id);
    let id = job_id.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        estimator::probe_estimate(&meta, &settings, cancel)
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    jobs.finish(&id);
    res
}

/// Encode con los parametros exactos que pidio el usuario.
///
/// Verifica el tamano real igual: entregar en silencio un archivo fuera de
/// spec seria peor que avisar.
#[tauri::command]
async fn create_gif(
    app: tauri::AppHandle,
    meta: VideoMeta,
    settings: GifSettings,
    output_path: String,
    job_id: String,
    jobs: State<'_, Jobs>,
) -> Result<EncodeResult> {
    let cancel = jobs.start(&job_id);
    let id = job_id.clone();
    let app2 = app.clone();

    let res = tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let out = PathBuf::from(&output_path);
        let encoder = pipeline::Encoder::new(&meta, cancel)?;

        // Decir por donde va la aceleracion es informacion util: explica por
        // que un mismo clip tarda 4 s en una maquina y 40 en otra.
        emit(
            &app2,
            &id,
            "decoding",
            0.01,
            Some("decodingWith"),
            serde_json::json!({ "accel": encoder.hwaccel().label() }),
        );

        let bytes = encoder.encode(&meta, &settings, &out, |stage, f| {
            emit(&app2, &id, stage, f, None, serde_json::Value::Null);
        })?;

        let mut adjustments = Vec::new();
        if !encoder.has_gifsicle() {
            adjustments.push(Adjustment::flag("noGifsicle"));
        }
        if bytes > MAX_BYTES {
            adjustments.push(Adjustment::new(
                "overLimit",
                format!("{:.1} MB", bytes as f64 / 1_000_000.0),
                "20 MB",
            ));
        }

        Ok(EncodeResult {
            output_path,
            bytes,
            frame_count: settings.frame_count(&meta),
            settings_used: settings,
            adjustments,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;

    jobs.finish(&job_id);
    res
}

/// Encode dirigido: el solver degrada calidad hasta caber en 20 MB.
#[tauri::command]
async fn create_suggested_gif(
    app: tauri::AppHandle,
    meta: VideoMeta,
    settings: GifSettings,
    output_path: String,
    job_id: String,
    jobs: State<'_, Jobs>,
) -> Result<EncodeResult> {
    let cancel = jobs.start(&job_id);
    let id = job_id.clone();
    let app2 = app.clone();

    let res = tauri::async_runtime::spawn_blocking(move || {
        let out = PathBuf::from(&output_path);
        solver::solve_and_encode(&meta, &settings, &out, cancel, |stage, f, code, params| {
            emit(&app2, &id, stage, f, code, params);
        })
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;

    jobs.finish(&job_id);
    res
}

#[tauri::command]
fn cancel_job(job_id: String, jobs: State<'_, Jobs>) {
    jobs.cancel(&job_id);
}

/// Diagnostico de entorno para mostrar en la UI: que hay disponible y por
/// donde va a ir la aceleracion.
#[tauri::command]
fn environment_report() -> serde_json::Value {
    serde_json::json!({
        "ffmpeg": ffmpeg::locate("ffmpeg").is_ok(),
        "ffprobe": ffmpeg::locate("ffprobe").is_ok(),
        "gifsicle": ffmpeg::locate("gifsicle").is_ok(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(Jobs::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            probe_video,
            estimate_precise,
            create_gif,
            create_suggested_gif,
            cancel_job,
            environment_report,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Gifiphy");
}
