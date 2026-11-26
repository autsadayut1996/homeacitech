/**
 * Drafting symbols for plans (pure, plan coordinates, metres):
 *  - door swings, sliding doors and windows drawn the way they are on construction drawings
 *  - indicative furniture and sanitary fittings by room type (beds, sofa, dining set, kitchen
 *    counter, WC / basin / shower, car, desk, wardrobe…), placed against walls without doors
 *  - stair treads
 * Furniture is illustrative only — it shows the room works at that size; nothing is priced from it.
 */
import { type Point, bbox, edges, pointAlong, pointInPolygonInclusive } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Opening, type Plan, type Room } from "./schema";

export type Shape = { kind: "poly"; pts: Point[]; closed: boolean } | { kind: "circle"; c: Point; r: number };

const poly = (pts: Point[], closed = true): Shape => ({ kind: "poly", pts, closed });
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const P = (x: number, y: number): Point => [r3(x), r3(y)];

/** Segment of an opening on its host edge, plus the unit normal pointing into the host room. */
export function openingGeometry(level: Level, o: Opening) {
  const room = level.rooms.find((r) => r.id === o.host.roomId);
  const e = room && edges(room.polygon)[o.host.edgeIndex];
  if (!room || !e) return null;
  const a = pointAlong(e, o.host.offsetM);
  const b = pointAlong(e, o.host.offsetM + o.widthM);
  const d: Point = [(b[0] - a[0]) / o.widthM, (b[1] - a[1]) / o.widthM];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let n: Point = [-d[1], d[0]];
  if (!pointInPolygonInclusive([mid[0] + n[0] * 0.2, mid[1] + n[1] * 0.2], room.polygon)) n = [-n[0], -n[1]];
  return { room, a, b, d, n, mid };
}

/** Is there an enclosed room on the far side of this opening? (interior wall → interior thickness) */
function interiorWall(level: Level, g: NonNullable<ReturnType<typeof openingGeometry>>) {
  const q: Point = [g.mid[0] - g.n[0] * 0.3, g.mid[1] - g.n[1] * 0.3];
  return level.rooms.some((r) => r.id !== g.room.id && !ROOM_TYPE_INFO[r.type].outdoor && pointInPolygonInclusive(q, r.polygon));
}

function arc(c: Point, r: number, from: Point, to: Point, steps = 14): Point[] {
  const a0 = Math.atan2(from[1], from[0]);
  let a1 = Math.atan2(to[1], to[0]);
  while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / steps;
    return P(c[0] + r * Math.cos(t), c[1] + r * Math.sin(t));
  });
}

/** Door leaf + swing arc, sliding panels, or the glazing lines of a window. */
export function openingSymbols(plan: Plan, level: Level): Shape[] {
  const out: Shape[] = [];
  for (const o of level.openings) {
    const g = openingGeometry(level, o);
    if (!g || o.kind === "opening") continue;
    const t = (interiorWall(level, g) ? plan.wallSpec.interiorThicknessM : plan.wallSpec.exteriorThicknessM) / 2;
    const at = (p: Point, along: number, off: number): Point => P(p[0] + g.d[0] * along + g.n[0] * off, p[1] + g.d[1] * along + g.n[1] * off);
    if (o.kind === "window") {
      // jambs, two glass lines and the sill line
      out.push(poly([at(g.a, 0, -t), at(g.a, 0, t)], false), poly([at(g.b, 0, -t), at(g.b, 0, t)], false));
      for (const off of [-t / 3, t / 3]) out.push(poly([at(g.a, 0, off), at(g.b, 0, off)], false));
      out.push(poly([at(g.a, 0, -t), at(g.b, 0, -t)], false), poly([at(g.a, 0, t), at(g.b, 0, t)], false));
    } else if (o.kind === "sliding_door") {
      const w = o.widthM;
      out.push(poly([at(g.a, 0, -t / 4), at(g.a, w * 0.55, -t / 4)], false), poly([at(g.a, w * 0.45, t / 4), at(g.b, 0, t / 4)], false));
      out.push(poly([at(g.a, 0, -t), at(g.a, 0, t)], false), poly([at(g.b, 0, -t), at(g.b, 0, t)], false));
    } else {
      // single (≤ 1.1 m) or double leaf, hinged at the jamb, opening into the host room
      const leaves = o.widthM > 1.1 ? 2 : 1;
      const w = o.widthM / leaves;
      const hinges: [Point, number][] = leaves === 1 ? [[at(g.a, 0, t), 1]] : [[at(g.a, 0, t), 1], [at(g.b, 0, t), -1]];
      for (const [h, s] of hinges) {
        const tip = at(h, 0, w);
        out.push(poly([h, tip], false));
        out.push(poly(arc(h, w, [g.n[0], g.n[1]], [g.d[0] * s, g.d[1] * s]), false));
      }
    }
  }
  return out;
}

