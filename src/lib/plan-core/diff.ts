import { area, bbox } from "./geometry";
import { computeMetrics, type PlanMetrics } from "./metrics";
import type { Plan, Room } from "./schema";

export interface RoomChange {
  levelId: string;
  room: Room;
  /** Present for changed rooms. */
  before?: Room;
  areaBefore: number;
  areaAfter: number;
  kind: "added" | "removed" | "resized" | "moved" | "retyped";
}

export interface PlanDiff {
  rooms: RoomChange[];
  metrics: { before: PlanMetrics; after: PlanMetrics };
  levelsBefore: number;
  levelsAfter: number;
  selections: { slot: string; before?: string; after?: string }[];
  packageBefore: Plan["specPackage"];
  packageAfter: Plan["specPackage"];
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

/** Room-level differences between two plans (rooms matched by id within the same level). */
export function diffPlans(a: Plan, b: Plan): PlanDiff {
  const rooms: RoomChange[] = [];
  const levelIds = [...new Set([...a.levels.map((l) => l.id), ...b.levels.map((l) => l.id)])];
  for (const levelId of levelIds) {
    const ra = new Map((a.levels.find((l) => l.id === levelId)?.rooms ?? []).map((r) => [r.id, r]));
    const rb = new Map((b.levels.find((l) => l.id === levelId)?.rooms ?? []).map((r) => [r.id, r]));
    for (const [id, r] of rb) {
      const before = ra.get(id);
      if (!before) {
        rooms.push({ levelId, room: r, areaBefore: 0, areaAfter: area(r.polygon), kind: "added" });
        continue;
      }
      const A = bbox(before.polygon);
      const B = bbox(r.polygon);
      const kind: RoomChange["kind"] | null =
        before.type !== r.type
          ? "retyped"
          : !near(A.width, B.width) || !near(A.height, B.height)
            ? "resized"
            : !near(A.minX, B.minX) || !near(A.minY, B.minY)
              ? "moved"
              : null;
      if (kind) rooms.push({ levelId, room: r, before, areaBefore: area(before.polygon), areaAfter: area(r.polygon), kind });
    }
    for (const [id, r] of ra) if (!rb.has(id)) rooms.push({ levelId, room: r, areaBefore: area(r.polygon), areaAfter: 0, kind: "removed" });
  }
  const slots = [...new Set([...Object.keys(a.selections), ...Object.keys(b.selections)])];
  return {
    rooms,
    metrics: { before: computeMetrics(a), after: computeMetrics(b) },
    levelsBefore: a.levels.length,
    levelsAfter: b.levels.length,
    selections: slots.filter((s) => a.selections[s] !== b.selections[s]).map((slot) => ({ slot, before: a.selections[slot], after: b.selections[slot] })),
    packageBefore: a.specPackage,
    packageAfter: b.specPackage,
  };
}
