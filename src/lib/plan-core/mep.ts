/**
 * Preliminary electrical and sanitary layouts (ผังไฟฟ้า / ผังสุขาภิบาล), generated from room types.
 *
 * This is a SALES-DRAFT schematic so the drawing set is complete — a licensed electrical /
 * sanitary engineer must design the real systems. Rules of thumb used:
 * - lights ≈ 1 per 12 m² on a grid; one switch inside the room next to its first door;
 *   sockets by room type spread along the walls away from doors; one AC unit in living spaces
 *   and bedrooms on the longest (preferably exterior) wall; a water heater in every bathroom;
 *   the consumer unit by the main entrance, the meter at the front boundary.
 * - each bathroom gets WC, basin, shower and a floor drain (WC furthest from the door);
 *   kitchens a sink on an exterior wall; laundries a washer + drain; upper wet rooms a riser;
 *   septic tank in the front yard, grease trap outside the kitchen, water meter + tank/pump at
 *   the front; drain and water lines drawn as approximate orthogonal routes.
 * Coordinates: plan (building-local) metres.
 */
import { type Point, bbox, centroid, edges, length, pointAlong } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Plan, type Room, type RoomType } from "./schema";
import { roomAcross } from "./validator";
import { openingSegment } from "./takeoff";

export type MepKind =
  | "light"
  | "switch"
  | "socket"
  | "ac"
  | "heater"
  | "db"
  | "meter"
  | "wc"
  | "basin"
  | "shower"
  | "sink"
  | "washer"
  | "floor_drain"
  | "riser"
  | "septic"
  | "grease"
  | "water_meter"
  | "tank_pump";

export const ELECTRICAL: MepKind[] = ["light", "switch", "socket", "ac", "heater", "db", "meter"];
export const SANITARY: MepKind[] = ["wc", "basin", "shower", "sink", "washer", "floor_drain", "riser", "septic", "grease", "water_meter", "tank_pump"];

export interface MepItem {
  kind: MepKind;
  levelId: string;
  at: Point;
  roomId?: string;
}

export interface MepRun {
  kind: "drain" | "water";
  levelId: string;
  points: Point[];
}

export interface MepLayout {
  items: MepItem[];
  runs: MepRun[];
}

const SOCKETS: Partial<Record<RoomType, number>> = {
  living: 4, dining: 2, kitchen: 4, kitchen_thai: 2, master_bedroom: 4, bedroom: 3, office: 4, maid_room: 2,
  laundry: 2, multipurpose: 3, garage: 1, shop: 4, meeting: 4, corridor: 1, walk_in_closet: 1, shrine: 1, terrace: 1,
};
const AC_ROOMS = new Set<RoomType>(["living", "master_bedroom", "bedroom", "office", "multipurpose", "meeting", "shop", "maid_room"]);
const INSET = 0.25;

/** Point on an edge at `along`, moved `inward` metres into the room. */
function inwardPoint(room: Room, edgeIndex: number, along: number, inward: number): Point {
  const e = edges(room.polygon)[edgeIndex];
  const p = pointAlong(e, along);
  const c = centroid(room.polygon);
  const dx = c[0] - p[0];
  const dy = c[1] - p[1];
  // inward normal of an axis-aligned edge
  const horizontal = Math.abs(e[0][1] - e[1][1]) < 1e-6;
  const n: Point = horizontal ? [0, Math.sign(dy) || 1] : [Math.sign(dx) || 1, 0];
  return [p[0] + n[0] * inward, p[1] + n[1] * inward];
}

/** Door / opening segments that lead into a room (hosted by it or by a neighbour). */
function doorsOf(level: Level, room: Room): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (const o of level.openings) {
    if (o.kind === "window") continue;
    const host = level.rooms.find((r) => r.id === o.host.roomId);
    if (!host) continue;
    const across = roomAcross(level, host, o.host.edgeIndex, o.host.offsetM + o.widthM / 2);
    if (host.id === room.id || across?.id === room.id) {
      const seg = openingSegment(level, o);
      if (seg) out.push(seg);
    }
  }
  return out;
}

function isExteriorEdge(level: Level, room: Room, ei: number): boolean {
  const e = edges(room.polygon)[ei];
  const across = roomAcross(level, room, ei, length(e) / 2);
  return !across || ROOM_TYPE_INFO[across.type].outdoor;
}

/** Evenly spaced positions along the room's walls, keeping clear of doors. */
function alongWalls(level: Level, room: Room, count: number, inset: number): Point[] {
  if (count <= 0) return [];
  const doors = doorsOf(level, room);
  const es = edges(room.polygon);
  const perimeter = es.reduce((s, e) => s + length(e), 0);
  const out: Point[] = [];
  for (let k = 0; k < count * 4 && out.length < count; k++) {
    let t = ((k % count) + 0.5 + Math.floor(k / count) * 0.23) * (perimeter / count);
    t %= perimeter;
    for (let ei = 0; ei < es.length; ei++) {
      const L = length(es[ei]);
      if (t > L) {
        t -= L;
        continue;
      }
      const along = Math.min(Math.max(t, 0.4), L - 0.4);
      const wallPt = pointAlong(es[ei], along);
      const nearDoor = doors.some(([a, b]) => Math.min(Math.hypot(wallPt[0] - a[0], wallPt[1] - a[1]), Math.hypot(wallPt[0] - b[0], wallPt[1] - b[1]), distToSeg(wallPt, a, b)) < 0.6);
      if (!nearDoor && L > 0.9) out.push(inwardPoint(room, ei, along, inset));
      break;
    }
  }
  return out;
}

