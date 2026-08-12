use serde::{Serialize, Serializer};

/// Errores del core.
///
/// Los textos de `#[error]` son solo para logs y `Debug`: lo que viaja al
/// frontend es la forma serializada de mas abajo, con clave y parametros, para
/// que la UI pueda redactarlos en el idioma elegido.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("tool not found: {0}")]
    ToolMissing(&'static str),

    #[error("no video stream")]
    NoVideoStream,

    #[error("probe failed: {0}")]
    Probe(String),

    #[error("ffmpeg failed: {0}")]
    Ffmpeg(String),

    #[error("gifsicle failed: {0}")]
    Gifsicle(String),

    #[error("cancelled")]
    Cancelled,

    #[error("unsatisfiable: best {best_mb} MB, suggest {suggested_sec} s")]
    Unsatisfiable { best_mb: f64, suggested_sec: f64 },

    #[error("io: {0}")]
    Io(String),
}

impl AppError {
    /// Clave estable que el frontend usa para elegir el texto traducido.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::ToolMissing(_) => "toolMissing",
            AppError::NoVideoStream => "noVideoStream",
            AppError::Probe(_) => "probeFailed",
            AppError::Ffmpeg(_) => "ffmpegFailed",
            AppError::Gifsicle(_) => "gifsicleFailed",
            AppError::Cancelled => "cancelled",
            AppError::Unsatisfiable { .. } => "unsatisfiable",
            AppError::Io(_) => "ioError",
        }
    }

    /// Parametros que la traduccion interpola.
    pub fn params(&self) -> serde_json::Value {
        match self {
            AppError::ToolMissing(tool) => serde_json::json!({ "tool": tool }),
            AppError::Unsatisfiable {
                best_mb,
                suggested_sec,
            } => serde_json::json!({ "bestMb": best_mb, "suggestedSec": suggested_sec }),
            _ => serde_json::Value::Null,
        }
    }

    /// Salida cruda de la herramienta que fallo. No se traduce a proposito:
    /// es diagnostico tecnico y traducirlo lo volveria inbuscable.
    pub fn detail(&self) -> Option<&str> {
        match self {
            AppError::Probe(d)
            | AppError::Ffmpeg(d)
            | AppError::Gifsicle(d)
            | AppError::Io(d) => Some(d),
            _ => None,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    code: &'static str,
    params: serde_json::Value,
    detail: Option<&'a str>,
}

impl Serialize for AppError {
    // `Result` esta aliasado en este modulo, asi que aca hace falta el de std.
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.code(),
            params: self.params(),
            detail: self.detail(),
        }
        .serialize(s)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
