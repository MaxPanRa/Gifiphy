import type { TParams } from "./i18n";
import type { ErrorPayload } from "./types";

/**
 * Convierte lo que rechaza `invoke()` en texto para el usuario.
 *
 * Rust manda `{ code, params, detail }`. El `detail` es salida cruda de FFmpeg
 * o gifsicle: se muestra entre paréntesis y sin traducir, porque traducir un
 * mensaje de error de una herramienta lo vuelve imposible de buscar.
 */
export function errorText(
  t: (key: string, params?: TParams) => string,
  e: unknown,
): string {
  if (e && typeof e === "object" && "code" in e) {
    const p = e as ErrorPayload;
    const base = t(`err.${p.code}`, p.params ?? undefined);
    return p.detail ? `${base} (${p.detail})` : base;
  }
  // Un rechazo que no sigue el contrato: mostrarlo tal cual es más útil que
  // esconderlo detrás de un mensaje genérico.
  const raw = String(e);
  return raw && raw !== "[object Object]" ? raw : t("err.unknown");
}
