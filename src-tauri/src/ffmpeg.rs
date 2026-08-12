use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

use crate::error::{AppError, Result};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Localiza un binario: primero junto al ejecutable (sidecar empaquetado),
/// despues en el PATH del sistema. El orden importa: si vendorizamos una
/// version conocida queremos esa, no la que el usuario tenga instalada.
pub fn locate(tool: &'static str) -> Result<PathBuf> {
    let exe_name = if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [dir.join(&exe_name), dir.join("bin").join(&exe_name)] {
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    // En desarrollo el binario corre desde `target/debug/`, donde los recursos
    // del bundle todavia no fueron copiados. Sin esto, `tauri dev` nunca veria
    // el gifsicle vendorizado y se comportaria distinto que la app instalada.
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join(&exe_name);
        if dev.is_file() {
            return Ok(dev);
        }
    }

    // Delegar la busqueda en PATH al SO probando ejecutarlo.
    let probe = new_command_raw(&exe_name)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    match probe {
        Ok(_) => Ok(PathBuf::from(exe_name)),
        Err(_) => Err(AppError::ToolMissing(tool)),
    }
}

fn new_command_raw(program: &str) -> Command {
    let mut cmd = Command::new(program);
    // Sin esto cada invocacion abre una ventana de consola en Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn command(path: &PathBuf) -> Command {
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Ejecuta y exige exito. FFmpeg escribe todo su diagnostico en stderr, asi
/// que ese es el texto util cuando algo falla.
pub fn run(mut cmd: Command, tool: &'static str) -> Result<Output> {
    let out = cmd
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::Io(format!("no se pudo ejecutar {tool}: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let tail: Vec<&str> = stderr.lines().rev().take(6).collect();
        let msg = tail.into_iter().rev().collect::<Vec<_>>().join(" | ");
        return Err(match tool {
            "gifsicle" => AppError::Gifsicle(msg),
            _ => AppError::Ffmpeg(msg),
        });
    }
    Ok(out)
}

/// Aceleracion por hardware para decodificar. En una NVIDIA moderna esto es
/// la diferencia entre decodificar 4K a 40 fps o a 600 fps.
///
/// Deliberadamente NO se usa `-hwaccel_output_format cuda`: mantener los
/// frames en VRAM obligaria a que toda la cadena de filtros sea CUDA, y
/// `crop`/`pad`/`palettegen` no lo son. Descargar a memoria de sistema tras
/// decodificar conserva la mayor parte de la ganancia sin la fragilidad.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HwAccel {
    Cuda,
    D3d11va,
    Qsv,
    None,
}

impl HwAccel {
    pub fn args(self) -> &'static [&'static str] {
        match self {
            HwAccel::Cuda => &["-hwaccel", "cuda"],
            HwAccel::D3d11va => &["-hwaccel", "d3d11va"],
            HwAccel::Qsv => &["-hwaccel", "qsv"],
            HwAccel::None => &[],
        }
    }

    /// Cadena de fallback: si CUDA falla (driver viejo, codec no soportado
    /// por NVDEC como VP9 en GPUs antiguas) se degrada sin molestar al usuario.
    /// QSV va despues de d3d11va porque en iGPU de Intel d3d11va suele cubrir
    /// los mismos codecs con menos superficie de fallo.
    pub fn fallback_chain() -> &'static [HwAccel] {
        &[
            HwAccel::Cuda,
            HwAccel::D3d11va,
            HwAccel::Qsv,
            HwAccel::None,
        ]
    }

    pub fn label(self) -> &'static str {
        match self {
            HwAccel::Cuda => "NVDEC (NVIDIA)",
            HwAccel::D3d11va => "Direct3D 11",
            HwAccel::Qsv => "Intel Quick Sync",
            HwAccel::None => "CPU",
        }
    }
}
