import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { roofPlan } from "../roofplan";

const len = (l: { a: number[]; b: number[] }) => Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1]);

describe("roofPlan", () => {
  it("classifies the hip roof: 4 eaves, 1 ridge, 4 hips, 4 slope arrows", () => {
    const rp = roofPlan(sampleTwoStoreyPlan());
    const of = (k: string) => rp.lines.filter((l) => l.kind === k);
    expect(of("eave")).toHaveLength(4);
    // eaves include the 1 m overhang: 14 × 18
    expect(of("eave").map(len).sort((a, b) => a - b)).toEqual([14, 14, 18, 18]);
    expect(of("ridge")).toHaveLength(1);
    expect(len(of("ridge")[0])).toBeCloseTo(18 - 14); // hip roof ridge = long side − short side
    expect(of("hip")).toHaveLength(4);
    expect(of("arrow")).toHaveLength(4 * 3); // shaft + 2 heads per slope
    expect(rp.labels.map((l) => l.text)).toEqual(["30°", "30°", "30°", "30°"]);
    expect(of("wall").length).toBeGreaterThan(0);
  });

  it("points each slope arrow downhill (towards the eave)", () => {
    const rp = roofPlan(sampleTwoStoreyPlan());
    const shafts = rp.lines.filter((l) => l.kind === "arrow" && len(l) > 1);
    // the front slope (lowest y centroid) must point to -y
    const front = shafts.reduce((m, l) => ((l.a[1] + l.b[1]) / 2 < (m.a[1] + m.b[1]) / 2 ? l : m));
    expect(front.b[1]).toBeLessThan(front.a[1]);
  });

  it("labels flat roofs instead of drawing arrows", () => {
    const p = sampleTwoStoreyPlan();
    p.roof = { ...p.roof, type: "flat" };
    const rp = roofPlan(p);
    expect(rp.lines.some((l) => l.kind === "arrow")).toBe(false);
    expect(rp.labels.map((l) => l.text)).toContain("ROOF DECK");
  });
});
