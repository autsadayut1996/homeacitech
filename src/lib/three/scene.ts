/**
 * Plan → 3D primitives (pure; no three.js import so it is unit-testable).
 * Building primitives use PLAN coordinates mapped to three.js axes as
 *   X = plan x,  Y = elevation (up),  Z = −plan y.
 * The renderer places the building group at the building origin.
 */
import {
  type Level,
  type Plan,
  type Point,
  ROOM_TYPE_INFO,
  type RoofPart,
  TOL,
  bbox,
  centroid,
  deriveWalls,
  edges,
  openingSegment,
  pointInPolygonStrict,
  ridgeHeight,
  roofParts,
  roomAcross,
  type Wall,
} from "@/lib/plan-core";

export type MatKey =
  | "floor"
  | "floor_outdoor"
  | "ext_wall"
  | "int_wall"
  | "roof"
  | "roof_slab"
  | "glass"
  | "window_frame"
  | "door"
  | "water"
  | "railing";

export type Vec3 = [number, number, number];

export interface BoxPrim {
  kind: "box";
  center: Vec3;
  size: Vec3;
  mat: MatKey;
  level: number;
  roof?: boolean;
}

export interface MeshPrim {
  kind: "mesh";
  positions: number[];
  indices: number[];
  mat: MatKey;
  level: number;
  roof: true;
}

export type Prim = BoxPrim | MeshPrim;

const SLAB = 0.12;
const RAILING_H = 1.0;

const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

/** Axis-aligned box from plan-space extents (x0..x1, y0..y1) and height range z0..z1. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: MatKey, level: number, roof = false): BoxPrim | null {
  const sx = Math.abs(x1 - x0);
  const sz = Math.abs(y1 - y0);
  const sy = z1 - z0;
  if (sx < 1e-4 || sz < 1e-4 || sy < 1e-4) return null;
  return { kind: "box", center: v3((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2), size: v3(sx, sy, sz), mat, level, roof };
}

interface OpeningSpan {
  a: number;
  b: number;
  kind: "door" | "sliding_door" | "window" | "opening";
  sill: number;
  head: number;
}

/** Openings lying on a wall, as intervals along the wall's own axis. */
function openingsOnWall(level: Level, w: Wall): OpeningSpan[] {
  const horizontal = Math.abs(w.a[1] - w.b[1]) < TOL;
  const fixed = horizontal ? w.a[1] : w.a[0];
  const [s, e] = horizontal ? [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])] : [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])];
  const out: OpeningSpan[] = [];
  for (const o of level.openings) {
    const seg = openingSegment(level, o);
    if (!seg) continue;
    const [p, q] = seg;
    const onLine = horizontal ? Math.abs(p[1] - fixed) < TOL && Math.abs(q[1] - fixed) < TOL : Math.abs(p[0] - fixed) < TOL && Math.abs(q[0] - fixed) < TOL;
    if (!onLine) continue;
    const a = Math.max(s, Math.min(horizontal ? p[0] : p[1], horizontal ? q[0] : q[1]));
    const b = Math.min(e, Math.max(horizontal ? p[0] : p[1], horizontal ? q[0] : q[1]));
    if (b - a < 0.05) continue;
    const sill = o.kind === "window" ? (o.sillM ?? 0.9) : 0;
    const head = Math.min(level.floorToFloorM - 0.05, sill + (o.heightM ?? (o.kind === "window" ? 1.2 : 2.1)));
    out.push({ a, b, kind: o.kind, sill, head });
  }
  return out.sort((x, y) => x.a - y.a);
}