type Side = "S" | "N" | "W" | "E";

interface Frame {
  side: Side;
  /** Wall length available along this side. */
  len: number;
  /** Local (u along the wall, centre 0; v from the wall face into the room) → plan. */
  L: (u: number, v: number) => Point;
  doors: [number, number][];
  windows: [number, number][];
}

function frames(plan: Plan, level: Level, room: Room): Record<Side, Frame> {
  const b = bbox(room.polygon);
  const off = plan.wallSpec.interiorThicknessM / 2;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const mk = (side: Side): Frame => {
    const horiz = side === "S" || side === "N";
    const len = (horiz ? b.width : b.height) - 2 * off;
    const L =
      side === "S"
        ? (u: number, v: number) => P(cx + u, b.minY + off + v)
        : side === "N"
          ? (u: number, v: number) => P(cx - u, b.maxY - off - v)
          : side === "W"
            ? (u: number, v: number) => P(b.minX + off + v, cy - u)
            : (u: number, v: number) => P(b.maxX - off - v, cy + u);
    const line = side === "S" ? b.minY : side === "N" ? b.maxY : side === "W" ? b.minX : b.maxX;
    const toU = (p: Point) => (side === "S" ? p[0] - cx : side === "N" ? cx - p[0] : side === "W" ? cy - p[1] : p[1] - cy);
    const doors: [number, number][] = [];
    const windows: [number, number][] = [];
    for (const o of level.openings) {
      const g = openingGeometry(level, o);
      if (!g) continue;
      const onLine = horiz ? Math.abs(g.a[1] - line) < 0.05 && Math.abs(g.b[1] - line) < 0.05 : Math.abs(g.a[0] - line) < 0.05 && Math.abs(g.b[0] - line) < 0.05;
      if (!onLine) continue;
      const [u0, u1] = [toU(g.a), toU(g.b)].sort((x, y) => x - y);
      if (u1 < -len / 2 || u0 > len / 2) continue;
      // keep the door's swing clear as well
      (o.kind === "window" ? windows : doors).push(o.kind === "window" ? [u0, u1] : [u0 - 0.15, u1 + 0.15]);
    }
    return { side, len, L, doors, windows };
  };
  return { S: mk("S"), N: mk("N"), W: mk("W"), E: mk("E") };
}

/** Centre u for an item of width w on this side, clear of doors (and windows when asked), nearest the middle. */
function fit(f: Frame, w: number, avoidWindows = false, prefer = 0): number | null {
  const blocked = [...f.doors, ...(avoidWindows ? f.windows : [])].sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let cur = -f.len / 2;
  for (const [a, b] of blocked) {
    if (a > cur) free.push([cur, Math.min(a, f.len / 2)]);
    cur = Math.max(cur, b);
  }
  if (cur < f.len / 2) free.push([cur, f.len / 2]);
  let best: number | null = null;
  for (const [a, b] of free) {
    if (b - a < w) continue;
    const u = Math.min(Math.max(prefer, a + w / 2), b - w / 2);
    if (best === null || Math.abs(u - prefer) < Math.abs(best - prefer)) best = u;
  }
  return best;
}

const opposite: Record<Side, Side> = { S: "N", N: "S", W: "E", E: "W" };

/** Sides ordered best first: fewest doors, then longest. */
function rank(fr: Record<Side, Frame>, avoidWindows = false): Frame[] {
  return (Object.values(fr) as Frame[]).sort((a, b) => {
    const score = (f: Frame) => f.len - (f.doors.length ? 100 : 0) - (avoidWindows && f.windows.length ? 3 : 0);
    return score(b) - score(a);
  });
}

