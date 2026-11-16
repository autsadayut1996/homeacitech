/**
 * Pure editing operations on Plan JSON (no React). Every op returns a NEW plan.
 * Coordinates are building-local plan coordinates (metres).
 */
import {
  type Opening,
  type Plan,
  type Point,
  type Room,
  type RoomType,
  bbox,
  edges,
  isRectilinear,
  length,
  pointAlong,
  uniqSorted,
} from "@/lib/plan-core";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export type Side = "bottom" | "right" | "top" | "left";
export const SIDE_EDGE: Record<Side, number> = { bottom: 0, right: 1, top: 2, left: 3 };
export const MIN_ROOM_SIZE = 0.6;
const EPS = 1e-3;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const snapTo = (v: number, grid: number) => r3(Math.round(v / grid) * grid);

export function isRectRoom(room: Room): boolean {
  return room.polygon.length === 4 && isRectilinear(room.polygon);
}

export function roomRect(room: Room): Rect {
  const b = bbox(room.polygon);
  return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
}

export function rectPolygon(r: Rect): Point[] {
  return [
    [r3(r.x0), r3(r.y0)],
    [r3(r.x1), r3(r.y0)],
    [r3(r.x1), r3(r.y1)],
    [r3(r.x0), r3(r.y1)],
  ];
}

function clone(plan: Plan): Plan {
  return structuredClone(plan);
}

// ---------------------------------------------------------------------------
// Snapping

export interface SnapOptions {
  grid: number;
  /** Max distance (m) to pull onto another room's edge. 0 disables magnetic snapping. */
  magnet: number;
}

/** x and y lines other geometry offers for snapping (other rooms on this level and the level below). */
export function snapLines(plan: Plan, levelIndex: number, excludeIds: string[]): { xs: number[]; ys: number[] } {
  const rooms = [plan.levels[levelIndex], plan.levels[levelIndex - 1]]
    .filter(Boolean)
    .flatMap((l) => l!.rooms)
    .filter((r) => !excludeIds.includes(r.id));
  const xs = uniqSorted(rooms.flatMap((r) => r.polygon.map((p) => p[0])));
  const ys = uniqSorted(rooms.flatMap((r) => r.polygon.map((p) => p[1])));
  return { xs, ys };
}