/** Build all wall pieces for one wall: solid runs, sills, lintels and opening fills. */
function wallPrims(plan: Plan, level: Level, li: number, w: Wall): Prim[] {
  const prims: Prim[] = [];
  const z0 = level.elevationM;
  const H = level.floorToFloorM;
  const horizontal = Math.abs(w.a[1] - w.b[1]) < TOL;
  const fixed = horizontal ? w.a[1] : w.a[0];
  const s = horizontal ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const e = horizontal ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const t = w.thicknessM;

  // Layers across the wall thickness: [offset from centreline, thickness, material]
  let layers: [number, number, MatKey][] = [[0, t, "int_wall"]];
  if (w.kind === "exterior") {
    // which side is inside? probe from the enclosed room's centroid
    const inside = level.rooms.find((r) => w.roomIds.includes(r.id) && !ROOM_TYPE_INFO[r.type].outdoor);
    const c = inside ? centroid(inside.polygon) : ([0, 0] as Point);
    const insideSign = horizontal ? Math.sign(c[1] - fixed) || 1 : Math.sign(c[0] - fixed) || 1;
    layers = [
      [(insideSign * t) / 4, t / 2, "int_wall"],
      [(-insideSign * t) / 4, t / 2, "ext_wall"],
    ];
  }

  const piece = (a: number, b: number, h0: number, h1: number, mat?: MatKey, thick?: number) => {
    // extend solid runs by half a thickness at the wall ends so corners close
    const ls = mat ? [[0, thick ?? t, mat] as [number, number, MatKey]] : layers;
    for (const [off, th, m] of ls) {
      const p = horizontal
        ? box(a, b, fixed + off - th / 2, fixed + off + th / 2, z0 + h0, z0 + h1, m, li)
        : box(fixed + off - th / 2, fixed + off + th / 2, a, b, z0 + h0, z0 + h1, m, li);
      if (p) prims.push(p);
    }
  };

  const ops = openingsOnWall(level, w);
  let cursor = s - t / 2;
  for (const o of ops) {
    if (o.a > cursor) piece(cursor, o.a, 0, H);
    if (o.kind !== "opening" && o.sill > 0) piece(o.a, o.b, 0, o.sill);
    piece(o.a, o.b, o.head, H);
    if (o.kind === "window" || o.kind === "sliding_door") {
      piece(o.a, o.b, o.sill, o.head, "glass", 0.02);
      // frame: two jambs, head and sill rails
      piece(o.a, o.a + 0.05, o.sill, o.head, "window_frame", t * 0.6);
      piece(o.b - 0.05, o.b, o.sill, o.head, "window_frame", t * 0.6);
      piece(o.a, o.b, o.head - 0.05, o.head, "window_frame", t * 0.6);
      piece(o.a, o.b, o.sill, o.sill + 0.05, "window_frame", t * 0.6);
    } else if (o.kind === "door") {
      piece(o.a + 0.03, o.b - 0.03, 0.01, o.head, "door", 0.04);
    }
    cursor = Math.max(cursor, o.b);
  }
  if (e + t / 2 > cursor) piece(cursor, e + t / 2, 0, H);
  return prims;
}

function roofPrims(p: RoofPart, li: number): Prim[] {
  const oh = p.overhangM;
  const x0 = p.x0 - oh;
  const x1 = p.x1 + oh;
  const y0 = p.y0 - oh;
  const y1 = p.y1 + oh;
  const z = p.baseZ;
  if (p.kind === "slab" || p.kind === "flat") {
    const b = box(x0, x1, y0, y1, z, z + (p.kind === "flat" ? 0.25 : 0.15), p.kind === "flat" ? "roof" : "roof_slab", li, true);
    return b ? [b] : [];
  }
  const rh = ridgeHeight(p);
  // work in a local frame where the ridge runs along u; map back to (x, y)
  const alongX = p.ridgeAxis === "x";
  const [u0, u1, w0, w1] = alongX ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const wm = (w0 + w1) / 2;
  const half = (w1 - w0) / 2;
  const P = (u: number, w: number, h: number): number[] => {
    const [x, y] = alongX ? [u, w] : [w, u];
    return [x, z + h, -y];
  };
  let verts: number[][];
  let tris: number[][];
  let gable: number[][] = [];
  if (p.kind === "hip") {
    const r0 = Math.min(u0 + half, (u0 + u1) / 2);
    const r1 = Math.max(u1 - half, (u0 + u1) / 2);
    verts = [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, 0), P(u0, w1, 0), P(r0, wm, rh), P(r1, wm, rh)];
    tris = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [3, 0, 4], [1, 2, 5]];
  } else if (p.kind === "gable") {
    verts = [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, 0), P(u0, w1, 0), P(u0, wm, rh), P(u1, wm, rh)];
    tris = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5]];
    gable = [[3, 0, 4], [1, 2, 5]];
  } else if (p.kind === "shed") {
    verts = [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, rh), P(u0, w1, rh)];
    tris = [[0, 1, 2], [0, 2, 3]];
  } else {
    // butterfly: low valley along the middle, high outer edges
    verts = [P(u0, w0, rh), P(u1, w0, rh), P(u1, wm, 0), P(u0, wm, 0), P(u1, w1, rh), P(u0, w1, rh)];
    tris = [[0, 1, 2], [0, 2, 3], [3, 2, 4], [3, 4, 5]];
  }
  const out: Prim[] = [{ kind: "mesh", positions: verts.flat(), indices: tris.flat(), mat: "roof", level: li, roof: true }];
  if (gable.length) out.push({ kind: "mesh", positions: verts.flat(), indices: gable.flat(), mat: "ext_wall", level: li, roof: true });
  return out;
}