function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const L = (a: Point, b: Point): Point[] => [a, [a[0], b[1]], b];

export function mepLayout(plan: Plan): MepLayout {
  const items: MepItem[] = [];
  const runs: MepRun[] = [];
  const put = (kind: MepKind, levelId: string, at: Point, roomId?: string) => items.push({ kind, levelId, at: [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100], roomId });
  const [ox, oy] = plan.building.origin;
  const siteToPlan = (p: Point): Point => [p[0] - ox, p[1] - oy];

  for (const [li, level] of plan.levels.entries()) {
    for (const room of level.rooms) {
      const info = ROOM_TYPE_INFO[room.type];
      const b = bbox(room.polygon);
      const area = b.width * b.height;
      // ---- electrical ----
      if (room.type !== "pool") {
        const n = info.outdoor ? 1 : Math.min(6, Math.max(1, Math.round(area / 12)));
        const nx = Math.max(1, Math.round(Math.sqrt((n * b.width) / Math.max(b.height, 0.1))));
        const ny = Math.ceil(n / nx);
        let placed = 0;
        for (let j = 0; j < ny && placed < n; j++) for (let i = 0; i < nx && placed < n; i++, placed++) put("light", level.id, [b.minX + ((i + 0.5) * b.width) / nx, b.minY + ((j + 0.5) * b.height) / ny], room.id);
      }
      const door = doorsOf(level, room)[0];
      if (door && room.type !== "pool" && (!info.outdoor || room.type === "garage")) {
        // just beside the door (whichever side still lies in this room), 15 cm in from the wall
        const [a, c] = door;
        const len = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1;
        const dir: Point = [(a[0] - c[0]) / len, (a[1] - c[1]) / len];
        const ctr = centroid(room.polygon);
        const inside = (p: Point) => p[0] > b.minX + 0.1 && p[0] < b.maxX - 0.1 && p[1] > b.minY + 0.1 && p[1] < b.maxY - 0.1;
        const toward: Point = Math.abs(dir[0]) > 0.5 ? [0, Math.sign(ctr[1] - a[1]) || 1] : [Math.sign(ctr[0] - a[0]) || 1, 0];
        const candidates: Point[] = [
          [a[0] + dir[0] * 0.25 + toward[0] * 0.15, a[1] + dir[1] * 0.25 + toward[1] * 0.15],
          [c[0] - dir[0] * 0.25 + toward[0] * 0.15, c[1] - dir[1] * 0.25 + toward[1] * 0.15],
        ];
        const clamp = (p: Point): Point => [Math.min(Math.max(p[0], b.minX + 0.15), b.maxX - 0.15), Math.min(Math.max(p[1], b.minY + 0.15), b.maxY - 0.15)];
        put("switch", level.id, candidates.find(inside) ?? clamp(candidates[0]), room.id);
      }
      for (const p of alongWalls(level, room, SOCKETS[room.type] ?? 0, 0.15)) put("socket", level.id, p, room.id);
      if (AC_ROOMS.has(room.type)) {
        const es = edges(room.polygon);
        const ranked = es.map((e, i) => ({ i, len: length(e), ext: isExteriorEdge(level, room, i) })).sort((x, y) => Number(y.ext) - Number(x.ext) || y.len - x.len);
        put("ac", level.id, inwardPoint(room, ranked[0].i, ranked[0].len / 2, INSET), room.id);
      }
      // ---- sanitary ----
      if (room.type === "bathroom") {
        const d = doorsOf(level, room)[0];
        const dm: Point = d ? [(d[0][0] + d[1][0]) / 2, (d[0][1] + d[1][1]) / 2] : [b.minX, b.minY];
        const corners: Point[] = [
          [b.minX + 0.45, b.minY + 0.45],
          [b.maxX - 0.45, b.minY + 0.45],
          [b.maxX - 0.45, b.maxY - 0.45],
          [b.minX + 0.45, b.maxY - 0.45],
        ].sort((p, q) => Math.hypot(q[0] - dm[0], q[1] - dm[1]) - Math.hypot(p[0] - dm[0], p[1] - dm[1])) as Point[];
        put("shower", level.id, corners[0], room.id);
        put("wc", level.id, corners[1], room.id);
        put("basin", level.id, corners[2], room.id);
        put("floor_drain", level.id, centroid(room.polygon), room.id);
        put("heater", level.id, [corners[0][0], corners[0][1] + (corners[0][1] > (b.minY + b.maxY) / 2 ? -0.5 : 0.5)], room.id);
      }
      if (room.type === "kitchen" || room.type === "kitchen_thai") {
        const es = edges(room.polygon);
        const ext = es.map((e, i) => ({ i, len: length(e) })).filter((e) => isExteriorEdge(level, room, e.i)).sort((x, y) => y.len - x.len)[0] ?? { i: 2, len: length(es[2]) };
        put("sink", level.id, inwardPoint(room, ext.i, ext.len / 2, 0.35), room.id);
        if (room.type === "kitchen_thai") put("floor_drain", level.id, centroid(room.polygon), room.id);
      }
      if (room.type === "laundry") {
        put("washer", level.id, [b.minX + 0.45, b.minY + 0.45], room.id);
        put("floor_drain", level.id, centroid(room.polygon), room.id);
      }
      if (li > 0 && info.wet && !info.outdoor) {
        const r = centroid(room.polygon);
        const at: Point = [r[0] + 0.3, r[1] + 0.3];
        put("riser", level.id, at, room.id);
        put("riser", plan.levels[li - 1].id, at, room.id);
      }
    }

    // drains from fixtures to the room's riser on upper floors
    if (li > 0) {
      for (const it of items.filter((x) => x.levelId === level.id && ["wc", "basin", "shower", "floor_drain", "sink", "washer"].includes(x.kind))) {
        const riser = items.find((x) => x.levelId === level.id && x.kind === "riser" && x.roomId === it.roomId);
        if (riser) runs.push({ kind: "drain", levelId: level.id, points: L(it.at, riser.at) });
      }
    }
  }

  // ---- site services on the ground floor ----
  const g = plan.levels[0];
  const all = bbox(g.rooms.flatMap((r) => r.polygon));
  const plotFront = Math.min(...plan.site.boundary.map((p) => p[1]));
  const frontY = siteToPlan([0, plotFront])[1];
  const yardY = (frontY + all.minY) / 2; // between the building and the front boundary
  const entry = g.openings.find((o) => o.kind === "door" && !roomAcross(g, g.rooms.find((r) => r.id === o.host.roomId)!, o.host.edgeIndex, o.host.offsetM + o.widthM / 2));
  const entryRoom = entry ? g.rooms.find((r) => r.id === entry.host.roomId) : g.rooms.find((r) => !ROOM_TYPE_INFO[r.type].outdoor);
  if (entryRoom) {
    const eb = bbox(entryRoom.polygon);
    put("db", g.id, [eb.minX + 0.35, eb.minY + 0.35], entryRoom.id);
  }
  put("meter", g.id, [all.minX + 0.6, frontY + 0.4]);
  put("water_meter", g.id, [all.minX + 1.4, frontY + 0.4]);
  put("tank_pump", g.id, [all.maxX - 1.0, yardY]);
  const septic: Point = [all.minX + 2.2, yardY];
  put("septic", g.id, septic);

  // grease trap outside the (first) kitchen's exterior wall; kitchen sinks drain through it
  const kitchens = g.rooms.filter((r) => r.type === "kitchen" || r.type === "kitchen_thai");
  let grease: Point | null = null;
  if (kitchens.length) {
    const k = kitchens[kitchens.length - 1];
    const kb = bbox(k.polygon);
    grease = [kb.maxX + 0.6 <= all.maxX + 1.5 ? kb.maxX + 0.6 : kb.minX - 0.6, (kb.minY + kb.maxY) / 2];
    put("grease", g.id, grease);
  }
  for (const it of items.filter((x) => x.levelId === g.id && ["wc", "basin", "shower", "floor_drain", "washer", "riser"].includes(x.kind))) {
    runs.push({ kind: "drain", levelId: g.id, points: L(it.at, septic) });
  }
  for (const it of items.filter((x) => x.levelId === g.id && x.kind === "sink")) {
    runs.push({ kind: "drain", levelId: g.id, points: grease ? [...L(it.at, grease), ...L(grease, septic).slice(1)] : L(it.at, septic) });
  }
  // cold-water supply: meter → tank/pump → each ground-floor wet room and riser
  const tank = items.find((x) => x.kind === "tank_pump")!.at;
  const wm = items.find((x) => x.kind === "water_meter")!.at;
  runs.push({ kind: "water", levelId: g.id, points: L(wm, tank) });
  const supplied = new Set<string>();
  for (const it of items.filter((x) => x.levelId === g.id && ["basin", "sink", "washer", "riser"].includes(x.kind))) {
    const key = `${it.roomId}:${it.kind === "riser" ? "r" : ""}`;
    if (supplied.has(key)) continue;
    supplied.add(key);
    runs.push({ kind: "water", levelId: g.id, points: [tank, [tank[0], it.at[1]], it.at] });
  }
  return { items, runs };
}

/** Counts per symbol (for the legend / schedule on the drawing). */
export function mepSchedule(layout: MepLayout, kinds: MepKind[]): { kind: MepKind; count: number }[] {
  return kinds.map((kind) => ({ kind, count: layout.items.filter((i) => i.kind === kind).length })).filter((r) => r.count > 0);
}
