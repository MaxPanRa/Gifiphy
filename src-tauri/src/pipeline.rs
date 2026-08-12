use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::{AppError, Result};
use crate::ffmpeg::{self, HwAccel};
use crate::types::{FitMode, GifSettings, VideoMeta};

/// Construye la cadena de filtros que va del frame fuente al lienzo destino.
///
/// El orden no es arbitrario y es donde se gana o se pierde el rendimiento:
///
///   1. `setpts` + `fps`  -> descarta frames ANTES de escalar. Acelerar 2x
///      significa escalar la mitad de frames, no escalarlos todos y tirar la
///      mitad despues.
///   2. tone mapping HDR  -> solo si hace falta; es el filtro mas caro.
///   3. `scale`/`crop`/`pad` -> ultimo, sobre el minimo de frames posible.
pub fn build_filter_chain(meta: &VideoMeta, s: &GifSettings) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Normalizar PTS antes de reescalarlo: con `-ss` de entrada el primer
    // frame no arranca necesariamente en 0.
    if (s.speed - 1.0).abs() > f64::EPSILON {
        parts.push(format!("setpts=(PTS-STARTPTS)/{:.6}", s.speed));
    } else {
        parts.push("setpts=PTS-STARTPTS".into());
    }

    // `fps` hace decimacion por frame mas cercano (drop/dup), que es
    // exactamente lo pedido: al acelerar se saltean frames, sin blending.
    // Nada de `minterpolate` aca: es ~50x mas lento y no lo queremos.
    parts.push(format!("fps={:.6}", s.fps()));

    if meta.is_hdr {
        // zscale + tonemap via zimg. Sin esto un HDR sale lavado y gris.
        // libplacebo (Vulkan) seria mas rapido pero exige inicializar un
        // dispositivo y falla de formas dificiles de diagnosticar.
        parts.push(
            "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,\
             tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv"
                .into(),
        );
    }

    // Fuentes anamorficas: corregir SAR antes de medir el encaje.
    if (meta.sample_aspect_ratio - 1.0).abs() > 0.01 {
        parts.push("scale=iw*sar:ih,setsar=1".into());
    }

    let (w, h) = (s.width, s.height);
    let source_ar = (meta.width as f64 * meta.sample_aspect_ratio) / meta.height as f64;
    let target_ar = w as f64 / h as f64;

    if (source_ar - target_ar).abs() < 0.01 {
        parts.push(format!("scale={w}:{h}:flags=lanczos"));
    } else {
        match s.fit_mode {
            FitMode::Crop => {
                parts.push(format!(
                    "scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos"
                ));
                parts.push(format!("crop={w}:{h}"));
            }
            FitMode::Pad => {
                parts.push(format!(
                    "scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos"
                ));
                parts.push(format!("pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black"));
            }
        }
    }

    parts.join(",")
}

/// Argumentos de recorte temporal. `-ss` antes de `-i` usa seek por keyframe,
/// que es ordenes de magnitud mas rapido que filtrar despues de decodificar.
fn trim_args(s: &GifSettings) -> Vec<String> {
    match s.trim {
        Some(t) => vec![
            "-ss".into(),
            format!("{:.3}", t.start_sec),
            "-t".into(),
            format!("{:.3}", (t.end_sec - t.start_sec).max(0.0)),
        ],
        None => Vec::new(),
    }
}

pub struct Encoder {
    ffmpeg: PathBuf,
    gifsicle: Option<PathBuf>,
    hwaccel: HwAccel,
    cancel: Arc<AtomicBool>,
}

impl Encoder {
    pub fn new(meta: &VideoMeta, cancel: Arc<AtomicBool>) -> Result<Self> {
        let ffmpeg_path = ffmpeg::locate("ffmpeg")?;
        // gifsicle es opcional: sin el se pierde la optimizacion final y el
        // `--lossy`, pero el GIF igual sale. Degradar es mejor que abortar.
        let gifsicle = ffmpeg::locate("gifsicle").ok();
        let hwaccel = detect_hwaccel(&ffmpeg_path, meta);

        Ok(Self {
            ffmpeg: ffmpeg_path,
            gifsicle,
            hwaccel,
            cancel,
        })
    }

    pub fn hwaccel(&self) -> HwAccel {
        self.hwaccel
    }

    pub fn has_gifsicle(&self) -> bool {
        self.gifsicle.is_some()
    }

