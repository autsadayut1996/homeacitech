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
