import {
  type Point,
  area,
  bbox,
  compassBearing,
  edges,
  isRectilinear,
  length,
  outwardNormal,
  pointAlong,
  pointInPolygonInclusive,
  pointInPolygonStrict,
  rectilinearOverlap,
  signedArea,
  transform,
} from "./geometry";
import { PlanSchema, ROOM_TYPE_INFO, type Level, type Opening, type Plan, type Room } from "./schema";
import { buildableArea, polygonToSite } from "./site";

export type Severity = "error" | "warning";

export type IssueCode =
  | "schema"
  | "duplicate_id"
  | "room_not_rectilinear"
  | "room_degenerate"
  | "room_overlap"
  | "room_outside_buildable"
  | "room_too_small"
  | "room_too_narrow"
  | "opening_bad_host"
  | "opening_off_edge"
  | "window_on_interior_wall"
  | "room_unreachable"
  | "stair_missing"
  | "stair_misaligned"
  | "no_daylight"
  | "bedroom_west"
  | "wet_not_stacked"
  // raised while compiling AI output into a plan
  | "unknown_room_ref"
  | "door_no_shared_wall"
  | "window_no_exterior";

export interface Issue {
  code: IssueCode;
  severity: Severity;
  levelId?: string;
  roomIds?: string[];
  openingId?: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

const PROBE = 0.05; // metres, distance used to look across a wall

/** Look at the room (if any) on the other side of a room edge at a given offset. */
export function roomAcross(level: Level, room: Room, edgeIndex: number, offset: number): Room | null {
  const ccw = signedArea(room.polygon) >= 0;
  const e = edges(room.polygon)[edgeIndex];
  const n = outwardNormal(e);
  const dir = ccw ? 1 : -1;
  const p = pointAlong(e, offset);
  const probe: Point = [p[0] + n[0] * PROBE * dir, p[1] + n[1] * PROBE * dir];
  return level.rooms.find((r) => r.id !== room.id && pointInPolygonStrict(probe, r.polygon)) ?? null;
}

/** Outward direction (site frame) of a room edge. */
function edgeOutward(plan: Plan, room: Room, edgeIndex: number): Point {
  const ccw = signedArea(room.polygon) >= 0;
  const n = outwardNormal(edges(room.polygon)[edgeIndex]);
  const d: Point = ccw ? n : [-n[0], -n[1]];
  return transform(d, [0, 0], plan.building.rotationDeg);
}

/** True when any part of the edge faces open air or an outdoor room. */
function edgeIsExterior(level: Level, room: Room, edgeIndex: number): boolean {
  const len = length(edges(room.polygon)[edgeIndex]);
  const samples = Math.max(2, Math.ceil(len / 0.5));
  for (let i = 0; i < samples; i++) {
    const across = roomAcross(level, room, edgeIndex, ((i + 0.5) / samples) * len);
    if (!across || ROOM_TYPE_INFO[across.type].outdoor) return true;
  }
  return false;
}

export function validatePlan(input: unknown): ValidationResult {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Issue[] = parsed.error.issues.slice(0, 20).map((i) => ({
      code: "schema",
      severity: "error",
      params: { path: i.path.join("."), message: i.message },
    }));
    return { ok: false, errors, warnings: [] };
  }
  const plan = parsed.data;
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  // ---- ids -------------------------------------------------------------
  const seen = new Set<string>();
  for (const l of plan.levels) {
    for (const r of l.rooms) {
      if (seen.has(r.id)) add({ code: "duplicate_id", severity: "error", levelId: l.id, params: { id: r.id } });
      seen.add(r.id);
    }
    for (const o of l.openings) {
      if (seen.has(o.id)) add({ code: "duplicate_id", severity: "error", levelId: l.id, params: { id: o.id } });
      seen.add(o.id);
    }
  }

  const buildable = buildableArea(plan.site);