function nearest(v: number, lines: number[], max: number): number | null {
  let best: number | null = null;
  for (const l of lines) if (Math.abs(l - v) <= max && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l;
  return best;
}

/** Snap a single coordinate: other rooms' edges first (magnet), then the grid. */
export function snapCoord(v: number, lines: number[], o: SnapOptions): number {
  const m = o.magnet > 0 ? nearest(v, lines, o.magnet) : null;
  return m ?? snapTo(v, o.grid);
}

/** Snap a moving interval [a,b] by delta d: either end may lock onto a line, else snap a to the grid. */
function snapSpanDelta(a: number, b: number, d: number, lines: number[], o: SnapOptions): number {
  let best: { delta: number; dist: number } | null = null;
  if (o.magnet > 0) {
    for (const end of [a, b]) {
      const target = nearest(end + d, lines, o.magnet);
      if (target !== null) {
        const dist = Math.abs(target - (end + d));
        if (!best || dist < best.dist) best = { delta: target - end, dist };
      }
    }
  }
  return best ? best.delta : snapTo(a + d, o.grid) - a;
}

// ---------------------------------------------------------------------------
// Opening helpers

/** Keep each opening's real-world position when its host room's edges change. */
function stabilizeOpenings(before: Plan, after: Plan, levelIndex: number, changedRoomIds: Set<string>) {
  const lb = before.levels[levelIndex];
  const la = after.levels[levelIndex];
  la.openings = la.openings.flatMap((o) => {
    if (!changedRoomIds.has(o.host.roomId)) return [o];
    const roomB = lb.rooms.find((r) => r.id === o.host.roomId);
    const roomA = la.rooms.find((r) => r.id === o.host.roomId);
    if (!roomA) return [];
    if (!roomB) return [clampOpening(o, roomA)];
    const eB = edges(roomB.polygon)[o.host.edgeIndex];
    const eA = edges(roomA.polygon)[o.host.edgeIndex];
    if (!eB || !eA) return [];
    const center = pointAlong(eB, o.host.offsetM + o.widthM / 2);
    // project the old centre onto the new edge (edges are axis-aligned)
    const horizontal = Math.abs(eA[0][1] - eA[1][1]) < EPS;
    const along = horizontal ? Math.abs(center[0] - eA[0][0]) : Math.abs(center[1] - eA[0][1]);
    return [clampOpening({ ...o, host: { ...o.host, offsetM: along - o.widthM / 2 } }, roomA)];
  });
}

/** Fit an opening onto its edge: shrink if the wall got short, slide back inside. */
export function clampOpening(o: Opening, room: Room): Opening {
  const e = edges(room.polygon)[o.host.edgeIndex];
  if (!e) return o;
  const len = length(e);
  const width = r3(Math.max(0.4, Math.min(o.widthM, len - 0.1)));
  const offset = r3(Math.min(Math.max(0, o.host.offsetM), Math.max(0, len - width)));
  return { ...o, widthM: width, host: { ...o.host, offsetM: offset } };
}

// ---------------------------------------------------------------------------
// Room operations

/**
 * Move a room by (dx, dy). Linked stairs on other levels move with it so stairs stay aligned.
 * Openings travel with the room (their offsets are relative to the room's own edges).
 */
export function moveRoom(plan: Plan, levelIndex: number, roomId: string, dx: number, dy: number, snap?: SnapOptions): Plan {
  const room = plan.levels[levelIndex].rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const rect = roomRect(room);
  if (snap) {
    const lines = snapLines(plan, levelIndex, [roomId]);
    dx = snapSpanDelta(rect.x0, rect.x1, dx, lines.xs, snap);
    dy = snapSpanDelta(rect.y0, rect.y1, dy, lines.ys, snap);
  }
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return plan;
  const next = clone(plan);
  const shift = (r: Room) => (r.polygon = r.polygon.map(([x, y]) => [r3(x + dx), r3(y + dy)] as Point));
  next.levels.forEach((l, li) =>
    l.rooms.forEach((r) => {
      if (r.id === roomId) shift(r);
      else if (li !== levelIndex && room.type === "stair" && room.stairLinkId && r.stairLinkId === room.stairLinkId) shift(r);
    }),
  );
  return next;
}

/**
 * Drag one wall of a rectangular room to `coord`. With `linked` (default), rooms on the other
 * side of that wall resize too — it behaves like moving the wall between them.
 */
export function resizeRoomSide(
  plan: Plan,
  levelIndex: number,
  roomId: string,
  side: Side,
  coord: number,
  { linked = true, snap }: { linked?: boolean; snap?: SnapOptions } = {},
): Plan {
  const level = plan.levels[levelIndex];
  const room = level.rooms.find((r) => r.id === roomId);
  if (!room || !isRectRoom(room)) return plan;
  const rect = roomRect(room);
  const vertical = side === "left" || side === "right";
  const key = ({ left: "x0", right: "x1", bottom: "y0", top: "y1" } as const)[side];
  const opposite = ({ left: "x1", right: "x0", bottom: "y1", top: "y0" } as const)[side];
  const old = rect[key];

  // neighbours sharing this wall (their opposite edge lies on the same line and overlaps)
  const neighbours = linked
    ? level.rooms.filter((r) => {
        if (r.id === roomId || !isRectRoom(r)) return false;
        const q = roomRect(r);
        if (Math.abs(q[opposite] - old) > EPS) return false;
        const [a0, a1] = vertical ? [rect.y0, rect.y1] : [rect.x0, rect.x1];
        const [b0, b1] = vertical ? [q.y0, q.y1] : [q.x0, q.x1];
        return Math.min(a1, b1) - Math.max(a0, b0) > EPS;
      })
    : [];

  if (snap) {
    const lines = snapLines(plan, levelIndex, [roomId, ...neighbours.map((n) => n.id)]);
    coord = snapCoord(coord, vertical ? lines.xs : lines.ys, snap);
  }

  // keep every affected room at least MIN_ROOM_SIZE
  const lo = side === "left" || side === "bottom";
  let min = -Infinity;
  let max = Infinity;
  const far = rect[opposite];
  if (lo) max = far - MIN_ROOM_SIZE;
  else min = far + MIN_ROOM_SIZE;
  for (const n of neighbours) {
    const q = roomRect(n);
    if (lo) min = Math.max(min, q[key] + MIN_ROOM_SIZE);
    else max = Math.min(max, q[key] - MIN_ROOM_SIZE);
  }
  coord = r3(Math.min(max, Math.max(min, coord)));
  if (Math.abs(coord - old) < EPS) return plan;

  const next = clone(plan);
  const nl = next.levels[levelIndex];
  const changed = new Set<string>([roomId, ...neighbours.map((n) => n.id)]);
  for (const r of nl.rooms) {
    if (!changed.has(r.id)) continue;
    const q = roomRect(r);
    if (r.id === roomId) q[key] = coord;
    else q[opposite] = coord;
    r.polygon = rectPolygon(q);
  }
  stabilizeOpenings(plan, next, levelIndex, changed);
  return next;
}

/** Set a room's rectangle directly (inspector inputs). */
export function setRoomRect(plan: Plan, levelIndex: number, roomId: string, rect: Rect): Plan {
  const r: Rect = {
    x0: Math.min(rect.x0, rect.x1),
    y0: Math.min(rect.y0, rect.y1),
    x1: Math.max(rect.x0, rect.x1, Math.min(rect.x0, rect.x1) + MIN_ROOM_SIZE),
    y1: Math.max(rect.y0, rect.y1, Math.min(rect.y0, rect.y1) + MIN_ROOM_SIZE),
  };
  const next = clone(plan);
  const room = next.levels[levelIndex].rooms.find((x) => x.id === roomId);
  if (!room) return plan;
  room.polygon = rectPolygon(r);
  stabilizeOpenings(plan, next, levelIndex, new Set([roomId]));
  return next;
}

export function updateRoom(plan: Plan, levelIndex: number, roomId: string, patch: Partial<Pick<Room, "type" | "name" | "stairLinkId">>): Plan {
  const next = clone(plan);
  const room = next.levels[levelIndex].rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  Object.assign(room, patch);
  if (patch.name && !patch.name.th && !patch.name.en) delete room.name;
  if (room.type === "stair" && !room.stairLinkId) room.stairLinkId = "S1";
  if (room.type !== "stair") delete room.stairLinkId;
  return next;
}

export function newId(prefix: string, plan: Plan): string {
  const used = new Set(plan.levels.flatMap((l) => [...l.rooms.map((r) => r.id), ...l.openings.map((o) => o.id)]));
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!used.has(id)) return id;
  }
}

