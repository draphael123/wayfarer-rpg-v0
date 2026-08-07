import { exportTelemetry, logRuntimeError, runtimeErrorDetails } from "../src/telemetry";
import { defaultSave, loadSave } from "../src/save";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Recovery check failed: ${message}`);
}

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
});

const ordinary = runtimeErrorDetails(new TypeError("storm coast frame"));
assert(ordinary.name === "TypeError", "Error names should survive serialization");
assert(ordinary.message === "storm coast frame", "Error messages should survive serialization");

const circular: { label: string; self?: unknown } = { label: "circular rejection" };
circular.self = circular;
const unusual = runtimeErrorDetails(circular);
assert(unusual.name === "ThrownValue", "non-Error rejections should receive a useful type");
assert(unusual.message.length > 0, "circular rejection reasons should still produce report text");

const incident = logRuntimeError("animation_frame", new Error("test fault"), { stage: 12, wave: 2 });
const report = JSON.parse(exportTelemetry({ incident })) as {
  context: { incident: string };
  events: Array<{ type: string; incident?: string; message?: string; context?: { stage?: number } }>;
};
const event = report.events.find((item) => item.type === "runtime_error");
assert(report.context.incident === incident, "the active incident should be included in the export");
assert(event?.incident === incident, "the logged error and exported report should share an id");
assert(event?.message === "test fault", "the exported report should contain the error message");
assert(event?.context?.stage === 12, "the exported report should contain battle context");

const malformedPreferences = {
  ...defaultSave(),
  aimMode: "warp",
  telegraphAssist: "forever",
  enemyHealthBars: "sometimes",
  autoBattle: 1,
  tutorialHints: null,
  completedTutorials: ["basics", "basics", 42, "x".repeat(65)],
};
values.set("wayband-save-v1", JSON.stringify(malformedPreferences));
const repaired = loadSave();
assert(repaired.aimMode === "slow", "invalid aiming behavior should return to the safe default");
assert(repaired.telegraphAssist === "standard", "invalid warning timing should return to the safe default");
assert(repaired.enemyHealthBars === true, "invalid health-bar preferences should be repaired");
assert(repaired.autoBattle === false, "invalid auto-battle preferences should be repaired");
assert(repaired.tutorialHints === true, "invalid tutorial preferences should be repaired");
assert(repaired.completedTutorials.length === 1 && repaired.completedTutorials[0] === "basics", "lesson completion should be deduplicated and bounded");

const preSpecialization = defaultSave() as ReturnType<typeof defaultSave> & { heroes: Array<Record<string, unknown>> };
delete preSpecialization.heroes[0].specializationLevels;
delete preSpecialization.heroes[0].masteredSpecializations;
values.set("wayband-save-v1", JSON.stringify(preSpecialization));
const specializationMigrated = loadSave();
assert(!!specializationMigrated.heroes[0].specializationLevels, "older heroes should gain specialization progress safely");
assert(Array.isArray(specializationMigrated.heroes[0].masteredSpecializations), "older heroes should gain a mastered-specialization ledger");

console.log("Recovery diagnostics: OK");
