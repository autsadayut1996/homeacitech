/**
 * Drafting annotations used on construction-style drawings (pure, plan coordinates):
 *  - structural grid axes 1..n (x) and A.. (y) with columns at grid intersections on walls
 *  - room tags: floor finish code · finished floor level · ceiling code · ceiling height
 *  - door / window marks D1.., W1.. grouped by type and size, with a schedule
 *  - plinth: the ground floor sits `plinthM` above the existing ground / road (±0.00)
 */
import { TOL, type Point, edges, pointAlong } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Opening, type Plan, type Room } from "./schema";
import { deriveWalls } from "./walls";

/** Default height of the ground floor above the road / existing ground. */
export const DEFAULT_PLINTH_M = 0.5;
export const plinthOf = (plan: Plan) => plan.building.plinthM ?? DEFAULT_PLINTH_M;

const MERGE = 0.3;
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I and O are skipped, as usual on drawings

function merge(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length && v - out[out.length - 1] < MERGE) continue;
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

export interface GridAxis {
  label: string;
  at: number;
}

export interface StructuralGrid {
  /** Axes at constant x, numbered 1.. left → right. */
  x: GridAxis[];
  /** Axes at constant y, lettered A.. from the front (road side, small y) backwards. */
  y: GridAxis[];
  /** Extent of the building the axes cover. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const structural = (r: Room) => !ROOM_TYPE_INFO[r.type].outdoor || r.type === "garage" || r.type === "balcony";

/** Axes on every wall / room line shared by the whole building (all levels). */
export function structuralGrid(plan: Plan): StructuralGrid {
  const pts = plan.levels.flatMap((l) => l.rooms.filter((r) => structural(r) && r.type !== "pool").flatMap((r) => r.polygon));
  const xs = merge(pts.map((p) => p[0]));
  const ys = merge(pts.map((p) => p[1]));
  return {
    x: xs.map((at, i) => ({ label: String(i + 1), at })),
    y: ys.map((at, i) => ({ label: LETTERS[i] ?? `A${i}`, at })),
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  };
}

function onSegment(p: Point, a: Point, b: Point, tol = 0.05) {
  const minX = Math.min(a[0], b[0]) - tol;
  const maxX = Math.max(a[0], b[0]) + tol;
  const minY = Math.min(a[1], b[1]) - tol;
  const maxY = Math.max(a[1], b[1]) + tol;
  if (p[0] < minX || p[0] > maxX || p[1] < minY || p[1] > maxY) return false;
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return Math.abs(cross) / Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), TOL) < tol;
}

/**
 * Columns on one level: grid intersections that lie on a wall of this level or of the level it
 * carries, plus the corners of carports and balconies (which have posts, not walls).
 */
export function columns(plan: Plan, levelIndex: number, grid = structuralGrid(plan)): Point[] {
  const here = plan.levels[levelIndex];
  const above = plan.levels[levelIndex + 1];
  const walls = [...deriveWalls(plan, here), ...(above ? deriveWalls(plan, above) : [])].filter((w) => w.kind === "exterior" || w.kind === "interior");
  const posts = here.rooms.filter((r) => r.type === "garage" || r.type === "balcony" || r.type === "terrace").flatMap((r) => r.polygon);
  const out: Point[] = [];
  for (const gx of grid.x)
    for (const gy of grid.y) {
      const p: Point = [gx.at, gy.at];
      const near = (q: Point) => Math.abs(q[0] - p[0]) < MERGE && Math.abs(q[1] - p[1]) < MERGE;
      if (walls.some((w) => onSegment(p, w.a, w.b)) || posts.some(near)) out.push(p);
    }
  return out;
}

export interface RoomTag {
  roomId: string;
  floorCode: string;
  /** Finished floor level relative to ±0.00 (road / existing ground). */
  floorLevel: number;
  ceilingCode: string | null;
  ceilingHeight: number | null;
}

