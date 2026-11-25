import { area, bbox, rectilinearOverlap } from "./geometry";
import { ROOM_TYPE_INFO, type Plan, type Room } from "./schema";

export type RoofKind = Plan["roof"]["type"] | "slab";

export interface RoofPart {
  kind: RoofKind;
  /** Footprint WITHOUT overhang, plan coordinates. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Elevation of the eaves (top of the walls below). */
  baseZ: number;
  pitchDeg: number;
  overhangM: number;
  /** Ridge runs along the longer side. */
  ridgeAxis: "x" | "y";
}

const COVERED_OPEN = new Set(["garage", "terrace"]); // open-air but roofed when nothing is above

function needsRoof(r: Room) {
  const info = ROOM_TYPE_INFO[r.type];
  return !info.outdoor || COVERED_OPEN.has(r.type);
}

/**
 * Roof parts: the main roof over the top floor (bounding box of its roofed rooms — an
 * approximation for L-shaped plans), plus flat slabs over lower rooms with nothing above.
 */
export function roofParts(plan: Plan): RoofPart[] {
  const parts: RoofPart[] = [];
  const top = plan.levels.length - 1;
  plan.levels.forEach((level, li) => {
    const baseZ = level.elevationM + level.floorToFloorM;
    const rooms = level.rooms.filter(needsRoof);
    if (li === top) {
      if (!rooms.length) return;
      const b = bbox(rooms.flatMap((r) => r.polygon));
      parts.push({
        kind: plan.roof.type,
        x0: b.minX,
        y0: b.minY,
        x1: b.maxX,
        y1: b.maxY,
        baseZ,
        pitchDeg: plan.roof.type === "flat" ? 0 : plan.roof.pitchDeg,
        overhangM: plan.roof.overhangM,
        ridgeAxis: b.width >= b.height ? "x" : "y",
      });
      return;
    }
    const above = plan.levels[li + 1].rooms;
    for (const r of rooms) {
      const covered = above.reduce((s, a) => s + rectilinearOverlap(r.polygon, a.polygon), 0);
      if (covered >= 0.5 * area(r.polygon)) continue;
      const b = bbox(r.polygon);
      parts.push({ kind: "slab", x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY, baseZ, pitchDeg: 0, overhangM: 0.3, ridgeAxis: "x" });
    }
  });
  return parts;
}

/** Sloped surface area of a roof part including overhang. */
export function roofArea(p: RoofPart): number {
  const w = p.x1 - p.x0 + 2 * p.overhangM;
  const d = p.y1 - p.y0 + 2 * p.overhangM;
  const plan = w * d;
  return p.pitchDeg > 0 ? plan / Math.cos((p.pitchDeg * Math.PI) / 180) : plan;
}

/** Height of the ridge above the eaves. */
export function ridgeHeight(p: RoofPart): number {
  if (p.kind === "flat" || p.kind === "slab") return 0;
  const w = p.x1 - p.x0 + 2 * p.overhangM;
  const d = p.y1 - p.y0 + 2 * p.overhangM;
  const short = Math.min(w, d);
  const run = p.kind === "shed" ? short : short / 2;
  return run * Math.tan((p.pitchDeg * Math.PI) / 180);
}

export interface RoofMesh {
  /** [x, y, z] in plan coordinates (z = elevation, metres). */
  vertices: [number, number, number][];
  /** Polygons as vertex indices. */
  faces: number[][];
}

/** 3D surfaces of a roof part (used to project elevations). Flat roofs/slabs are thin boxes. */
export function roofMesh(p: RoofPart): RoofMesh {
  const oh = p.overhangM;
  const x0 = p.x0 - oh;
  const x1 = p.x1 + oh;
  const y0 = p.y0 - oh;
  const y1 = p.y1 + oh;
  const z = p.baseZ;
  if (p.kind === "slab" || p.kind === "flat") {
    const t = p.kind === "flat" ? 0.25 : 0.15;
    const v: [number, number, number][] = [
      [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z],
      [x0, y0, z + t], [x1, y0, z + t], [x1, y1, z + t], [x0, y1, z + t],
    ];
    return { vertices: v, faces: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]] };
  }
  const rh = ridgeHeight(p);
  // local frame: u along the ridge, w across it
  const alongX = p.ridgeAxis === "x";
  const [u0, u1, w0, w1] = alongX ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const wm = (w0 + w1) / 2;
  const half = (w1 - w0) / 2;
  const P = (u: number, w: number, h: number): [number, number, number] => (alongX ? [u, w, z + h] : [w, u, z + h]);
  if (p.kind === "hip") {
    const r0 = Math.min(u0 + half, (u0 + u1) / 2);
    const r1 = Math.max(u1 - half, (u0 + u1) / 2);
    return {
      vertices: [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, 0), P(u0, w1, 0), P(r0, wm, rh), P(r1, wm, rh)],
      faces: [[0, 1, 5, 4], [2, 3, 4, 5], [3, 0, 4], [1, 2, 5]],
    };
  }
  if (p.kind === "gable") {
    return {
      vertices: [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, 0), P(u0, w1, 0), P(u0, wm, rh), P(u1, wm, rh)],
      faces: [[0, 1, 5, 4], [2, 3, 4, 5], [3, 0, 4], [1, 2, 5]],
    };
  }
  if (p.kind === "shed") {
    return {
      vertices: [P(u0, w0, 0), P(u1, w0, 0), P(u1, w1, rh), P(u0, w1, rh), P(u0, w1, 0), P(u1, w1, 0)],
      faces: [[0, 1, 2, 3], [0, 3, 4], [1, 2, 5]],
    };
  }
  // butterfly: valley along the middle, high outer edges
  return {
    vertices: [P(u0, w0, rh), P(u1, w0, rh), P(u1, wm, 0), P(u0, wm, 0), P(u1, w1, rh), P(u0, w1, rh), P(u0, w0, 0), P(u1, w0, 0), P(u0, w1, 0), P(u1, w1, 0)],
    faces: [[0, 1, 2, 3], [3, 2, 4, 5], [6, 0, 3], [3, 5, 8], [7, 1, 2], [2, 4, 9]],
  };
}
