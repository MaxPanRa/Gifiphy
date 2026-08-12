import type { ReactNode } from "react";

export function Section({
  step,
  title,
  subtitle,
  children,
  disabled,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-5 transition-opacity ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <header className="mb-4 flex items-baseline gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-edge)] text-xs font-semibold">
          {step}
        </span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        {subtitle && <p className="text-xs text-white/45">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function Chip({
  active,
  onClick,
  title,
  hint,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-24 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
          : "border-[var(--color-edge)] hover:border-white/25"
      }`}
    >
      <span className="text-sm font-medium">{title}</span>
      {hint && <span className="text-[11px] text-white/45">{hint}</span>}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] tracking-wide text-white/45 uppercase">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "danger";
  children: ReactNode;
}) {
  const palette = {
    info: "border-white/15 bg-white/5 text-white/70",
    warn: "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]",
    danger: "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${palette}`}>
      {children}
    </div>
  );
}
