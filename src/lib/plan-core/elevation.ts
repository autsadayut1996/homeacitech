/**
 * Building elevations (รูปด้าน) as 2D line drawings, projected from the plan.
 *
 * Coordinates of the result: u = horizontal position on the drawing (metres, left → right as the
 * viewer sees it), z = height above ground. Pure — rendered by ElevationSvg and the DXF export.
 *
 * What is drawn: exterior wall faces turned towards the viewer, their doors and windows at real
 * size and height, balcony railings, carport posts, the roof (3D roof surfaces projected, so hips,
 * gables and ridges come out right), ground line, floor-level marks and the overall height.
 * Faces hidden behind an enclosed room closer to the viewer on the same floor are left out.
 */
import { TOL, type Point, centroid, compassBearing, transform } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Plan, type Room } from "./schema";
import { deriveWalls } from "./walls";
import { layoutWall } from "./wallsegments";
import { roofMesh, roofParts } from "./roof";

export type ElevationSide = "front" | "back" | "left" | "right";
export const ELEVATION_SIDES: ElevationSide[] = ["front", "right", "back", "left"];

/** Direction the viewer looks in (plan frame). Front = standing on the road side (y < 0) looking +y. */
const VIEW: Record<ElevationSide, Point> = { front: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0] };

export type LineKind = "wall" | "opening" | "glass" | "roof" | "railing" | "ground" | "level" | "dim";

export interface ElevationLine {
  a: [number, number];
  b: [number, number];
  kind: LineKind;
}

export interface ElevationText {
  at: [number, number];
  text: string;
  anchor: "start" | "middle" | "end";
  size: number;
  rotate?: number;
}

export interface Elevation {
  side: ElevationSide;
  /** Compass direction the facade faces, e.g. "N". */
  facing: string;
  lines: ElevationLine[];
  texts: ElevationText[];
  bounds: { minU: number; maxU: number; minZ: number; maxZ: number };
  /** Highest point of the roof above ground. */
  topZ: number;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];

