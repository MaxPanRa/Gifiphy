import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { Chip, Field, Notice, Section, Stat } from "./components/ui";
import { ASPECT_PRESETS, defaultSize, suggestedSizes } from "./lib/aspect";
import { errorText } from "./lib/errors";
import { formatBytes, formatRange } from "./lib/estimate";
import { fmtNum, useLang, useT } from "./lib/i18n";
import {
  cancelJob,
  createGif,
  createSuggestedGif,
  estimatePrecise,
  newJobId,
  onProgress,
  probeVideo,
} from "./lib/ipc";
import {
  SMOOTHNESS_PRESETS,
  SPEED_PRESETS,
  delayCsToFps,
  frameCount,
  inspectSettings,
  outputDurationSec,
} from "./lib/speed";
import { MAX_BYTES } from "./lib/types";
import { useJob } from "./store/job";

const VIDEO_EXTS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv", "mpg", "mpeg"];

/** Tres niveles, no dos: "puede que se pase" y "se pasa seguro" merecen
 *  mensajes distintos, porque llevan a decisiones distintas. */
type Risk = "ok" | "risky" | "over";

export default function App() {
  const {
    meta,
    aspectId,
    settings,
    estimate,
    probed,
    progress,
    result,
    error,
    busy,
    setMeta,
    setAspect,
    patch,
    setTrim,
    setProgress,
    setResult,
    setError,
    setBusy,
    setProbed,
    reset,
  } = useJob();

  const t = useT();
  const { lang, setLang } = useLang();
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    const un = onProgress((p) => setProgress(p));
    return () => {
      void un.then((f) => f());
    };
  }, [setProgress]);

  const sizes = useMemo(() => {
    if (!meta) return [];
    const preset = ASPECT_PRESETS.find((a) => a.id === aspectId);
    return suggestedSizes(meta, preset?.ratio ?? null);
  }, [meta, aspectId]);

  const warnings = useMemo(
    () => (meta ? inspectSettings(meta, settings) : []),
    [meta, settings],
  );

  const shown = probed ?? estimate;

  const risk: Risk = useMemo(() => {
    if (!shown) return "ok";
    if (shown.expectedBytes > MAX_BYTES) return "over";
    if (shown.highBytes > MAX_BYTES) return "risky";
    return "ok";
  }, [shown]);

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTS }],
    });
    if (typeof path !== "string") return;

    setError(null);
    setBusy(true);
    try {
      setMeta(await probeVideo(path));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function runProbe() {
    if (!meta) return;
    const id = newJobId();
    setJobId(id);
    setBusy(true);
    setError(null);
    try {
      setProbed(await estimatePrecise(meta, settings, id));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
      setJobId(null);
      setProgress(null);
    }
  }

  async function generate(suggested: boolean) {
    if (!meta) return;
    const target = await save({
      defaultPath: "output.gif",
      filters: [{ name: "GIF", extensions: ["gif"] }],
    });
    if (!target) return;

    const id = newJobId();
    setJobId(id);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fn = suggested ? createSuggestedGif : createGif;
      setResult(await fn(meta, settings, target, id));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
      setJobId(null);
      setProgress(null);
    }
  }

  const progressText = progress
    ? progress.messageCode
      ? t(`msg.${progress.messageCode}`, progress.messageParams ?? undefined)
      : t(`stage.${progress.stage}`)
    : "";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-edge)] px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">Gifiphy</h1>
          <span className="text-xs text-white/40">{t("app.subtitle")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            className="rounded-md border border-[var(--color-edge)] px-3 py-1 text-xs hover:border-white/30"
            title={lang === "es" ? "Switch to English" : "Cambiar a español"}
          >
            {t("app.lang")}
          </button>
          {meta && (
            <button
              onClick={reset}
              className="rounded-md border border-[var(--color-edge)] px-3 py-1 text-xs hover:border-white/30"
            >
              {t("app.reset")}
            </button>
          )}
        </div>
      </header>

      <main className="grid flex-1 grid-cols-[1fr_360px] gap-5 overflow-hidden p-5">
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {/* 1 — Origen */}
          <Section step={1} title={t("step1.title")} subtitle={t("step1.subtitle")}>
            {!meta ? (
              <button
                onClick={pickFile}
                disabled={busy}
                className="w-full rounded-lg border border-dashed border-[var(--color-edge)] py-10 text-sm text-white/60 hover:border-[var(--color-accent)]/60 hover:text-white disabled:opacity-40"
              >
                {busy ? t("step1.analyzing") : t("step1.pick")}
              </button>
            ) : (
              <div className="flex flex-wrap gap-6">
                <Stat label={t("stat.resolution")} value={`${meta.width} × ${meta.height}`} />
                <Stat
                  label={t("stat.duration")}
                  value={`${fmtNum(lang, meta.durationSec, 1)} s`}
                />
                <Stat label={t("stat.fps")} value={fmtNum(lang, meta.fps, 2)} />
                <Stat label={t("stat.codec")} value={meta.codec} />
                <Stat
                  label={t("stat.motion")}
                  value={`${Math.round(meta.motionIndex * 100)} %`}
                />
                {meta.rotationApplied !== 0 && (
                  <Stat label={t("stat.rotation")} value={`${meta.rotationApplied}°`} />
                )}
              </div>
            )}
          </Section>

          {/* 2 — Proporción y tamaño */}
          <Section
            step={2}
            title={t("step2.title")}
            subtitle={t("step2.subtitle")}
            disabled={!meta}
          >
            <div className="mb-4 flex flex-wrap gap-2">
              {ASPECT_PRESETS.map((a) => (
                <Chip
                  key={a.id}
                  active={aspectId === a.id}
                  title={a.labelKey ? t(a.labelKey) : a.label}
                  hint={t(a.hintKey)}
                  onClick={() => {
                    if (!meta) return;
                    const pick = defaultSize(suggestedSizes(meta, a.ratio));
                    if (pick) setAspect(a.id, pick.width, pick.height);
                  }}
                />
              ))}
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {sizes.map((s) => (
                <Chip
                  key={s.label}
                  active={settings.width === s.width && settings.height === s.height}
                  title={s.label}
                  hint={t(s.weightKey)}
                  onClick={() => patch({ width: s.width, height: s.height })}
                />
              ))}
            </div>

            {aspectId !== "native" && (
              <Field label={t("step2.fitLabel")}>
                <div className="flex gap-2">
                  <Chip
                    active={settings.fitMode === "crop"}
                    title={t("fit.crop")}
                    hint={t("fit.cropHint")}
                    onClick={() => patch({ fitMode: "crop" })}
                  />
                  <Chip
                    active={settings.fitMode === "pad"}
                    title={t("fit.pad")}
                    hint={t("fit.padHint")}
                    onClick={() => patch({ fitMode: "pad" })}
                  />
                </div>
              </Field>
            )}
          </Section>

          {/* 3 — Velocidad y fluidez */}
          <Section
            step={3}
            title={t("step3.title")}
            subtitle={t("step3.subtitle")}
            disabled={!meta}
          >
            <div className="mb-4 flex flex-wrap gap-2">
              {SPEED_PRESETS.map((s) => (
                <Chip
                  key={s.id}
                  active={settings.speed === s.factor}
                  title={t(s.labelKey)}
                  hint={t(s.hintKey)}
                  onClick={() => patch({ speed: s.factor })}
                />
              ))}
            </div>

            <Field label={t("step3.smoothness")}>
              <div className="flex flex-wrap gap-2">
                {SMOOTHNESS_PRESETS.map((s) => (
                  <Chip
                    key={s.delayCs}
                    active={settings.delayCs === s.delayCs}
                    title={`${fmtNum(lang, s.fps, Number.isInteger(s.fps) ? 0 : 1)} fps`}
                    hint={t(s.hintKey)}
                    onClick={() => patch({ delayCs: s.delayCs })}
                  />
                ))}
              </div>
            </Field>

            {meta && (
              <p className="mt-3 text-xs text-white/45">
                {t("step3.summary", {
                  duration: outputDurationSec(meta, settings),
                  frames: frameCount(meta, settings),
                  fps: delayCsToFps(settings.delayCs),
                })}
              </p>
            )}
          </Section>

          {/* 4 — Recorte temporal */}
          <Section
            step={4}
            title={t("step4.title")}
            subtitle={t("step4.subtitle")}
            disabled={!meta}
          >
            {meta && (
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label={t("trim.start", {
                    value: fmtNum(lang, settings.trim?.startSec ?? 0, 1),
                  })}
                >
                  <input
                    type="range"
                    min={0}
                    max={meta.durationSec}
                    step={0.1}
                    value={settings.trim?.startSec ?? 0}
                    onChange={(e) => {
                      const start = Number(e.target.value);
                      const end = settings.trim?.endSec ?? meta.durationSec;
                      setTrim({ startSec: Math.min(start, end - 0.2), endSec: end });
                    }}
                  />
                </Field>
                <Field
                  label={t("trim.end", {
                    value: fmtNum(lang, settings.trim?.endSec ?? meta.durationSec, 1),
                  })}
                >
                  <input
                    type="range"
                    min={0}
                    max={meta.durationSec}
                    step={0.1}
                    value={settings.trim?.endSec ?? meta.durationSec}
                    onChange={(e) => {
                      const end = Number(e.target.value);
                      const start = settings.trim?.startSec ?? 0;
                      setTrim({ startSec: start, endSec: Math.max(end, start + 0.2) });
                    }}
                  />
                </Field>
              </div>
            )}
          </Section>
        </div>

        {/* Panel lateral: estimación, avisos y acciones */}
        <aside className="flex flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-5">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{t("side.title")}</h2>

          {!meta && <p className="text-xs text-white/40">{t("side.noVideo")}</p>}

          {meta && shown && (
            <>
              <div className="rounded-lg border border-[var(--color-edge)] p-3">
                <p className="text-[11px] text-white/40">
                  {t("side.estimatedLabel", {
                    kind:
                      shown.source === "probe"
                        ? t("side.kindMeasured")
                        : t("side.kindApprox"),
                  })}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatRange(shown, lang)}
                </p>
                <p className="mt-1 text-[11px] text-white/40">
                  {t("side.framesLimit", { frames: shown.frameCount })}
                </p>
              </div>

              {shown.source === "heuristic" && (
                <button
                  onClick={runProbe}
                  disabled={busy}
                  className="rounded-lg border border-[var(--color-edge)] px-3 py-2 text-xs hover:border-white/30 disabled:opacity-40"
                >
                  {t("side.probe")}
                </button>
              )}
            </>
          )}

          {warnings.map((w) => (
            <Notice key={w.kind} tone={w.severity === "warn" ? "warn" : "info"}>
              {t(w.key, w.params)}
            </Notice>
          ))}

          {/* El aviso de tamaño va inmediatamente encima del botón de crear */}
          {risk === "over" && shown && (
            <Notice tone="danger">
              {t("risk.over", { size: formatBytes(shown.expectedBytes, lang) })}
            </Notice>
          )}
          {risk === "risky" && <Notice tone="warn">{t("risk.risky")}</Notice>}

          <div className="mt-auto flex flex-col gap-2 pt-3">
            {busy && progress && (
              <div className="rounded-lg border border-[var(--color-edge)] p-3">
                <div className="mb-2 flex justify-between text-[11px] text-white/50">
                  <span>{progressText}</span>
                  <span className="tabular-nums">
                    {Math.round(progress.fraction * 100)} %
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-[width]"
                    style={{ width: `${progress.fraction * 100}%` }}
                  />
                </div>
              </div>
            )}

            {busy && jobId ? (
              <button
                onClick={() => void cancelJob(jobId)}
                className="rounded-lg border border-[var(--color-danger)]/50 px-4 py-2.5 text-sm text-[var(--color-danger)]"
              >
                {t("btn.cancel")}
              </button>
            ) : (
              <>
                <button
                  onClick={() => void generate(false)}
                  disabled={!meta}
                  className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 disabled:opacity-30"
                >
                  {t("btn.create")}
                </button>

                {risk !== "ok" && (
                  <button
                    onClick={() => void generate(true)}
                    disabled={!meta}
                    className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:brightness-110 disabled:opacity-30"
                  >
                    {t("btn.createSuggested")}
                  </button>
                )}
              </>
            )}
          </div>

          {error && <Notice tone="danger">{error}</Notice>}

          {result && (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-edge)] p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{formatBytes(result.bytes, lang)}</span>
                <span className="text-[11px] text-white/40">
                  {fmtNum(lang, result.elapsedMs / 1000, 1)} s
                </span>
              </div>
              {result.adjustments.map((a) => (
                <p key={a.kind} className="text-[11px] text-white/50">
                  {t(`adj.${a.kind}`, { from: a.from, to: a.to })}
                </p>
              ))}
              <img
                src={convertFileSrc(result.outputPath)}
                alt="GIF preview"
                className="rounded border border-[var(--color-edge)]"
              />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