/** Finish codes — F1 general, F2 wet rooms, F3 outdoor; C1 gypsum, C2 moisture-resistant, C3 exterior. */
export function roomTag(plan: Plan, level: Level, room: Room): RoomTag {
  const info = ROOM_TYPE_INFO[room.type];
  const ffl = level.elevationM + plinthOf(plan);
  const wet = room.type === "bathroom" || room.type === "laundry";
  const outdoor = info.outdoor;
  const drop = wet || outdoor ? 0.1 : 0; // wet and outdoor floors are stepped down
  const isTop = level === plan.levels[plan.levels.length - 1];
  const covered = !outdoor || room.type === "garage" || (room.type === "balcony" && !isTop);
  const ceiling = covered ? Math.max(2.2, Math.min(wet ? 2.4 : 2.8, level.floorToFloorM - 0.4)) : null;
  return {
    roomId: room.id,
    floorCode: outdoor ? "F3" : wet ? "F2" : "F1",
    floorLevel: Math.round((ffl - drop) * 100) / 100,
    ceilingCode: ceiling === null ? null : outdoor ? "C3" : wet ? "C2" : "C1",
    ceilingHeight: ceiling === null ? null : Math.round(ceiling * 100) / 100,
  };
}

export const fmtLevel = (z: number) => `${z > 0 ? "+" : z < 0 ? "−" : "±"}${Math.abs(z).toFixed(2)}`;

export interface OpeningType {
  code: string;
  kind: Opening["kind"];
  widthM: number;
  heightM: number;
  sillM: number;
  count: number;
  /** Level names (th) where this type occurs. */
  levels: string[];
}

export interface OpeningMarks {
  /** opening id → code */
  codes: Record<string, string>;
  schedule: OpeningType[];
}

const DOOR_KINDS = new Set(["door", "sliding_door"]);

/** Group doors and windows by kind and size; codes are numbered from the largest. */
export function openingMarks(plan: Plan): OpeningMarks {
  type Acc = Omit<OpeningType, "code"> & { ids: string[]; key: string };
  const groups = new Map<string, Acc>();
  for (const level of plan.levels)
    for (const o of level.openings) {
      if (o.kind === "opening") continue;
      const heightM = o.heightM ?? (o.kind === "window" ? 1.2 : 2.1);
      const sillM = o.kind === "window" ? (o.sillM ?? 0.9) : 0;
      const key = `${o.kind}|${o.widthM.toFixed(2)}|${heightM.toFixed(2)}|${sillM.toFixed(2)}`;
      const g = groups.get(key) ?? { key, kind: o.kind, widthM: o.widthM, heightM, sillM, count: 0, levels: [], ids: [] };
      g.count++;
      g.ids.push(o.id);
      if (!g.levels.includes(level.name.th)) g.levels.push(level.name.th);
      groups.set(key, g);
    }
  const codes: Record<string, string> = {};
  const schedule: OpeningType[] = [];
  for (const [prefix, test] of [
    ["D", (g: Acc) => DOOR_KINDS.has(g.kind)],
    ["W", (g: Acc) => g.kind === "window"],
  ] as const) {
    const list = [...groups.values()].filter(test).sort((a, b) => (a.kind === b.kind ? b.widthM - a.widthM || b.heightM - a.heightM : a.kind < b.kind ? 1 : -1));
    list.forEach((g, i) => {
      const code = `${prefix}${i + 1}`;
      for (const id of g.ids) codes[id] = code;
      schedule.push({ code, kind: g.kind, widthM: g.widthM, heightM: g.heightM, sillM: g.sillM, count: g.count, levels: g.levels });
    });
  }
  return { codes, schedule };
}

/** Where to print an opening's mark: just inside the host room, at the middle of the opening. */
export function openingMarkPosition(level: Level, o: Opening, inset = 0.45): Point | null {
  const room = level.rooms.find((r) => r.id === o.host.roomId);
  const e = room && edges(room.polygon)[o.host.edgeIndex];
  if (!room || !e) return null;
  const m = pointAlong(e, o.host.offsetM + o.widthM / 2);
  const dx = e[1][0] - e[0][0];
  const dy = e[1][1] - e[0][1];
  const len = Math.hypot(dx, dy) || 1;
  // try both normals, keep the one pointing into the room
  const xs = room.polygon.map((p) => p[0]);
  const ys = room.polygon.map((p) => p[1]);
  const inside = (p: Point) => p[0] > Math.min(...xs) && p[0] < Math.max(...xs) && p[1] > Math.min(...ys) && p[1] < Math.max(...ys);
  const n1: Point = [m[0] - (dy / len) * inset, m[1] + (dx / len) * inset];
  const n2: Point = [m[0] + (dy / len) * inset, m[1] - (dx / len) * inset];
  return inside(n1) ? n1 : n2;
}