export function elevation(plan: Plan, side: ElevationSide): Elevation {
  const d = VIEW[side];
  const right: Point = [d[1], -d[0]]; // viewer's right-hand direction
  const U = (p: Point) => dot(p, right);
  const depth = (p: Point) => dot(p, d);
  const lines: ElevationLine[] = [];
  const texts: ElevationText[] = [];
  const seen = new Set<string>();
  const add = (a: [number, number], b: [number, number], kind: LineKind) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3) return;
    const k1 = `${kind}:${r3(a[0])},${r3(a[1])}-${r3(b[0])},${r3(b[1])}`;
    const k2 = `${kind}:${r3(b[0])},${r3(b[1])}-${r3(a[0])},${r3(a[1])}`;
    if (seen.has(k1) || seen.has(k2)) return;
    seen.add(k1);
    lines.push({ a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])], kind });
  };
  const rect = (u0: number, u1: number, z0: number, z1: number, kind: LineKind) => {
    add([u0, z0], [u1, z0], kind);
    add([u1, z0], [u1, z1], kind);
    add([u1, z1], [u0, z1], kind);
    add([u0, z1], [u0, z0], kind);
  };
  const roomSpan = (r: Room) => {
    const us = r.polygon.map(U);
    const ds = r.polygon.map(depth);
    return { u0: Math.min(...us), u1: Math.max(...us), d0: Math.min(...ds), d1: Math.max(...ds) };
  };
  /** Is the strip [u0,u1] at this depth hidden by an enclosed room nearer the viewer on this level? */
  const hidden = (level: Level, u0: number, u1: number, atDepth: number, self?: string[]) =>
    level.rooms.some((r) => {
      if (ROOM_TYPE_INFO[r.type].outdoor || self?.includes(r.id)) return false;
      const s = roomSpan(r);
      return s.d1 <= atDepth + TOL && Math.min(u1, s.u1) - Math.max(u0, s.u0) > 0.05 && s.u0 <= u0 + TOL && s.u1 >= u1 - TOL;
    });

  for (const level of plan.levels) {
    const z0 = level.elevationM;
    const z1 = z0 + level.floorToFloorM;
    for (const w of deriveWalls(plan, level)) {
      if (w.kind !== "exterior") continue;
      const lay = layoutWall(level, w);
      // only walls parallel to the drawing plane, with the building behind them
      const wallIsHorizontal = lay.horizontal;
      const facesAlongY = Math.abs(d[1]) > 0.5;
      if (wallIsHorizontal !== facesAlongY) continue;
      const inside = level.rooms.find((r) => w.roomIds.includes(r.id) && !ROOM_TYPE_INFO[r.type].outdoor);
      if (!inside) continue;
      const wallDepth = depth(w.a);
      if (depth(centroid(inside.polygon)) <= wallDepth) continue; // building is in front of this wall: we see its back
      const ua = U(w.a);
      const ub = U(w.b);
      const [u0, u1] = [Math.min(ua, ub), Math.max(ua, ub)];
      if (hidden(level, u0, u1, wallDepth, w.roomIds)) continue;
      rect(u0, u1, z0, z1, "wall");
      for (const o of lay.openings) {
        const pa: Point = lay.horizontal ? [o.a, lay.fixed] : [lay.fixed, o.a];
        const pb: Point = lay.horizontal ? [o.b, lay.fixed] : [lay.fixed, o.b];
        const [ou0, ou1] = [Math.min(U(pa), U(pb)), Math.max(U(pa), U(pb))];
        if (o.kind === "opening") continue;
        rect(ou0, ou1, z0 + o.sill, z0 + o.head, "opening");
        if (o.kind === "window" || o.kind === "sliding_door") {
          const m = (ou0 + ou1) / 2;
          add([m, z0 + o.sill], [m, z0 + o.head], "glass"); // meeting rail of two panes
        }
      }
    }
    // railings of balconies / upper terraces, carport posts
    for (const r of level.rooms) {
      const s = roomSpan(r);
      if ((r.type === "balcony" || (r.type === "terrace" && z0 > 0)) && !hidden(level, s.u0, s.u1, s.d0)) {
        rect(s.u0, s.u1, z0, z0 + 1.0, "railing");
      }
      if (r.type === "garage" && level === plan.levels[0] && !hidden(level, s.u0, s.u1, s.d0)) {
        rect(s.u0, s.u0 + 0.2, z0, z1, "wall");
        rect(s.u1 - 0.2, s.u1, z0, z1, "wall");
      }
    }
  }

  // roof: project every edge of the 3D roof surfaces
  let topZ = plan.levels.reduce((h, l) => Math.max(h, l.elevationM + l.floorToFloorM), 0);
  for (const part of roofParts(plan)) {
    const mesh = roofMesh(part);
    for (const f of mesh.faces) {
      f.forEach((vi, i) => {
        const p = mesh.vertices[vi];
        const q = mesh.vertices[f[(i + 1) % f.length]];
        add([U([p[0], p[1]]), p[2]], [U([q[0], q[1]]), q[2]], "roof");
      });
    }
    topZ = Math.max(topZ, ...mesh.vertices.map((v) => v[2]));
  }

  // extents of what was drawn
  const us = lines.flatMap((l) => [l.a[0], l.b[0]]);
  const allRooms = plan.levels.flatMap((l) => l.rooms.map((r) => roomSpan(r)));
  const minU = Math.min(...us, ...allRooms.map((s) => s.u0));
  const maxU = Math.max(...us, ...allRooms.map((s) => s.u1));

  // ground, level marks, overall height
  add([minU - 2, 0], [maxU + 2, 0], "ground");
  const markU = minU - 1.2;
  const top = plan.levels[plan.levels.length - 1];
  const levelMarks = [...plan.levels.map((l) => ({ z: l.elevationM })), { z: top.elevationM + top.floorToFloorM }];
  for (const m of levelMarks) {
    add([markU - 0.4, m.z], [minU, m.z], "level");
    add([markU - 0.15, m.z + 0.25], [markU, m.z], "level");
    add([markU, m.z], [markU + 0.15, m.z + 0.25], "level");
    texts.push({ at: [markU - 0.5, m.z + 0.12], text: `${m.z >= 0 ? "+" : ""}${m.z.toFixed(2)}`, anchor: "end", size: 0.3 });
  }
  const dimU = maxU + 1.2;
  add([dimU, 0], [dimU, topZ], "dim");
  add([dimU - 0.15, 0], [dimU + 0.15, 0], "dim");
  add([dimU - 0.15, topZ], [dimU + 0.15, topZ], "dim");
  texts.push({ at: [dimU + 0.25, topZ / 2], text: topZ.toFixed(2), anchor: "middle", size: 0.3, rotate: -90 });

  const facadeDir = transform([-d[0], -d[1]], [0, 0], plan.building.rotationDeg);
  const facing = COMPASS[Math.round(compassBearing(facadeDir, plan.site.northAngleDeg) / 45) % 8];

  return { side, facing, lines, texts, topZ, bounds: { minU: minU - 3.2, maxU: maxU + 2.2, minZ: -0.6, maxZ: topZ + 0.8 } };
}

export function elevations(plan: Plan): Elevation[] {
  return ELEVATION_SIDES.map((s) => elevation(plan, s));
}

/** Overall footprint width seen from each side (handy for layout). */
export function elevationWidth(e: Elevation): number {
  return e.bounds.maxU - e.bounds.minU;
}

