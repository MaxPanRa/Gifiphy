use serde::{Deserialize, Serialize};

/// Limite duro del entregable. Decimal (20.000.000) y no binario, porque es
/// el conservador: si el usuario mide con una herramienta que reporta MB
/// decimales, igual cumplimos.
pub const MAX_BYTES: u64 = 20_000_000;

/// Margen de seguridad para el solver. Apuntamos a 19,4 MB para no fallar por
/// milesimas cuando la sonda subestima levemente.
pub const TARGET_BYTES: u64 = 19_400_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMeta {
    pub path: String,
    /// Ya rotado: es lo que el usuario ve, no lo que dice el stream.
    pub width: u32,
    pub height: u32,
    pub duration_sec: f64,
    pub fps: f64,
    pub variable_frame_rate: bool,
    pub rotation_applied: i32,
    pub sample_aspect_ratio: f64,
    pub codec: String,
    pub is_hdr: bool,
    /// 0..1, derivado de la varianza de tamanos de frame comprimidos.
    pub motion_index: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimRange {
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FitMode {
    Crop,
    Pad,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifSettings {
    pub width: u32,
    pub height: u32,
    pub fit_mode: FitMode,
    /// Delay entre frames en centesimas de segundo. Entero, >= 2.
    pub delay_cs: u32,
    /// Factor de avance del tiempo fuente. 2.0 = doble de rapido.
    pub speed: f64,
    pub trim: Option<TrimRange>,
    pub palette_colors: u32,
    pub dither: bool,
    pub lossy: u32,
}

impl GifSettings {
    pub fn fps(&self) -> f64 {
        100.0 / self.delay_cs.max(2) as f64
    }

    pub fn clip_duration(&self, meta: &VideoMeta) -> f64 {
        match self.trim {
            Some(t) => (t.end_sec - t.start_sec).max(0.0),
            None => meta.duration_sec,
        }
    }

    /// N = duracion_fuente / speed x fps_salida
    pub fn frame_count(&self, meta: &VideoMeta) -> u32 {
        let out_dur = self.clip_duration(meta) / self.speed.max(0.01);
        ((out_dur * self.fps()).round() as i64).max(1) as u32
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeEstimate {
    pub low_bytes: u64,
    pub expected_bytes: u64,
    pub high_bytes: u64,
    pub frame_count: u32,
    pub source: EstimateSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EstimateSource {
    Heuristic,
    Probe,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStage {
    Probing,
    Estimating,
    Decoding,
    Encoding,
    Optimizing,
    Verifying,
    Done,
    Cancelled,
    Failed,
}

/// Evento emitido al frontend por el canal `job://progress`.
///
/// El backend NUNCA manda texto ya redactado: manda una clave y sus
/// parametros, y el frontend decide el idioma. Es la unica forma de que el
/// selector ES/EN alcance tambien a los mensajes que nacen en Rust.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub job_id: String,
    pub stage: JobStage,
    pub fraction: f64,
    pub message_code: Option<String>,
    pub message_params: serde_json::Value,
}

/// Cambio que el solver aplico respecto de lo que pidio el usuario.
/// `from`/`to` son valores ya formateados (no traducibles); la frase que los
/// envuelve la arma el frontend segun `kind`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjustment {
    pub kind: String,
    pub from: String,
    pub to: String,
}

impl Adjustment {
    pub fn new(kind: &str, from: impl Into<String>, to: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            from: from.into(),
            to: to.into(),
        }
    }

    /// Aviso sin par from/to (p. ej. "gifsicle no disponible").
    pub fn flag(kind: &str) -> Self {
        Self::new(kind, "", "")
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodeResult {
    pub output_path: String,
    /// Medido en disco con `metadata().len()`, nunca estimado.
    pub bytes: u64,
    pub frame_count: u32,
    pub settings_used: GifSettings,
    pub adjustments: Vec<Adjustment>,
    pub elapsed_ms: u64,
}
