/**
 * Local playtest telemetry: a small ring buffer of gameplay events kept in
 * localStorage. Nothing leaves the device — export is a manual button.
 */

const KEY = "wayband-telemetry-v1";
const CAP = 600;

interface TelemetryEvent {
  t: number;
  type: string;
  [key: string]: unknown;
}

export interface RuntimeErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

const MAX_ERROR_TEXT = 4000;

function clipped(value: string): string {
  return value.length > MAX_ERROR_TEXT ? `${value.slice(0, MAX_ERROR_TEXT)}...` : value;
}

/** Turn thrown values (including circular rejection reasons) into safe report text. */
export function runtimeErrorDetails(reason: unknown): RuntimeErrorDetails {
  if (reason instanceof Error) {
    return {
      name: clipped(reason.name || "Error"),
      message: clipped(reason.message || "Unknown error"),
      ...(reason.stack ? { stack: clipped(reason.stack) } : {}),
    };
  }
  if (typeof reason === "string") return { name: "Error", message: clipped(reason) };
  try {
    const json = JSON.stringify(reason);
    return { name: "ThrownValue", message: clipped(json ?? String(reason)) };
  } catch {
    return { name: "ThrownValue", message: clipped(String(reason)) };
  }
}

function read(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function logEvent(type: string, data: Record<string, unknown> = {}): void {
  try {
    const list = read();
    list.push({ t: Date.now(), type, ...data });
    while (list.length > CAP) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — telemetry is best-effort
  }
}

/** Record a locally-generated incident and return its short report id. */
export function logRuntimeError(
  source: string,
  reason: unknown,
  context: Record<string, unknown> = {},
): string {
  const incident = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  logEvent("runtime_error", {
    incident,
    source,
    ...runtimeErrorDetails(reason),
    context,
  });
  return incident;
}

export function exportTelemetry(context: Record<string, unknown> = {}): string {
  const browser = typeof navigator === "undefined"
    ? undefined
    : { userAgent: navigator.userAgent, language: navigator.language };
  const page = typeof location === "undefined"
    ? undefined
    : { url: location.href, viewport: `${window.innerWidth}x${window.innerHeight}`, pixelRatio: window.devicePixelRatio };
  return JSON.stringify({ exported: Date.now(), game: "Wayband", browser, page, context, events: read() }, null, 2);
}

export function telemetrySummary(): string {
  const events = read();
  const battles = events.filter((e) => e.type === "battle_end");
  const wins = battles.filter((e) => e.result === "victory").length;
  return `${events.length} events · ${battles.length} battles · ${wins} wins`;
}
