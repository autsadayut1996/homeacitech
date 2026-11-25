/**
 * Building sections (รูปตัด) A-A and B-B, drawn like elevations but cut through the building.
 * A-A cuts across the width (plane y = c, looking towards the back); B-B cuts across the depth
 * (plane x = c, looking from the left). The cut passes through the stair when there is one.
 *
 * Drawn: cut walls and floor slabs (filled), openings in cut walls, the roof cut profile,
 * stair flights, room names, floor levels, storey heights and overall height.
 */
import { TOL, type Point, bbox } from "./geometry";
import type { Elevation, ElevationLine, ElevationText, LineKind } from "./elevation";
import { ROOM_TYPE_INFO, type Plan, roomLabel } from "./schema";
import { deriveWalls } from "./walls";
import { layoutWall } from "./wallsegments";
import { roofMesh, roofParts } from "./roof";
import { fmtLevel, plinthOf } from "./annotate";

export type SectionName = "A" | "B";

const SLAB = 0.15;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Where the cut runs, in plan coordinates (for drawing the cut line on floor plans). */
export function sectionCut(plan: Plan, name: SectionName): { axis: "y" | "x"; at: number; from: number; to: number } {
  const rooms = plan.levels.flatMap((l) => l.rooms);
  const all = bbox(rooms.flatMap((r) => r.polygon));
  const stair = plan.levels[0].rooms.find((r) => r.type === "stair");
  const sb = stair ? bbox(stair.polygon) : null;
  if (name === "A") return { axis: "y", at: sb ? (sb.minY + sb.maxY) / 2 : (all.minY + all.maxY) / 2, from: all.minX - 1.5, to: all.maxX + 1.5 };
  return { axis: "x", at: sb ? (sb.minX + sb.maxX) / 2 : (all.minX + all.maxX) / 2, from: all.minY - 1.5, to: all.maxY + 1.5 };
}

