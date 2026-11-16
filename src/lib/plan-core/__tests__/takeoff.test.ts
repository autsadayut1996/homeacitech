import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { roofArea, roofParts, ridgeHeight } from "../roof";
import { takeoff } from "../takeoff";

describe("roof", () => {
  it("puts a hip roof over the top floor with overhang", () => {
    const parts = roofParts(sampleTwoStoreyPlan());
    expect(parts).toHaveLength(1); // upper floor covers the whole ground floor
    const p = parts[0];
    expect([p.x0, p.y0, p.x1, p.y1, p.baseZ]).toEqual([0, 0, 12, 16, 6.2]);
    expect(p.ridgeAxis).toBe("y");
    // 14 × 18 m with 1 m overhang, 30° pitch
    expect(roofArea(p)).toBeCloseTo((14 * 18) / Math.cos(Math.PI / 6));
    expect(ridgeHeight(p)).toBeCloseTo(7 * Math.tan(Math.PI / 6));
  });

  it("adds flat slabs over lower rooms with nothing above", () => {
    const plan = sampleTwoStoreyPlan();
    plan.levels[1].rooms = plan.levels[1].rooms.filter((r) => r.id !== "u-office" && r.id !== "u-master");
    const slabs = roofParts(plan).filter((p) => p.kind === "slab");
    expect(slabs.map((s) => [s.x0, s.x1, s.y0, s.y1])).toEqual([
      [0, 5, 0, 6], // carport
      [5, 12, 0, 6], // living room
    ]);
  });
});

describe("takeoff", () => {
  it("measures the sample plan", () => {
    const q = takeoff(sampleTwoStoreyPlan());
    expect(q.floorIndoorM2).toBe(318);
    expect(q.floorOutdoorM2).toBe(66);
    expect(q.ceilingM2).toBe(318);
    expect(q.bathroomCount).toBe(3);
    expect(q.kitchenCount).toBe(2);
    expect(q.doorCount).toBe(15); // 8 ground + 7 upper (openings and sliding doors excluded)
    expect(q.windowCount).toBe(12); // 6 per floor
    expect(q.exteriorPaintM2).toBeGreaterThan(100);
    expect(q.interiorPaintM2).toBeGreaterThan(q.exteriorPaintM2);
    expect(q.mainRoofM2).toBeCloseTo(q.roofM2);
  });
});