export interface Scene {
  prims: Prim[];
  /** Bounding box of the building in three.js coordinates (for camera framing). */
  bounds: { min: Vec3; max: Vec3 };
}

export function buildScene(plan: Plan): Scene {
  const prims: Prim[] = [];
  plan.levels.forEach((level, li) => {
    const z = level.elevationM;
    // floor slabs
    for (const r of level.rooms) {
      const b = bbox(r.polygon);
      const info = ROOM_TYPE_INFO[r.type];
      if (r.type === "pool") {
        const water = box(b.minX, b.maxX, b.minY, b.maxY, z - 0.25, z - 0.05, "water", li);
        if (water) prims.push(water);
        continue;
      }
      const slab = box(b.minX, b.maxX, b.minY, b.maxY, z - SLAB, z, info.outdoor ? "floor_outdoor" : "floor", li);
      if (slab) prims.push(slab);
      // railings on open balcony / upper terrace edges
      if ((r.type === "balcony" || r.type === "terrace") && li > 0) {
        edges(r.polygon).forEach(([a, c], ei) => {
          const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
          if (roomAcross(level, r, ei, len / 2)) return;
          const horizontal = Math.abs(a[1] - c[1]) < TOL;
          const rail = horizontal
            ? box(Math.min(a[0], c[0]), Math.max(a[0], c[0]), a[1] - 0.03, a[1] + 0.03, z, z + RAILING_H, "railing", li)
            : box(a[0] - 0.03, a[0] + 0.03, Math.min(a[1], c[1]), Math.max(a[1], c[1]), z, z + RAILING_H, "railing", li);
          if (rail) prims.push(rail);
        });
      }
    }
    for (const w of deriveWalls(plan, level)) prims.push(...wallPrims(plan, level, li, w));
  });
  for (const p of roofParts(plan)) {
    const li = Math.max(0, plan.levels.findIndex((l) => Math.abs(l.elevationM + l.floorToFloorM - p.baseZ) < 1e-6));
    prims.push(...roofPrims(p, li));
  }

  const all = plan.levels.flatMap((l) => l.rooms.flatMap((r) => r.polygon));
  const b = all.length ? bbox(all) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const top = plan.levels.reduce((h, l) => Math.max(h, l.elevationM + l.floorToFloorM), 0);
  const roofTop = roofParts(plan).reduce((h, p) => Math.max(h, p.baseZ + ridgeHeight(p)), top);
  return { prims, bounds: { min: [b.minX, 0, -b.maxY], max: [b.maxX, roofTop, -b.minY] } };
}

/** Is a plan point inside any enclosed room of a level (used for walk-mode start). */
export function insideAnyRoom(level: Level, p: Point): boolean {
  return level.rooms.some((r) => !ROOM_TYPE_INFO[r.type].outdoor && pointInPolygonStrict(p, r.polygon));
}
