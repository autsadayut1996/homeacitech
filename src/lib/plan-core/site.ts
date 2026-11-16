import { type Point, type Polygon, area, insetPolygon, isConvex, transform } from "./geometry";
import type { Plan, Site } from "./schema";

/** 1 ตารางวา = 4 m² ; 1 งาน = 100 ตร.วา ; 1 ไร่ = 400 ตร.วา */
export const SQM_PER_SQWA = 4;

export function sqmToSqWa(m2: number): number {
  return m2 / SQM_PER_SQWA;
}

export function sqWaToSqm(sqwa: number): number {
  return sqwa * SQM_PER_SQWA;
}

/** Format ตร.วา as ไร่-งาน-ตร.วา, e.g. 1-2-50. */
export function formatRaiNganWa(sqwa: number): string {
  const rai = Math.floor(sqwa / 400);
  const ngan = Math.floor((sqwa - rai * 400) / 100);
  const wa = sqwa - rai * 400 - ngan * 100;
  return `${rai}-${ngan}-${Math.round(wa * 10) / 10}`;
}

export function siteArea(site: Site): number {
  return area(site.boundary);
}

export interface BuildableArea {
  polygon: Polygon;
  /** True when the plot is concave and the inset is only an approximation. */
  approximate: boolean;
}

export function buildableArea(site: Site): BuildableArea {
  const distances = site.boundary.map((_, i) => site.setbacks.find((s) => s.edgeIndex === i)?.distanceM ?? 0);
  return { polygon: insetPolygon(site.boundary, distances), approximate: !isConvex(site.boundary) };
}

/** Room polygon in site coordinates (applies building origin + rotation). */
export function toSite(plan: Plan, p: Point): Point {
  return transform(p, plan.building.origin, plan.building.rotationDeg);
}

export function polygonToSite(plan: Plan, poly: Polygon): Polygon {
  return poly.map((p) => toSite(plan, p));
}

export type Facing = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export const FACING_BEARING: Record<Facing, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/**
 * For a plot whose edge 0 runs along +x at the front (y = 0), return northAngleDeg such that
 * the front of the plot faces the given compass direction.
 */
export function northAngleForFrontFacing(facing: Facing): number {
  return (((180 - FACING_BEARING[facing]) % 360) + 360) % 360;
}