export function addRoom(plan: Plan, levelIndex: number, type: RoomType, rect: Rect): { plan: Plan; id: string } {
  const next = clone(plan);
  const id = newId(`${plan.levels[levelIndex].id.toLowerCase()}-r`, plan);
  const room: Room = { id, type, polygon: rectPolygon(rect) };
  if (type === "stair") room.stairLinkId = "S1";
  next.levels[levelIndex].rooms.push(room);
  return { plan: next, id };
}

export function deleteRoom(plan: Plan, levelIndex: number, roomId: string): Plan {
  const next = clone(plan);
  const l = next.levels[levelIndex];
  l.rooms = l.rooms.filter((r) => r.id !== roomId);
  l.openings = l.openings.filter((o) => o.host.roomId !== roomId);
  return next;
}

// ---------------------------------------------------------------------------
// Openings

export const OPENING_DEFAULTS: Record<Opening["kind"], { widthM: number; heightM: number; sillM: number }> = {
  door: { widthM: 0.9, heightM: 2.1, sillM: 0 },
  sliding_door: { widthM: 2.0, heightM: 2.1, sillM: 0 },
  window: { widthM: 1.2, heightM: 1.2, sillM: 0.9 },
  opening: { widthM: 1.5, heightM: 2.1, sillM: 0 },
};

