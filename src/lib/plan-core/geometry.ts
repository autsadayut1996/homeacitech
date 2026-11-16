/**
 * Pure 2D geometry helpers. Units are metres. Frame is mathematical (y up).
 * Points are tuples so the JSON stays compact and easy for the AI to emit.
 */
export type Point = [number, number];
export type Polygon = Point[];
export type Segment = [Point, Point];

export const EPS = 1e-6;
/** Geometric tolerance used when comparing plan coordinates (1 mm). */
export const TOL = 1e-3;

export function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function area(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

export function ensureCCW(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function edges(poly: Polygon): Segment[] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as Segment);
}

export function length([a, b]: Segment): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function bbox(poly: Polygon) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function centroid(poly: Polygon): Point {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Every edge horizontal or vertical (rooms in the MVP are rectilinear). */
export function isRectilinear(poly: Polygon): boolean {
  return edges(poly).every(([a, b]) => Math.abs(a[0] - b[0]) < TOL || Math.abs(a[1] - b[1]) < TOL);
}

export function pointOnSegment(p: Point, [a, b]: Segment, tol = TOL): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const len = length([a, b]);
  if (len < EPS) return Math.hypot(p[0] - a[0], p[1] - a[1]) <= tol;
  if (Math.abs(cross) / len > tol) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  return dot >= -tol * len && dot <= len * len + tol * len;
}

/** Strictly inside (points on the boundary return false). */
export function pointInPolygonStrict(p: Point, poly: Polygon): boolean {
  if (edges(poly).some((s) => pointOnSegment(p, s))) return false;
  return pointInPolygonRaw(p, poly);
}

/** Inside or on the boundary. */
export function pointInPolygonInclusive(p: Point, poly: Polygon, tol = TOL): boolean {
  if (edges(poly).some((s) => pointOnSegment(p, s, tol))) return true;
  return pointInPolygonRaw(p, poly);
}

function pointInPolygonRaw([x, y]: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isConvex(poly: Polygon): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < EPS) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Outward unit normal of edge a→b for a CCW polygon. */
export function outwardNormal([a, b]: Segment): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dy / len, -dx / len];
}

export function pointAlong([a, b]: Segment, distance: number): Point {
  const len = length([a, b]) || 1;
  const t = distance / len;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function transform(p: Point, origin: Point, rotationDeg: number): Point {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [origin[0] + p[0] * c - p[1] * s, origin[1] + p[0] * s + p[1] * c];
}

/** Keep the part of a convex polygon on the left of the directed line a→b. */
function clipHalfPlane(poly: Polygon, a: Point, b: Point): Polygon {
  const side = (p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const sc = side(cur);
    const sn = side(nxt);
    if (sc >= -EPS) out.push(cur);
    if ((sc > EPS && sn < -EPS) || (sc < -EPS && sn > EPS)) {
      const t = sc / (sc - sn);
      out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]);
    }
  }
  return out;
}

/**
 * Shrink a polygon inward with a different distance per edge.
 * Exact for convex polygons; for concave sites the result is a conservative
 * approximation and the caller should flag it.
 */
export function insetPolygon(poly: Polygon, distances: number[]): Polygon {
  const ccw = signedArea(poly) >= 0;
  let result: Polygon = ensureCCW(poly);
  edges(poly).forEach(([p, q], i) => {
    // Orient each edge so the interior is on its left.
    const [a, b] = ccw ? [p, q] : [q, p];
    const d = distances[i] ?? 0;
    const n = outwardNormal([a, b]);
    const a2: Point = [a[0] - n[0] * d, a[1] - n[1] * d];
    const b2: Point = [b[0] - n[0] * d, b[1] - n[1] * d];
    result = clipHalfPlane(result, a2, b2);
  });
  return result.length >= 3 ? result : [];
}

/** Split a rectilinear polygon into axis-aligned rectangles (grid method). */
export function decomposeRectilinear(poly: Polygon): Rect[] {
  const xs = uniqSorted(poly.map((p) => p[0]));
  const ys = uniqSorted(poly.map((p) => p[1]));
  const rects: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const c: Point = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      if (pointInPolygonRaw(c, poly)) rects.push({ x0: xs[i], y0: ys[j], x1: xs[i + 1], y1: ys[j + 1] });
    }
  }
  return rects;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function rectIntersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Overlap area of two rectilinear polygons. */
export function rectilinearOverlap(a: Polygon, b: Polygon): number {
  const ra = decomposeRectilinear(a);
  const rb = decomposeRectilinear(b);
  let s = 0;
  for (const x of ra) for (const y of rb) s += rectIntersectionArea(x, y);
  return s;
}

/** Area of the union of several rectilinear polygons. */
export function rectilinearUnionArea(polys: Polygon[]): number {
  if (polys.length === 0) return 0;
  const xs = uniqSorted(polys.flatMap((p) => p.map((q) => q[0])));
  const ys = uniqSorted(polys.flatMap((p) => p.map((q) => q[1])));
  let s = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const c: Point = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      if (polys.some((p) => pointInPolygonRaw(c, p))) s += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  }
  return s;
}

export function uniqSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > TOL) out.push(v);
  return out;
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Compass bearing (0 = N, 90 = E) of a direction given in the site frame. */
export function compassBearing(dir: Point, northAngleDeg: number): number {
  const fromPlusY = (Math.atan2(dir[0], dir[1]) * 180) / Math.PI;
  return (((fromPlusY - northAngleDeg) % 360) + 360) % 360;
}

export function pointSegmentDistance(p: Point, [a, b]: Segment): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsIntersect([a, b]: Segment, [c, d]: Segment): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Shortest distance between two segments (0 if they cross). */
export function segmentDistance(s: Segment, t: Segment): number {
  if (segmentsIntersect(s, t)) return 0;
  return Math.min(pointSegmentDistance(s[0], t), pointSegmentDistance(s[1], t), pointSegmentDistance(t[0], s), pointSegmentDistance(t[1], s));
}