function rectL(f: Frame, u0: number, v0: number, u1: number, v1: number): Shape {
  return poly([f.L(u0, v0), f.L(u1, v0), f.L(u1, v1), f.L(u0, v1)]);
}
function lineL(f: Frame, u0: number, v0: number, u1: number, v1: number): Shape {
  return poly([f.L(u0, v0), f.L(u1, v1)], false);
}
function ellipseL(f: Frame, u: number, v: number, ru: number, rv: number): Shape {
  return poly(Array.from({ length: 18 }, (_, i) => f.L(u + ru * Math.cos((i / 18) * 2 * Math.PI), v + rv * Math.sin((i / 18) * 2 * Math.PI))));
}

/** Room depth seen from a side. */
const depthOf = (fr: Record<Side, Frame>, f: Frame) => fr[f.side === "S" || f.side === "N" ? "W" : "S"].len;

function bed(f: Frame, u: number, w: number, depth: number): Shape[] {
  const s = [rectL(f, u - w / 2, 0, u + w / 2, 2.0), lineL(f, u - w / 2, 0.65, u + w / 2, 0.65)];
  const pillows = w >= 1.4 ? [[-w / 4, w / 2 - 0.12], [w / 4, w / 2 - 0.12]] : [[0, w - 0.24]];
  for (const [pu, pw] of pillows) s.push(rectL(f, u + pu - pw / 2, 0.1, u + pu + pw / 2, 0.45));
  // nightstands where there is room
  if (depth >= 2.6)
    for (const sgn of [-1, 1]) {
      const nu = u + sgn * (w / 2 + 0.3);
      if (Math.abs(nu) + 0.25 < f.len / 2) s.push(rectL(f, nu - 0.22, 0, nu + 0.22, 0.42));
    }
  return s;
}

function wardrobe(f: Frame, u: number, w: number): Shape[] {
  const s = [rectL(f, u - w / 2, 0, u + w / 2, 0.6), lineL(f, u - w / 2, 0.3, u + w / 2, 0.3)];
  for (let x = u - w / 2 + 0.25; x < u + w / 2 - 0.1; x += 0.3) s.push(lineL(f, x - 0.08, 0.18, x + 0.08, 0.42));
  return s;
}

