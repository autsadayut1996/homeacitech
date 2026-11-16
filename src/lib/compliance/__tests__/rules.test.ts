import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { op } from "@/lib/plan-core/samples";
import { buildableArea, area } from "@/lib/plan-core";
import { BANGKOK_RULES, NATIONAL_RULES } from "../defaults";
import { envelopeSetbacks, evaluateAll, evaluateRule, overallStatus, regulatoryHeight, roadSetbacks, type RuleData } from "../rules";

const rule = (code: string) => BANGKOK_RULES.find((r) => r.code === code)!;
const status = (code: string, plan = sampleTwoStoreyPlan(), extra = {}) => evaluateRule(rule(code), { plan, buildingType: "two_storey", ...extra });

describe("compliance rules", () => {
  it("sample plan passes everything except the unconfigured zone check", () => {
    const res = evaluateAll(BANGKOK_RULES, { plan: sampleTwoStoreyPlan(), buildingType: "two_storey" });
    expect(Object.fromEntries(res.map((r) => [r.code, r.status]))).toEqual({
      OPENING_BOUNDARY: "pass",
      ROAD_CENTERLINE_LT6: "pass", // road is 6 m → not applicable
      ROAD_FRACTION: "pass", // houses are exempt
      HEIGHT_ROAD: "pass",
      HIGH_RISE: "pass",
      PARKING_COMMERCIAL: "pass",
      BKK_FAR_OSR: "warn", // no zone given
    });
    expect(overallStatus(res)).toBe("warn");
    expect(res.every((r) => !r.verified && r.sourceRef.length > 0)).toBe(true);
  });

  it("measures height to the top of the highest walls", () => {
    expect(regulatoryHeight(sampleTwoStoreyPlan())).toBeCloseTo(6.2);
  });

  it("fails windows too close to a side boundary and marks them", () => {
    const plan = sampleTwoStoreyPlan();
    plan.building.origin = [1, 2]; // left side now 1 m from the boundary
    const r = status("OPENING_BOUNDARY", plan);
    expect(r.status).toBe("fail");
    expect(r.marks.length).toBeGreaterThan(0);
    expect(r.details[0].th).toMatch(/1 ม\./);
  });

  it("only warns for openings facing the road", () => {
    const plan = sampleTwoStoreyPlan();
    plan.building.origin = [2, 1.5]; // front (road) 1.5 m
    expect(status("OPENING_BOUNDARY", plan).status).toBe("warn");
  });

  it("requires 3 m once the building is 9 m or taller", () => {
    const plan = sampleTwoStoreyPlan();
    plan.levels[1].floorToFloorM = 6; // eaves at 9.2 m
    const r = status("OPENING_BOUNDARY", plan);
    expect(r.status).not.toBe("pass");
    expect(r.message.en).toMatch(/requires 3 m/);
  });

  it("checks balconies above ground like openings", () => {
    const plan = sampleTwoStoreyPlan();
    plan.levels[1].openings = plan.levels[1].openings.filter((o) => o.kind !== "window");
    plan.building.origin = [1.5, 2]; // right side of the balcony is now 2.5 m away, left windows removed…
    const r = status("OPENING_BOUNDARY", plan);
    expect(r.details.some((d) => d.en.includes("Balcony"))).toBe(false); // balcony is on the right, 2.5 m — fine
    plan.building.origin = [2.5, 2]; // balcony right edge now 1.5 m from the boundary
    expect(status("OPENING_BOUNDARY", plan).details.some((d) => d.en.includes("Balcony"))).toBe(true);
  });

  it("fails blank walls between 0 and 0.5 m, warns on the boundary line", () => {
    const plan = sampleTwoStoreyPlan();
    for (const l of plan.levels) l.openings = l.openings.filter((o) => !(o.host.roomId.endsWith("bed") || o.host.roomId.endsWith("bed2") || o.host.roomId === "u-master") || o.kind === "door");
    plan.building.origin = [0.3, 2];
    expect(status("OPENING_BOUNDARY", plan).details.some((d) => d.en.includes("blank wall"))).toBe(true);
    plan.building.origin = [0, 2];
    expect(status("OPENING_BOUNDARY", plan).details.some((d) => d.en.includes("consent"))).toBe(true);
  });

  it("applies the centreline rule to narrow roads", () => {
    const plan = sampleTwoStoreyPlan();
    plan.site.roads = [{ edgeIndex: 0, widthM: 4 }];
    expect(roadSetbacks(plan.site, NATIONAL_RULES).get(0)?.distance).toBe(1); // 3 − 4/2
    plan.building.origin = [2, 0.5];
    expect(status("ROAD_CENTERLINE_LT6", plan).status).toBe("fail");
  });

  it("applies the 1/10 rule only to listed building types", () => {
    const plan = sampleTwoStoreyPlan();
    plan.site.roads = [{ edgeIndex: 0, widthM: 16 }];
    plan.building.origin = [2, 1];
    expect(status("ROAD_FRACTION", plan).status).toBe("pass");
    expect(status("ROAD_FRACTION", plan, { buildingType: "commercial" }).status).toBe("fail"); // needs 1.6 m
  });

  it("limits height by road width", () => {
    const plan = sampleTwoStoreyPlan();
    plan.site.roads = [{ edgeIndex: 0, widthM: 1 }];
    plan.building.origin = [2, 0.5]; // 2 × (1 + 0.5) = 3 m < 6.2 m
    expect(status("HEIGHT_ROAD", plan).status).toBe("fail");
  });

  it("checks FAR/OSR once a zone is configured", () => {
    const configured: RuleData = { ...rule("BKK_FAR_OSR"), params: { zones: { "ย.3": { far: 1, osrPercent: 40 } } } };
    const r = evaluateRule(configured, { plan: sampleTwoStoreyPlan(), zone: "ย.3" }); // FAR 1.2, OSR 33%
    expect(r.status).toBe("fail");
    expect(r.details).toHaveLength(2);
    const ok: RuleData = { ...configured, params: { zones: { "ย.3": { far: 2.5, osrPercent: 20 } } } };
    expect(evaluateRule(ok, { plan: sampleTwoStoreyPlan(), zone: "ย.3" }).status).toBe("pass");
  });

  it("requires parking for large commercial buildings", () => {
    const plan = sampleTwoStoreyPlan(); // 318 m² indoor, 2 spaces
    expect(status("PARKING_COMMERCIAL", plan, { buildingType: "commercial" }).status).toBe("fail"); // needs 3
  });

  it("reports bad parameters instead of crashing", () => {
    const bad: RuleData = { ...rule("HEIGHT_ROAD"), params: { factor: "two" } };
    expect(evaluateRule(bad, { plan: sampleTwoStoreyPlan() }).status).toBe("warn");
  });

  it("derives the buildable envelope from the rules", () => {
    const plan = sampleTwoStoreyPlan();
    plan.site.roads = [{ edgeIndex: 0, widthM: 4 }];
    const s = envelopeSetbacks(plan.site, NATIONAL_RULES, { floors: 2 });
    expect(s.map((x) => x.distanceM)).toEqual([2, 2, 2, 2]); // opening rule (2 m) dominates the 1 m road rule
    const tall = envelopeSetbacks(plan.site, NATIONAL_RULES, { floors: 3 });
    expect(tall[0].distanceM).toBe(3);
    expect(area(buildableArea({ ...plan.site, setbacks: tall }).polygon)).toBe(10 * 14);
  });

  it("ignores unrelated openings kinds", () => {
    const plan = sampleTwoStoreyPlan();
    plan.levels[0].openings.push(op("passage", "opening", "g-living", 0, 0.2, 1));
    expect(status("OPENING_BOUNDARY", plan).status).toBe("pass");
  });
});
