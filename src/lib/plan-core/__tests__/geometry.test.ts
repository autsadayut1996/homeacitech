import { describe, expect, it } from "vitest";
import {
  area,
  compassBearing,
  insetPolygon,
  isConvex,
  isRectilinear,
  pointInPolygonStrict,
  rectilinearOverlap,
  rectilinearUnionArea,
  type Polygon,
} from "../geometry";
import { formatRaiNganWa, northAngleForFrontFacing, sqmToSqWa } from "../site";

const sq = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe("geometry", () => {
  it("computes area regardless of winding", () => {
    expect(area(sq(0, 0, 4, 3))).toBe(12);
    expect(area([...sq(0, 0, 4, 3)].reverse())).toBe(12);
  });

  it("detects rectilinear and convex shapes", () => {
    const L: Polygon = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(isRectilinear(L)).toBe(true);
    expect(isConvex(L)).toBe(false);
    expect(isRectilinear([[0, 0], [4, 1], [0, 3]])).toBe(false);
  });

  it("measures overlap and union of rectilinear polygons", () => {
    expect(rectilinearOverlap(sq(0, 0, 4, 4), sq(2, 2, 6, 6))).toBe(4);
    expect(rectilinearOverlap(sq(0, 0, 4, 4), sq(4, 0, 8, 4))).toBe(0); // touching is not overlapping
    expect(rectilinearUnionArea([sq(0, 0, 4, 4), sq(2, 2, 6, 6)])).toBe(28);
    const L: Polygon = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(rectilinearOverlap(L, sq(3, 3, 5, 5))).toBe(0);
  });

  it("treats boundary points as not strictly inside", () => {
    expect(pointInPolygonStrict([2, 2], sq(0, 0, 4, 4))).toBe(true);
    expect(pointInPolygonStrict([0, 2], sq(0, 0, 4, 4))).toBe(false);
  });

  it("insets a plot with a different setback per edge", () => {
    const inset = insetPolygon(sq(0, 0, 16, 20), [6, 2, 1, 2]);
    expect(area(inset)).toBeCloseTo(12 * 13);
    // same result for a clockwise boundary (edge order follows the input)
    const cw: Polygon = [[0, 0], [0, 20], [16, 20], [16, 0]]; // edges: left, top, right, bottom
    expect(area(insetPolygon(cw, [2, 1, 2, 6]))).toBeCloseTo(12 * 13);
  });

  it("insets a trapezoid plot", () => {
    const trap: Polygon = [[0, 0], [20, 0], [15, 10], [5, 10]];
    const inset = insetPolygon(trap, [1, 1, 1, 1]);
    expect(inset.length).toBe(4);
    expect(area(inset)).toBeLessThan(area(trap));
  });

  it("converts compass bearings", () => {
    expect(compassBearing([0, 1], 0)).toBe(0);
    expect(compassBearing([1, 0], 0)).toBe(90);
    // front of plot faces north ⇒ the -y direction is north
    const n = northAngleForFrontFacing("N");
    expect(compassBearing([0, -1], n)).toBeCloseTo(0);
    expect(compassBearing([1, 0], n)).toBeCloseTo(270);
    expect(compassBearing([0, -1], northAngleForFrontFacing("E"))).toBeCloseTo(90);
  });
});

describe("land units", () => {
  it("converts m² to ตร.วา and ไร่-งาน-วา", () => {
    expect(sqmToSqWa(320)).toBe(80);
    expect(formatRaiNganWa(650)).toBe("1-2-50");
  });
});