function furnishRoom(plan: Plan, level: Level, room: Room): Shape[] {
  const fr = frames(plan, level, room);
  const b = bbox(room.polygon);
  const out: Shape[] = [];
  const t = room.type;

  if (t === "master_bedroom" || t === "bedroom" || t === "maid_room") {
    const w = t === "master_bedroom" ? 1.8 : t === "maid_room" ? 0.9 : Math.min(1.5, b.width - 1.2, b.height - 1.2) >= 1.5 ? 1.5 : 1.05;
    const head = rank(fr, true).find((f) => fit(f, w + 0.1, true) !== null && depthOf(fr, f) >= 2.6) ?? rank(fr).find((f) => fit(f, w, false) !== null);
    if (head) {
      const u = fit(head, w + 0.1, true) ?? fit(head, w, false)!;
      out.push(...bed(head, u, w, head.len));
      // wardrobe on another wall without a door
      const ws = rank(fr, true).filter((f) => f !== head && f !== fr[opposite[head.side]]).concat(fr[opposite[head.side]]);
      for (const f of ws) {
        const len = Math.min(2.4, f.len - 0.3);
        if (len < 1.0) continue;
        const wu = fit(f, len, true, f.len / 2);
        if (wu !== null && depthOf(fr, f) > 2.6 + 0.6) {
          out.push(...wardrobe(f, wu, len));
          break;
        }
      }
    }
  } else if (t === "living" || t === "multipurpose") {
    const f = rank(fr).find((x) => fit(x, 2.2) !== null && depthOf(fr, x) >= 3);
    if (f) {
      const u = fit(f, 2.2)!;
      out.push(rectL(f, u - 1.1, 0, u + 1.1, 0.85), lineL(f, u - 0.9, 0.22, u + 0.9, 0.22), lineL(f, u - 0.9, 0.22, u - 0.9, 0.85), lineL(f, u + 0.9, 0.22, u + 0.9, 0.85));
      out.push(lineL(f, u - 0.3, 0.22, u - 0.3, 0.85), lineL(f, u + 0.3, 0.22, u + 0.3, 0.85));
      const depth = depthOf(fr, f);
      if (depth >= 3.2) out.push(rectL(f, u - 0.55, 1.25, u + 0.55, 1.8));
      const tv = fr[opposite[f.side]];
      const tu = fit(tv, 1.8, false, -u);
      if (tu !== null && depth >= 3.4) out.push(rectL(tv, tu - 0.9, 0, tu + 0.9, 0.42));
    }
  } else if (t === "dining") {
    const along = b.width >= b.height;
    const [L, W] = b.width * b.height >= 9 && Math.max(b.width, b.height) >= 3.2 ? [1.6, 0.9] : [1.2, 0.8];
    const f = along ? fr.S : fr.W;
    const depth = depthOf(fr, f);
    const v0 = depth / 2 - W / 2;
    if (f.len >= L + 0.6 && depth >= W + 1.3) {
      out.push(rectL(f, -L / 2, v0, L / 2, v0 + W));
      const n = L >= 1.6 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const cu = -L / 2 + (L / n) * (i + 0.5);
        out.push(rectL(f, cu - 0.22, v0 - 0.5, cu + 0.22, v0 - 0.06), rectL(f, cu - 0.22, v0 + W + 0.06, cu + 0.22, v0 + W + 0.5));
      }
    }
  } else if (t === "kitchen" || t === "kitchen_thai") {
    const f = rank(fr).find((x) => x.len >= 1.8 && depthOf(fr, x) >= 1.6);
    if (f) {
      const len = f.len - 0.05;
      const u = fit(f, len) ?? fit(f, Math.min(len, 2.4));
      const w = fit(f, len) !== null ? len : Math.min(len, 2.4);
      if (u !== null) {
        out.push(rectL(f, u - w / 2, 0, u + w / 2, 0.6));
        // sink with drainer, hob
        const su = u - w / 2 + 0.6;
        out.push(rectL(f, su - 0.4, 0.08, su + 0.4, 0.5), ellipseL(f, su - 0.12, 0.29, 0.16, 0.13));
        if (w >= 2.0) {
          const hu = u + w / 2 - 0.55;
          out.push(rectL(f, hu - 0.35, 0.08, hu + 0.35, 0.52));
          for (const [du, dv] of [[-0.17, 0.2], [0.17, 0.2], [-0.17, 0.4], [0.17, 0.4]]) out.push({ kind: "circle", c: f.L(hu + du, dv), r: 0.08 });
        }
        // refrigerator on the opposite wall if the kitchen is deep enough
        const o = fr[opposite[f.side]];
        const ru = fit(o, 0.7, false, o.len / 2);
        if (ru !== null && depthOf(fr, f) >= 2.4) out.push(rectL(o, ru - 0.35, 0, ru + 0.35, 0.7), lineL(o, ru - 0.35, 0.65, ru + 0.35, 0.65));
      }
    }
  } else if (t === "bathroom") {
    const f = rank(fr).find((x) => x.len >= 0.9) ?? fr.S;
    type Fx = { w: number; draw: (fr: Frame, u: number) => Shape[] };
    const shower: Fx = { w: 0.9, draw: (g, u) => [rectL(g, u - 0.45, 0, u + 0.45, 0.9), lineL(g, u - 0.45, 0, u + 0.45, 0.9), lineL(g, u + 0.45, 0, u - 0.45, 0.9), { kind: "circle", c: g.L(u, 0.45), r: 0.05 }] };
    const wc: Fx = { w: 0.5, draw: (g, u) => [rectL(g, u - 0.22, 0, u + 0.22, 0.2), ellipseL(g, u, 0.48, 0.19, 0.27)] };
    const basin: Fx = { w: 0.6, draw: (g, u) => [rectL(g, u - 0.3, 0, u + 0.3, 0.45), ellipseL(g, u, 0.22, 0.2, 0.15)] };
    const deep = depthOf(fr, f) >= 1.6;
    const place = deep && f.len >= 2.3 ? [shower, wc, basin] : [wc, basin];
    const other = fr[opposite[f.side]];
    let u = -f.len / 2 + 0.05;
    for (const fx of place) {
      const clash = u + fx.w > f.len / 2 || f.doors.some(([a, c]) => u < c && u + fx.w > a);
      if (!clash) {
        out.push(...fx.draw(f, u + fx.w / 2));
        u += fx.w + 0.1;
        continue;
      }
      // no room left on this wall: try the opposite one
      const ou = deep ? fit(other, fx.w + 0.05) : null;
      if (ou !== null) out.push(...fx.draw(other, ou));
    }
  } else if (t === "garage") {
    const along = b.height >= b.width; // cars point into the plot
    const f = along ? fr.S : fr.W;
    const cars = Math.max(1, Math.floor((f.len + 0.2) / 2.6));
    const depth = depthOf(fr, f);
    if (depth >= 4.6)
      for (let i = 0; i < cars; i++) {
        const u = -f.len / 2 + (f.len / cars) * (i + 0.5);
        const v0 = (depth - 4.6) / 2;
        out.push(
          poly([f.L(u - 0.75, v0), f.L(u + 0.75, v0), f.L(u + 0.9, v0 + 0.35), f.L(u + 0.9, v0 + 4.25), f.L(u + 0.75, v0 + 4.6), f.L(u - 0.75, v0 + 4.6), f.L(u - 0.9, v0 + 4.25), f.L(u - 0.9, v0 + 0.35)]),
          rectL(f, u - 0.75, v0 + 1.2, u + 0.75, v0 + 3.4),
          lineL(f, u - 0.75, v0 + 1.7, u + 0.75, v0 + 1.7),
          lineL(f, u - 0.75, v0 + 3.0, u + 0.75, v0 + 3.0),
        );
      }
  } else if (t === "office" || t === "meeting" || t === "shop") {
    const f = rank(fr).find((x) => fit(x, 1.4) !== null && depthOf(fr, x) >= 2);
    if (f) {
      const u = fit(f, 1.4)!;
      out.push(rectL(f, u - 0.7, 0, u + 0.7, 0.65), { kind: "circle", c: f.L(u, 0.95), r: 0.24 });
    }
  } else if (t === "shrine") {
    const f = rank(fr).find((x) => fit(x, 1.2) !== null);
    if (f) {
      const u = fit(f, 1.2)!;
      out.push(rectL(f, u - 0.6, 0, u + 0.6, 0.45), rectL(f, u - 0.35, 0, u + 0.35, 0.25));
    }
  } else if (t === "laundry") {
    const f = rank(fr).find((x) => fit(x, 1.3) !== null);
    if (f) {
      const u = fit(f, 1.3)!;
      out.push(rectL(f, u - 0.65, 0, u - 0.05, 0.6), { kind: "circle", c: f.L(u - 0.35, 0.3), r: 0.22 }, rectL(f, u + 0.05, 0, u + 0.65, 0.5), ellipseL(f, u + 0.35, 0.25, 0.2, 0.14));
    }
  } else if (t === "walk_in_closet") {
    for (const f of rank(fr).slice(0, 2)) {
      const len = Math.min(f.len - 0.1, 3);
      const u = fit(f, len);
      if (u !== null && depthOf(fr, f) >= 1.6) out.push(...wardrobe(f, u, len));
    }
  } else if (t === "stair") {
    // straight treads every 0.25 m along the longer direction, with the walking line
    const alongX = b.width >= b.height;
    const n = Math.floor(((alongX ? b.width : b.height) - 0.2) / 0.25);
    for (let i = 1; i <= n; i++) {
      const s = (alongX ? b.minX : b.minY) + 0.1 + i * 0.25;
      out.push(poly(alongX ? [P(s, b.minY + 0.1), P(s, b.maxY - 0.1)] : [P(b.minX + 0.1, s), P(b.maxX - 0.1, s)], false));
    }
  }
  return out;
}

/** Furniture for every room of a level; items that would stick out of an L-shaped room are dropped. */
export function furniture(plan: Plan, level: Level): Shape[] {
  return level.rooms.flatMap((room) =>
    furnishRoom(plan, level, room).filter((s) => (s.kind === "circle" ? [s.c] : s.pts).every((p) => pointInPolygonInclusive(p, room.polygon, 0.02))),
  );
}