    fn check_cancel(&self) -> Result<()> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }
        Ok(())
    }

    /// Paso 1: genera la paleta optima para el clip.
    ///
    /// `stats_mode=diff` pondera las zonas que cambian entre frames en vez de
    /// promediar todo el video: evita gastar entradas de paleta en un fondo
    /// estatico que nadie mira.
    fn build_palette(&self, meta: &VideoMeta, s: &GifSettings, palette: &Path) -> Result<()> {
        self.check_cancel()?;

        let chain = build_filter_chain(meta, s);
        let vf = format!(
            "{chain},palettegen=max_colors={}:stats_mode=diff",
            s.palette_colors.clamp(2, 256)
        );

        let mut cmd = ffmpeg::command(&self.ffmpeg);
        cmd.args(["-hide_banner", "-v", "error", "-nostdin"]);
        cmd.args(self.hwaccel.args());
        cmd.args(trim_args(s));
        cmd.args(["-i", &meta.path]);
        cmd.args(["-vf", &vf]);
        cmd.args(["-y", &palette.to_string_lossy()]);

        ffmpeg::run(cmd, "ffmpeg")?;
        Ok(())
    }

    /// Paso 2: aplica la paleta y emite el GIF.
    ///
    /// `diff_mode=rectangle` limita cada frame al rectangulo que cambio, que
    /// es la optimizacion mas rentable del formato. El dither Bayer se elige
    /// sobre Floyd-Steinberg a proposito: su patron es regular y por lo tanto
    /// comprime mucho mejor con LZW.
    fn render_gif<F>(
        &self,
        meta: &VideoMeta,
        s: &GifSettings,
        palette: &Path,
        out: &Path,
        mut on_frame: F,
    ) -> Result<()>
    where
        F: FnMut(u32),
    {
        self.check_cancel()?;

        let chain = build_filter_chain(meta, s);
        let dither = if s.dither {
            "bayer:bayer_scale=5"
        } else {
            "none"
        };
        let lavfi = format!(
            "{chain}[v];[v][1:v]paletteuse=dither={dither}:diff_mode=rectangle"
        );

        let mut cmd = ffmpeg::command(&self.ffmpeg);
        cmd.args(["-hide_banner", "-v", "error", "-nostdin"]);
        cmd.args(self.hwaccel.args());
        cmd.args(trim_args(s));
        cmd.args(["-i", &meta.path]);
        cmd.args(["-i", &palette.to_string_lossy()]);
        cmd.args(["-lavfi", &lavfi]);
        cmd.args(["-loop", "0", "-f", "gif"]);
        // `-progress pipe:1` da eventos parseables; `-nostats` calla el
        // formato humano que es un infierno de parsear.
        cmd.args(["-progress", "pipe:1", "-nostats"]);
        cmd.args(["-y", &out.to_string_lossy()]);

        let mut child = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .spawn()
            .map_err(|e| AppError::Io(format!("no se pudo ejecutar ffmpeg: {e}")))?;

        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(std::result::Result::ok) {
                if self.cancel.load(Ordering::Relaxed) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::Cancelled);
                }
                if let Some(v) = line.strip_prefix("frame=") {
                    if let Ok(n) = v.trim().parse::<u32>() {
                        on_frame(n);
                    }
                }
            }
        }

        let status = child.wait().map_err(|e| AppError::Io(e.to_string()))?;
        if !status.success() {
            let mut err = String::new();
            if let Some(mut stderr) = child.stderr.take() {
                use std::io::Read;
                let _ = stderr.read_to_string(&mut err);
            }
            let tail: Vec<&str> = err.lines().rev().take(5).collect();
            return Err(AppError::Ffmpeg(
                tail.into_iter().rev().collect::<Vec<_>>().join(" | "),
            ));
        }
        Ok(())
    }

    /// Paso 3: optimizacion final. `-O3` recomprime deltas entre frames (aca
    /// es donde los frames duplicados de "mas lento" se vuelven casi gratis)
    /// y `--lossy` permite bajar peso sin tocar resolucion ni frames.
    fn optimize(&self, input: &Path, output: &Path, lossy: u32) -> Result<()> {
        self.check_cancel()?;

        let Some(gifsicle) = &self.gifsicle else {
            std::fs::copy(input, output)?;
            return Ok(());
        };

        let mut cmd = ffmpeg::command(gifsicle);
        cmd.arg("-O3").arg("--no-warnings");
        if lossy > 0 {
            cmd.arg(format!("--lossy={lossy}"));
        }
        cmd.arg(input.as_os_str());
        cmd.arg("-o").arg(output.as_os_str());

        match ffmpeg::run(cmd, "gifsicle") {
            Ok(_) => Ok(()),
            // Si gifsicle falla preferimos entregar el GIF sin optimizar
            // antes que perder todo el trabajo de encoding.
            Err(_) => {
                std::fs::copy(input, output)?;
                Ok(())
            }
        }
    }

    /// Corre las tres etapas y devuelve el tamano REAL medido en disco.
    pub fn encode<F>(
        &self,
        meta: &VideoMeta,
        s: &GifSettings,
        out: &Path,
        mut progress: F,
    ) -> Result<u64>
    where
        F: FnMut(&'static str, f64),
    {
        let tmp = tempfile::tempdir()?;
        let palette = tmp.path().join("palette.png");
        let raw = tmp.path().join("raw.gif");

        progress("encoding", 0.0);
        self.build_palette(meta, s, &palette)?;
        progress("encoding", 0.15);

        let total = s.frame_count(meta).max(1) as f64;
        self.render_gif(meta, s, &palette, &raw, |n| {
            progress("encoding", 0.15 + 0.70 * (n as f64 / total).min(1.0));
        })?;

        progress("optimizing", 0.90);
        self.optimize(&raw, out, s.lossy)?;

        progress("verifying", 0.99);
        Ok(std::fs::metadata(out)?.len())
    }
}

/// Elige la aceleracion decodificando un unico frame con cada opcion.
///
/// Cuesta ~200 ms y evita descubrir a mitad de un encode largo que NVDEC no
/// soporta el codec (VP9 o AV1 en GPUs viejas es el caso tipico).
fn detect_hwaccel(ffmpeg_path: &PathBuf, meta: &VideoMeta) -> HwAccel {
    for hw in HwAccel::fallback_chain() {
        if *hw == HwAccel::None {
            return HwAccel::None;
        }
        let mut cmd = ffmpeg::command(ffmpeg_path);
        cmd.args(["-hide_banner", "-v", "error", "-nostdin"]);
        cmd.args(hw.args());
        cmd.args(["-i", &meta.path]);
        cmd.args(["-frames:v", "1", "-f", "null", "-"]);

        let ok = cmd
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .status()
            .map(|st| st.success())
            .unwrap_or(false);

        if ok {
            return *hw;
        }
    }
    HwAccel::None
}
