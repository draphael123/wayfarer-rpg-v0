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

export function exportTelemetry(): string {
  return JSON.stringify({ exported: Date.now(), events: read() }, null, 2);
}

export function telemetrySummary(): string {
  const events = read();
  const battles = events.filter((e) => e.type === "battle_end");
  const wins = battles.filter((e) => e.result === "victory").length;
  return `${events.length} events · ${battles.length} battles · ${wins} wins`;
}