  for (const [li, level] of plan.levels.entries()) {
    // ---- room shape & size -------------------------------------------
    const goodRooms: Room[] = [];
    for (const room of level.rooms) {
      const info = ROOM_TYPE_INFO[room.type];
      const a = area(room.polygon);
      if (a < 0.1) {
        add({ code: "room_degenerate", severity: "error", levelId: level.id, roomIds: [room.id] });
        continue;
      }
      if (!isRectilinear(room.polygon)) {
        add({ code: "room_not_rectilinear", severity: "error", levelId: level.id, roomIds: [room.id] });
        continue;
      }
      goodRooms.push(room);
      if (a + 1e-6 < info.minAreaM2) {
        add({ code: "room_too_small", severity: "error", levelId: level.id, roomIds: [room.id], params: { area: round2(a), min: info.minAreaM2 } });
      }
      const bb = bbox(room.polygon);
      const narrow = Math.min(bb.width, bb.height);
      if (narrow + 1e-6 < info.minWidthM) {
        add({ code: "room_too_narrow", severity: "error", levelId: level.id, roomIds: [room.id], params: { width: round2(narrow), min: info.minWidthM } });
      }
      // inside buildable area (pools may sit in the setback)
      if (room.type !== "pool" && buildable.polygon.length >= 3) {
        const outside = polygonToSite(plan, room.polygon).some((p) => !pointInPolygonInclusive(p, buildable.polygon, 0.01));
        if (outside) add({ code: "room_outside_buildable", severity: "error", levelId: level.id, roomIds: [room.id] });
      }
    }

    // ---- overlaps ------------------------------------------------------
    for (let i = 0; i < goodRooms.length; i++) {
      for (let j = i + 1; j < goodRooms.length; j++) {
        const ov = rectilinearOverlap(goodRooms[i].polygon, goodRooms[j].polygon);
        if (ov > 0.01) {
          add({ code: "room_overlap", severity: "error", levelId: level.id, roomIds: [goodRooms[i].id, goodRooms[j].id], params: { area: round2(ov) } });
        }
      }
    }

    // ---- openings -----------------------------------------------------
    const byId = new Map(level.rooms.map((r) => [r.id, r]));
    const validOpenings: Opening[] = [];
    for (const o of level.openings) {
      const room = byId.get(o.host.roomId);
      if (!room || o.host.edgeIndex >= room.polygon.length) {
        add({ code: "opening_bad_host", severity: "error", levelId: level.id, openingId: o.id });
        continue;
      }
      const len = length(edges(room.polygon)[o.host.edgeIndex]);
      if (o.host.offsetM + o.widthM > len + 1e-6) {
        add({ code: "opening_off_edge", severity: "error", levelId: level.id, openingId: o.id, roomIds: [room.id], params: { edge: round2(len) } });
        continue;
      }
      validOpenings.push(o);
      if (o.kind === "window") {
        const across = roomAcross(level, room, o.host.edgeIndex, o.host.offsetM + o.widthM / 2);
        if (across && !ROOM_TYPE_INFO[across.type].outdoor) {
          add({ code: "window_on_interior_wall", severity: "warning", levelId: level.id, openingId: o.id, roomIds: [room.id, across.id] });
        }
      }
    }

    // ---- daylight -----------------------------------------------------
    for (const room of goodRooms) {
      const info = ROOM_TYPE_INFO[room.type];
      if (!info.needsDaylight) continue;
      const lit = validOpenings.some((o) => {
        if (o.host.roomId !== room.id || o.kind === "door") return false;
        const across = roomAcross(level, room, o.host.edgeIndex, o.host.offsetM + o.widthM / 2);
        return !across || ROOM_TYPE_INFO[across.type].outdoor;
      });
      if (!lit) add({ code: "no_daylight", severity: "warning", levelId: level.id, roomIds: [room.id] });
    }

    // ---- orientation: bedrooms with exterior wall facing west ----------
    for (const room of goodRooms) {
      if (room.type !== "bedroom" && room.type !== "master_bedroom") continue;
      const west = room.polygon.some((_, ei) => {
        if (!edgeIsExterior(level, room, ei)) return false;
        const b = compassBearing(edgeOutward(plan, room, ei), plan.site.northAngleDeg);
        return b > 225 && b < 315;
      });
      if (west) add({ code: "bedroom_west", severity: "warning", levelId: level.id, roomIds: [room.id] });
    }

    // ---- plumbing stacking --------------------------------------------
    if (li > 0) {
      const below = plan.levels[li - 1].rooms.filter((r) => ROOM_TYPE_INFO[r.type].wet && !ROOM_TYPE_INFO[r.type].outdoor);
      for (const room of goodRooms) {
        const info = ROOM_TYPE_INFO[room.type];
        if (!info.wet || info.outdoor) continue;
        const stacked = below.some((b) => rectilinearOverlap(room.polygon, b.polygon) > 0.01);
        if (!stacked) add({ code: "wet_not_stacked", severity: "warning", levelId: level.id, roomIds: [room.id] });
      }
    }
  }

