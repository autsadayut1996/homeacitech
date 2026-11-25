/**
 * Roof plan (ผังหลังคา): the roof seen from above, in plan coordinates.
 * Edges of the 3D roof surfaces are classified as eaves, ridges, hips/valleys or rakes;
 * each sloping surface gets a down-slope arrow with its pitch; the top floor's exterior walls
 * are shown dashed underneath.
 */
import type { Point } from "./geometry";
import type { Plan } from "./schema";
import { deriveWalls } from "./walls";
import { roofMesh, roofParts } from "./roof";

export type RoofPlanKind = "eave" | "ridge" | "hip" | "wall" | "arrow";

export interface RoofPlanLine {
  a: Point;
  b: Point;
  kind: RoofPlanKind;
}

export interface RoofPlan {
  lines: RoofPlanLine[];
  labels: { at: Point; text: string }[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function roofPlan(plan: Plan): RoofPlan {
  const lines: RoofPlanLine[] = [];
  const labels: RoofPlan["labels"] = [];
  const seen = new Map<string, number>();
  const add = (a: Point, b: Point, kind: RoofPlanKind) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3) return;
    const key = [a, b].map((p) => `${r3(p[0])},${r3(p[1])}`).sort().join("|");
    const prev = seen.get(key);
    // keep the most specific classification when two surfaces share an edge
    const rank: Record<RoofPlanKind, number> = { ridge: 4, hip: 3, eave: 2, wall: 1, arrow: 0 };
    if (prev !== undefined) {
      if (rank[kind] > rank[lines[prev].kind]) lines[prev].kind = kind;
      return;
    }
    seen.set(key, lines.length);
    lines.push({ a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])], kind });
  };

  for (const part of roofParts(plan)) {
    const m = roofMesh(part);
    const zs = m.vertices.map((v) => v[2]);
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);
    for (const f of m.faces) {
      const pts = f.map((i) => m.vertices[i]);
      // ignore vertical faces (gable ends, slab sides) — they have no area in plan
      const area2 = pts.reduce((s, p, i) => {
        const q = pts[(i + 1) % pts.length];
        return s + (p[0] * q[1] - q[0] * p[1]);
      }, 0);
      if (Math.abs(area2) < 1e-6) continue;
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const low = Math.abs(p[2] - zMin) < 1e-6 && Math.abs(q[2] - zMin) < 1e-6;
        const high = Math.abs(p[2] - zMax) < 1e-6 && Math.abs(q[2] - zMax) < 1e-6 && zMax > zMin;
        add([p[0], p[1]], [q[0], q[1]], low ? "eave" : high ? "ridge" : "hip");
      });
      if (zMax - zMin < 1e-6) continue; // flat roof / slab: no slope arrow
      // down-slope arrow from the face's centroid, following the steepest descent
      const [a, b, c] = pts;
      const n = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      const hl = Math.hypot(n[0], n[1]);
      if (hl < 1e-6) continue;
      const sgn = n[2] >= 0 ? 1 : -1; // make the normal point up; its xy part then points down-slope
      const dir: Point = [(n[0] / hl) * sgn, (n[1] / hl) * sgn];
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const L = 1.2;
      const tail: Point = [cx - (dir[0] * L) / 2, cy - (dir[1] * L) / 2];
      const head: Point = [cx + (dir[0] * L) / 2, cy + (dir[1] * L) / 2];
      lines.push({ a: tail, b: head, kind: "arrow" });
      const side: Point = [-dir[1], dir[0]];
      lines.push({ a: head, b: [head[0] - dir[0] * 0.3 + side[0] * 0.15, head[1] - dir[1] * 0.3 + side[1] * 0.15], kind: "arrow" });
      lines.push({ a: head, b: [head[0] - dir[0] * 0.3 - side[0] * 0.15, head[1] - dir[1] * 0.3 - side[1] * 0.15], kind: "arrow" });
      labels.push({ at: [tail[0] - dir[0] * 0.35, tail[1] - dir[1] * 0.35], text: `${part.pitchDeg}°` });
    }
    if (part.kind === "flat" || part.kind === "slab") {
      labels.push({ at: [(part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2], text: part.kind === "flat" ? "ROOF DECK" : "RC SLAB" });
    }
  }

  // exterior walls of the top floor, dashed under the roof
  const top = plan.levels[plan.levels.length - 1];
  for (const w of deriveWalls(plan, top)) if (w.kind === "exterior") add(w.a, w.b, "wall");
  return { lines, labels };
}
