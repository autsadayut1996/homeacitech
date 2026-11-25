import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { section, sectionCut } from "../section";
import { ridgeHeight, roofParts } from "../roof";

/** Geometry checks without the plinth (plinth behaviour is tested in annotate.test.ts). */
const plan = { ...sampleTwoStoreyPlan(), building: { ...sampleTwoStoreyPlan().building, plinthM: 0 } };

describe("sections", () => {
  it("cuts through the stair", () => {
    expect(sectionCut(plan, "A")).toMatchObject({ axis: "y", at: 8 }); // stair y 6–10
    expect(sectionCut(plan, "B")).toMatchObject({ axis: "x", at: 1.25 }); // stair x 0–2.5
  });

  it("A-A: cut walls, both floor slabs, roof profile, stair flight", () => {
    const s = section(plan, "A");
    // walls crossing y = 8 on each floor: x = 0, 2.5, 5, 12 → 4 per floor; ground floor hall walls are open passages
    expect(s.fills!.length).toBeGreaterThan(6);
    // slabs at z = 0 and 3.2 spanning the building (0–12 m, with 0.1 m bearing)
    const slabs = s.fills!.filter((f) => Math.abs(f[2][1] - f[0][1] - 0.15) < 1e-3);
    expect(slabs.map((f) => [Math.round((f[0][1] + 0.15) * 100) / 100, Math.round((f[1][0] - f[0][0]) * 100) / 100])).toEqual([
      [0, 12.2],
      [3.2, 12.2],
    ]);
    // roof cut reaches the ridge height in the middle of the cut
    const rh = ridgeHeight(roofParts(plan)[0]);
    const roofTop = Math.max(...s.lines.filter((l) => l.kind === "cut").flatMap((l) => [l.a[1], l.b[1]]));
    expect(roofTop).toBeCloseTo(6.2 + rh, 2);
    expect(s.texts.some((t) => t.text === "บันได")).toBe(true);
  });

  it("B-B: labels storey heights and the overall height", () => {
    const s = section(plan, "B", "en");
    const t = s.texts.map((x) => x.text);
    expect(t).toContain("3.20");
    expect(t).toContain("3.00");
    expect(t).toContain(s.topZ.toFixed(2));
    expect(t).toContain("Stair");
  });

  it("leaves a gap where the cut passes through a door", () => {
    const p = sampleTwoStoreyPlan();
    // A-A at y = 8 crosses the dining/hall opening on x = 5 (y 6.5–9.5): no full-height wall there on L1
    const s = section(p, "A");
    const fullAt5 = s.fills!.filter((f) => Math.abs((f[0][0] + f[1][0]) / 2 - 5) < 0.01 && f[0][1] === 0 && Math.abs(f[2][1] - 3.2) < 1e-6);
    expect(fullAt5).toHaveLength(0);
  });
});