/** Nearest room edge to a point (within `tolerance` m). */
export function nearestEdge(plan: Plan, levelIndex: number, p: Point, tolerance = 0.4): { roomId: string; edgeIndex: number; along: number; dist: number } | null {
  let best: { roomId: string; edgeIndex: number; along: number; dist: number } | null = null;
  for (const room of plan.levels[levelIndex].rooms) {
    edges(room.polygon).forEach(([a, b], edgeIndex) => {
      const len = length([a, b]);
      if (len < EPS) return;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const t = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
      if (t < 0 || t > len) return;
      const dist = Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
      if (dist <= tolerance && (!best || dist < best.dist)) best = { roomId: room.id, edgeIndex, along: t, dist };
    });
  }
  return best;
}

export function addOpeningAt(plan: Plan, levelIndex: number, p: Point, kind: Opening["kind"], grid = 0.05): { plan: Plan; id: string } | null {
  const hit = nearestEdge(plan, levelIndex, p);
  if (!hit) return null;
  const next = clone(plan);
  const l = next.levels[levelIndex];
  const room = l.rooms.find((r) => r.id === hit.roomId)!;
  const d = OPENING_DEFAULTS[kind];
  const id = newId(`${l.id.toLowerCase()}-o`, plan);
  const o = clampOpening({ id, kind, host: { roomId: room.id, edgeIndex: hit.edgeIndex, offsetM: snapTo(hit.along - d.widthM / 2, grid) }, ...d }, room);
  l.openings.push(o);
  return { plan: next, id };
}

export function updateOpening(plan: Plan, levelIndex: number, id: string, patch: Partial<Pick<Opening, "kind" | "widthM" | "heightM" | "sillM">> & { offsetM?: number }): Plan {
  const next = clone(plan);
  const l = next.levels[levelIndex];
  const i = l.openings.findIndex((o) => o.id === id);
  if (i < 0) return plan;
  const o = l.openings[i];
  const { offsetM, ...rest } = patch;
  let updated: Opening = { ...o, ...rest, host: { ...o.host, offsetM: offsetM ?? o.host.offsetM } };
  if (patch.kind && patch.kind !== o.kind) updated = { ...updated, heightM: OPENING_DEFAULTS[patch.kind].heightM, sillM: OPENING_DEFAULTS[patch.kind].sillM };
  const room = l.rooms.find((r) => r.id === o.host.roomId);
  l.openings[i] = room ? clampOpening(updated, room) : updated;
  return next;
}

/** Slide an opening along its wall so its centre is nearest to point p. */
export function slideOpening(plan: Plan, levelIndex: number, id: string, p: Point, grid = 0.05): Plan {
  const l = plan.levels[levelIndex];
  const o = l.openings.find((x) => x.id === id);
  const room = o && l.rooms.find((r) => r.id === o.host.roomId);
  const e = room && edges(room.polygon)[o!.host.edgeIndex];
  if (!o || !e) return plan;
  const len = length(e);
  const t = ((p[0] - e[0][0]) * (e[1][0] - e[0][0]) + (p[1] - e[0][1]) * (e[1][1] - e[0][1])) / len;
  return updateOpening(plan, levelIndex, id, { offsetM: snapTo(t - o.widthM / 2, grid) });
}

export function deleteOpening(plan: Plan, levelIndex: number, id: string): Plan {
  const next = clone(plan);
  next.levels[levelIndex].openings = next.levels[levelIndex].openings.filter((o) => o.id !== id);
  return next;
}

// ---------------------------------------------------------------------------
// Dimensions

/** Chain dimensions along the building: the distinct x (and y) wall lines of a level. */
export function chainDimensions(plan: Plan, levelIndex: number): { xs: number[]; ys: number[] } {
  const rooms = plan.levels[levelIndex].rooms;
  return {
    xs: uniqSorted(rooms.flatMap((r) => r.polygon.map((p) => p[0]))),
    ys: uniqSorted(rooms.flatMap((r) => r.polygon.map((p) => p[1]))),
  };
}
