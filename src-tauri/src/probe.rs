use serde_json::Value;

use crate::error::{AppError, Result};
use crate::ffmpeg;
use crate::types::VideoMeta;

/// Parsea racionales de ffprobe: "30000/1001", "16:9", "1".
fn parse_ratio(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() || s == "N/A" || s == "0/0" {
        return None;
    }
    let sep = if s.contains('/') { '/' } else { ':' };
    match s.split_once(sep) {
        Some((n, d)) => {
            let n: f64 = n.trim().parse().ok()?;
            let d: f64 = d.trim().parse().ok()?;
            if d == 0.0 {
                None
            } else {
                Some(n / d)
            }
        }
        None => s.parse().ok(),
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(|x| x.as_str())
}

/// La rotacion puede venir como side data "Display Matrix" (moderno) o como
/// tag `rotate` (contenedores viejos). Ignorarla es como sale acostado el
/// video vertical grabado con un telefono.
fn rotation_of(stream: &Value) -> i32 {
    if let Some(list) = stream.get("side_data_list").and_then(|x| x.as_array()) {
        for sd in list {
            if let Some(r) = sd.get("rotation").and_then(|x| x.as_f64()) {
                // El display matrix reporta la rotacion inversa a la de tags.
                return ((-r).round() as i32).rem_euclid(360);
            }
        }
    }
    if let Some(tag) = stream
        .get("tags")
        .and_then(|t| t.get("rotate"))
        .and_then(|x| x.as_str())
    {
        if let Ok(r) = tag.trim().parse::<f64>() {
            return (r.round() as i32).rem_euclid(360);
        }
    }
    0
}

fn is_hdr(stream: &Value) -> bool {
    let transfer = str_of(stream, "color_transfer").unwrap_or_default();
    let primaries = str_of(stream, "color_primaries").unwrap_or_default();
    matches!(transfer, "smpte2084" | "arib-std-b67") || primaries == "bt2020"
}

pub fn probe(path: &str) -> Result<VideoMeta> {
    let ffprobe = ffmpeg::locate("ffprobe")?;

    let mut cmd = ffmpeg::command(&ffprobe);
    cmd.args([
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]);
    let out = ffmpeg::run(cmd, "ffprobe")?;

    let json: Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Probe(format!("respuesta de ffprobe ilegible: {e}")))?;

    let stream = json
        .get("streams")
        .and_then(|s| s.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|s| str_of(s, "codec_type") == Some("video"))
        })
        .ok_or(AppError::NoVideoStream)?;

    let raw_w = stream.get("width").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let raw_h = stream.get("height").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    if raw_w == 0 || raw_h == 0 {
        return Err(AppError::NoVideoStream);
    }

    let rotation = rotation_of(stream);
    // Con 90/270 los lados se intercambian de cara al usuario.
    let (width, height) = if rotation == 90 || rotation == 270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };

    let avg_fps = str_of(stream, "avg_frame_rate")
        .and_then(parse_ratio)
        .filter(|f| *f > 0.0);
    let r_fps = str_of(stream, "r_frame_rate")
        .and_then(parse_ratio)
        .filter(|f| *f > 0.0);
    let fps = avg_fps.or(r_fps).unwrap_or(30.0);

    // Si el frame rate nominal y el promedio difieren de forma apreciable, la
    // fuente es VFR (tipico de grabaciones de pantalla y de movil).
    let variable_frame_rate = match (avg_fps, r_fps) {
        (Some(a), Some(r)) => (a - r).abs() / r.max(0.001) > 0.02,
        _ => false,
    };

    let duration_sec = str_of(stream, "duration")
        .and_then(|d| d.parse::<f64>().ok())
        .or_else(|| {
            json.get("format")
                .and_then(|f| str_of(f, "duration"))
                .and_then(|d| d.parse::<f64>().ok())
        })
        .filter(|d| *d > 0.0)
        .ok_or_else(|| AppError::Probe("el archivo no declara duracion".into()))?;

    let sar = str_of(stream, "sample_aspect_ratio")
        .and_then(parse_ratio)
        .filter(|v| *v > 0.0)
        .unwrap_or(1.0);

    let codec = str_of(stream, "codec_name").unwrap_or("desconocido").to_string();

    let motion_index = motion_index(path, &ffprobe, raw_w, raw_h).unwrap_or(0.5);

    Ok(VideoMeta {
        path: path.to_string(),
        width,
        height,
        duration_sec,
        fps,
        variable_frame_rate,
        rotation_applied: rotation,
        sample_aspect_ratio: sar,
        codec,
        is_hdr: is_hdr(stream),
        motion_index,
    })
}

/// Estima cuanto "se mueve" el video muestreando tamanos de paquete en tres
/// puntos del clip.
///
/// La intuicion: el encoder de origen ya hizo el trabajo de medir redundancia
/// temporal. Un screencast estatico produce paquetes chicos; un plano con
/// camara en mano produce paquetes grandes. Normalizando por pixel obtenemos
/// un proxy barato (~100 ms) del coste que tendra en GIF.
///
/// Limitacion conocida: depende del bitrate del origen, asi que un video
/// sobre-comprimido se lee como mas estatico de lo que es. Por eso alimenta
/// solo la estimacion instantanea; la decision final la toma la sonda real.
fn motion_index(path: &str, ffprobe: &std::path::PathBuf, w: u32, h: u32) -> Option<f64> {
    let mut cmd = ffmpeg::command(ffprobe);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=size",
        "-of",
        "csv=p=0",
        // Tres ventanas de 120 paquetes repartidas evita sesgarse por una
        // intro negra o unos creditos finales.
        "-read_intervals",
        "15%+#120,50%+#120,80%+#120",
        path,
    ]);

    let out = ffmpeg::run(cmd, "ffprobe").ok()?;
    let text = String::from_utf8_lossy(&out.stdout);

    let sizes: Vec<f64> = text
        .lines()
        .filter_map(|l| l.trim().trim_end_matches(',').parse::<f64>().ok())
        .filter(|v| *v > 0.0)
        .collect();

    if sizes.len() < 8 {
        return None;
    }

    let mean = sizes.iter().sum::<f64>() / sizes.len() as f64;
    let bpp = mean / (w as f64 * h as f64);

    // Mapeo logaritmico: 0,003 B/px equivale a contenido plano, 0,08 a
    // movimiento pleno. Fuera de ese rango se satura.
    const FLAT: f64 = 0.003;
    const BUSY: f64 = 0.08;
    let t = (bpp.max(1e-6).log10() - FLAT.log10()) / (BUSY.log10() - FLAT.log10());
    Some(t.clamp(0.0, 1.0))
}