export function section(plan: Plan, name: SectionName, locale: "th" | "en" = "th"): Elevation {
  const cut = sectionCut(plan, name);
  // A: plane y = c, viewer looks +y, u = x.   B: plane x = c, viewer looks +x, u = −y.
  const d: Point = name === "A" ? [0, 1] : [1, 0];
  const right: Point = [d[1], -d[0]];
  const U = (p: Point) => p[0] * right[0] + p[1] * right[1];
  const depth = (p: Point) => p[0] * d[0] + p[1] * d[1];
  const c = cut.at;

  const lines: ElevationLine[] = [];
  const texts: ElevationText[] = [];
  const fills: [number, number][][] = [];
  const add = (a: [number, number], b: [number, number], kind: LineKind) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-3) lines.push({ a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])], kind });
  };
  const box = (u0: number, u1: number, z0: number, z1: number) => {
    if (u1 - u0 < 1e-3 || z1 - z0 < 1e-3) return;
    fills.push([[r3(u0), r3(z0)], [r3(u1), r3(z0)], [r3(u1), r3(z1)], [r3(u0), r3(z1)]]);
  };

  for (const level of plan.levels) {
    const z0 = level.elevationM;
    const z1 = z0 + level.floorToFloorM;
    // rooms the plane passes through
    const hit = level.rooms
      .filter((r) => r.type !== "pool")
      .map((r) => {
        const ds = r.polygon.map(depth);
        const us = r.polygon.map(U);
        return { r, u0: Math.min(...us), u1: Math.max(...us), d0: Math.min(...ds), d1: Math.max(...ds) };
      })
      .filter((h) => h.d0 < c - TOL && h.d1 > c + TOL);
    // floor slab under every room on the cut (merged)
    const spans = hit.map((h) => [h.u0, h.u1] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + TOL) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    for (const [a, b] of merged) box(a - 0.1, b + 0.1, z0 - SLAB, z0);
    // walls crossing the plane
    for (const w of deriveWalls(plan, level)) {
      const lay = layoutWall(level, w);
      const along = lay.horizontal ? Math.abs(d[0]) > 0.5 : Math.abs(d[1]) > 0.5; // wall runs along the view direction
      if (!along) continue;
      const da = depth(w.a);
      const db = depth(w.b);
      if (c <= Math.min(da, db) + TOL || c >= Math.max(da, db) - TOL) continue;
      const u = U(w.a);
      const t = w.thicknessM / 2;
      // the wall's own axis coincides with the view depth, so the cut position is c on it
      const opening = lay.openings.find((o) => c > o.a && c < o.b);
      if (!opening) box(u - t, u + t, z0, z1);
      else {
        if (opening.sill > 0) box(u - t, u + t, z0, z0 + opening.sill);
        box(u - t, u + t, z0 + opening.head, z1);
      }
    }
    // stairs and room names
    for (const h of hit) {
      if (h.r.type === "stair" && plan.levels.indexOf(level) < plan.levels.length - 1) {
        add([h.u0 + 0.2, z0], [h.u1 - 0.2, z1], "cut");
        const steps = Math.max(2, Math.round(level.floorToFloorM / 0.18));
        for (let i = 1; i < steps; i++) {
          const f = i / steps;
          const u = h.u0 + 0.2 + (h.u1 - h.u0 - 0.4) * f;
          add([u, z0 + level.floorToFloorM * f], [u, z0 + level.floorToFloorM * f - 0.18], "dim");
        }
      }
      if (!ROOM_TYPE_INFO[h.r.type].outdoor || h.r.type === "garage") {
        texts.push({ at: [(h.u0 + h.u1) / 2, z0 + 1.3], text: roomLabel(h.r, locale), anchor: "middle", size: Math.min(0.32, (h.u1 - h.u0) / 6) });
      }
    }
  }

  // roof: slice every roof surface with the plane
  let topZ = plan.levels.reduce((h, l) => Math.max(h, l.elevationM + l.floorToFloorM), 0);
  for (const part of roofParts(plan)) {
    const m = roofMesh(part);
    topZ = Math.max(topZ, ...m.vertices.map((v) => v[2]));
    for (const f of m.faces) {
      const hits: [number, number][] = [];
      f.forEach((vi, i) => {
        const p = m.vertices[vi];
        const q = m.vertices[f[(i + 1) % f.length]];
        const dp = depth([p[0], p[1]]) - c;
        const dq = depth([q[0], q[1]]) - c;
        if ((dp < 0 && dq < 0) || (dp > 0 && dq > 0) || Math.abs(dp - dq) < 1e-9) return;
        const t = dp / (dp - dq);
        hits.push([U([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]), p[2] + (q[2] - p[2]) * t]);
      });
      if (hits.length >= 2) add(hits[0], hits[1], "cut");
    }
  }

  // lift everything onto the plinth: ±0.00 is the road / existing ground
  const pz = plinthOf(plan);
  for (const l of lines) {
    l.a[1] = r3(l.a[1] + pz);
    l.b[1] = r3(l.b[1] + pz);
  }
  for (const f of fills) for (const p of f) p[1] = r3(p[1] + pz);
  for (const t of texts) t.at[1] += pz;
  topZ += pz;
  // ground, level marks, storey heights, overall height
  const us = [...lines.flatMap((l) => [l.a[0], l.b[0]]), ...fills.flatMap((f) => f.map((p) => p[0]))];
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  add([minU - 2, 0], [maxU + 2, 0], "ground");
  const top = plan.levels[plan.levels.length - 1];
  const marks = [0, ...plan.levels.map((l) => l.elevationM + pz), top.elevationM + top.floorToFloorM + pz].filter((z, i, a) => i === 0 || z - a[i - 1] > 0.05);
  const markU = minU - 1.2;
  for (const z of marks) {
    add([markU - 0.4, z], [minU, z], "level");
    add([markU - 0.15, z + 0.25], [markU, z], "level");
    add([markU, z], [markU + 0.15, z + 0.25], "level");
    texts.push({ at: [markU - 0.5, z + 0.12], text: fmtLevel(z), anchor: "end", size: 0.3 });
  }
  const dimU = maxU + 1.0;
  for (const l of plan.levels) {
    const lz = l.elevationM + pz;
    add([dimU, lz], [dimU, lz + l.floorToFloorM], "dim");
    add([dimU - 0.12, lz], [dimU + 0.12, lz], "dim");
    texts.push({ at: [dimU + 0.25, lz + l.floorToFloorM / 2], text: l.floorToFloorM.toFixed(2), anchor: "middle", size: 0.26, rotate: -90 });
  }
  const totU = dimU + 0.9;
  add([totU, 0], [totU, topZ], "dim");
  add([totU - 0.12, topZ], [totU + 0.12, topZ], "dim");
  add([totU - 0.12, 0], [totU + 0.12, 0], "dim");
  texts.push({ at: [totU + 0.25, topZ / 2], text: topZ.toFixed(2), anchor: "middle", size: 0.3, rotate: -90 });

  return {
    side: name === "A" ? "front" : "left",
    facing: name,
    lines,
    texts,
    fills,
    topZ,
    bounds: { minU: minU - 3.2, maxU: totU + 0.9, minZ: -0.6, maxZ: topZ + 0.8 },
  };
}