  // ---- stairs -------------------------------------------------------------
  for (let li = 1; li < plan.levels.length; li++) {
    const upper = plan.levels[li];
    const lower = plan.levels[li - 1];
    const upStairs = upper.rooms.filter((r) => r.type === "stair");
    const linked = upStairs.filter((u) => lower.rooms.some((l) => l.type === "stair" && l.stairLinkId && l.stairLinkId === u.stairLinkId));
    if (linked.length === 0) {
      add({ code: "stair_missing", severity: "error", levelId: upper.id });
      continue;
    }
    for (const u of linked) {
      const l = lower.rooms.find((r) => r.type === "stair" && r.stairLinkId === u.stairLinkId)!;
      const ov = rectilinearOverlap(u.polygon, l.polygon);
      if (ov < 0.8 * Math.min(area(u.polygon), area(l.polygon))) {
        add({ code: "stair_misaligned", severity: "error", levelId: upper.id, roomIds: [l.id, u.id] });
      }
    }
  }

  // ---- reachability (doors/openings graph from the outside) ---------------
  issues.push(...checkReachability(plan));

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}

const EXTERIOR = "__exterior__";

function checkReachability(plan: Plan): Issue[] {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  adj.set(EXTERIOR, new Set());

  for (const [li, level] of plan.levels.entries()) {
    const byId = new Map(level.rooms.map((r) => [r.id, r]));
    for (const r of level.rooms) {
      if (!adj.has(r.id)) adj.set(r.id, new Set());
      if (li === 0 && ROOM_TYPE_INFO[r.type].outdoor) link(r.id, EXTERIOR);
    }
    for (const o of level.openings) {
      if (o.kind === "window") continue;
      const room = byId.get(o.host.roomId);
      if (!room || o.host.edgeIndex >= room.polygon.length) continue;
      const target = roomAcross(level, room, o.host.edgeIndex, o.host.offsetM + o.widthM / 2)?.id ?? null;
      if (target === null) {
        if (li === 0) link(room.id, EXTERIOR);
      } else {
        link(room.id, target);
      }
    }
  }
  // stairs connect levels
  for (let li = 1; li < plan.levels.length; li++) {
    for (const u of plan.levels[li].rooms.filter((r) => r.type === "stair" && r.stairLinkId)) {
      const l = plan.levels[li - 1].rooms.find((r) => r.type === "stair" && r.stairLinkId === u.stairLinkId);
      if (l) link(u.id, l.id);
    }
  }

  const visited = new Set<string>([EXTERIOR]);
  const queue = [EXTERIOR];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of adj.get(cur) ?? []) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  const issues: Issue[] = [];
  for (const level of plan.levels) {
    for (const r of level.rooms) {
      if (r.type === "pool") continue;
      if (!visited.has(r.id)) issues.push({ code: "room_unreachable", severity: "error", levelId: level.id, roomIds: [r.id] });
    }
  }
  return issues;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
