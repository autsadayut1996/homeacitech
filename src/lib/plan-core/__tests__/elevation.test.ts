import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { elevation, elevations } from "../elevation";
import { ridgeHeight, roofParts } from "../roof";

const plan = sampleTwoStoreyPlan();
const count = (e: ReturnType<typeof elevation>, kind: string) => e.lines.filter((l) => l.kind === kind).length;

describe("elevations", () => {
  it("draws all four sides with the right compass directions (plot front faces north)", () => {
    const es = elevations(plan);
    expect(es.map((e) => [e.side, e.facing])).toEqual([
      ["front", "N"],
      ["right", "W"],
      ["back", "S"],
      ["left", "E"],
    ]);
  });

  it("reaches the ridge of the hip roof", () => {
    const rh = ridgeHeight(roofParts(plan)[0]);
    const e = elevation(plan, "front");
    expect(e.topZ).toBeCloseTo(6.2 + rh);
    // ridge runs along y (16 m deep), so from the front the hip end shows as a triangle with its apex at the centre (x = 6)
    const apex = e.lines.filter((l) => l.kind === "roof" && (Math.abs(l.a[1] - e.topZ) < 1e-3 || Math.abs(l.b[1] - e.topZ) < 1e-3));
    expect(apex.length).toBeGreaterThan(0);
    for (const l of apex) {
      const top = Math.abs(l.a[1] - e.topZ) < 1e-3 ? l.a : l.b;
      expect(top[0]).toBeCloseTo(6);
    }
    // from the side the ridge is a horizontal line
    const side = elevation(plan, "left");
    expect(side.lines.some((l) => l.kind === "roof" && Math.abs(l.a[1] - side.topZ) < 1e-3 && Math.abs(l.b[1] - side.topZ) < 1e-3 && Math.abs(l.a[0] - l.b[0]) > 1)).toBe(true);
  });

  it("shows the front doors and windows at their real heights", () => {
    const e = elevation(plan, "front");
    // front openings: living-room door + window (ground), hall→carport door behind the carport,
    // master-bedroom window, master-bath window, office window (upper) = 6 rectangles × 4 sides
    expect(count(e, "opening")).toBe(6 * 4);
    const doorTop = e.lines.find((l) => l.kind === "opening" && l.a[1] === 2.1 && l.b[1] === 2.1);
    expect(doorTop).toBeTruthy();
    const upperWindowSill = e.lines.find((l) => l.kind === "opening" && Math.abs(l.a[1] - 4.1) < 1e-6 && Math.abs(l.b[1] - 4.1) < 1e-6);
    expect(upperWindowSill).toBeTruthy(); // 3.2 floor + 0.9 sill
  });

  it("hides faces covered by rooms in front", () => {
    // back elevation: the ground-floor dining room wall at y=10 is covered by the kitchens (y 10–16)
    const e = elevation(plan, "back");
    const hiddenWallAt = e.lines.filter((l) => l.kind === "wall" && l.a[1] === 0 && l.b[1] === 0 && Math.min(l.a[0], l.b[0]) <= -6 && Math.max(l.a[0], l.b[0]) >= -5);
    expect(e.lines.length).toBeGreaterThan(20);
    expect(hiddenWallAt.length).toBeLessThan(3);
  });

  it("draws the balcony railing and carport posts", () => {
    expect(count(elevation(plan, "right"), "railing")).toBeGreaterThan(0);
    expect(elevation(plan, "front").lines.some((l) => l.kind === "wall" && Math.abs(Math.abs(l.a[0] - l.b[0]) - 0.2) < 1e-6)).toBe(true);
  });

  it("marks floor levels and the overall height", () => {
    const e = elevation(plan, "front");
    expect(e.texts.map((t) => t.text)).toEqual(["+0.00", "+3.20", "+6.20", e.topZ.toFixed(2)]);
  });
});
