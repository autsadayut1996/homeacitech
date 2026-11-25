import { TOL } from "./geometry";
import type { Level } from "./schema";
import { openingSegment } from "./takeoff";
import type { Wall } from "./walls";

export interface OpeningSpan {
  /** Interval along the wall axis (x for horizontal walls, y for vertical). */
  a: number;
  b: number;
  kind: "door" | "sliding_door" | "window" | "opening";
  sill: number;
  head: number;
  hostRoomId: string;
}

export interface WallLayout {
  horizontal: boolean;
  /** The fixed coordinate of the wall line (y for horizontal walls, x for vertical). */
  fixed: number;
  start: number;
  end: number;
  openings: OpeningSpan[];
  /** Solid wall runs between openings, extended by half a thickness at the ends to close corners. */
  solids: [number, number][];
}

/** Split a wall into solid runs and openings (used by the DXF export). */
export function layoutWall(level: Level, w: Wall): WallLayout {
  const horizontal = Math.abs(w.a[1] - w.b[1]) < TOL;
  const fixed = horizontal ? w.a[1] : w.a[0];
  const start = horizontal ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const end = horizontal ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const openings: OpeningSpan[] = [];
  for (const o of level.openings) {
    const seg = openingSegment(level, o);
    if (!seg) continue;
    const [p, q] = seg;
    const onLine = horizontal ? Math.abs(p[1] - fixed) < TOL && Math.abs(q[1] - fixed) < TOL : Math.abs(p[0] - fixed) < TOL && Math.abs(q[0] - fixed) < TOL;
    if (!onLine) continue;
    const pa = horizontal ? p[0] : p[1];
    const qa = horizontal ? q[0] : q[1];
    const a = Math.max(start, Math.min(pa, qa));
    const b = Math.min(end, Math.max(pa, qa));
    if (b - a < 0.05) continue;
    const sill = o.kind === "window" ? (o.sillM ?? 0.9) : 0;
    const head = Math.min(level.floorToFloorM - 0.05, sill + (o.heightM ?? (o.kind === "window" ? 1.2 : 2.1)));
    openings.push({ a, b, kind: o.kind, sill, head, hostRoomId: o.host.roomId });
  }
  openings.sort((x, y) => x.a - y.a);
  const solids: [number, number][] = [];
  let cursor = start - w.thicknessM / 2;
  for (const o of openings) {
    if (o.a > cursor) solids.push([cursor, o.a]);
    cursor = Math.max(cursor, o.b);
  }
  if (end + w.thicknessM / 2 > cursor) solids.push([cursor, end + w.thicknessM / 2]);
  return { horizontal, fixed, start, end, openings, solids };
}
