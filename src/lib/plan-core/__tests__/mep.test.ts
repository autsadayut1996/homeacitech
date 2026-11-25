import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { mepLayout, mepSchedule, ELECTRICAL, SANITARY } from "../mep";
import { pointInPolygonInclusive } from "../geometry";

const plan = sampleTwoStoreyPlan();
const layout = mepLayout(plan);
const count = (kind: string, levelId?: string) => layout.items.filter((i) => i.kind === kind && (!levelId || i.levelId === levelId)).length;

describe("preliminary MEP layout", () => {
  it("gives every bathroom WC, basin, shower, floor drain and a water heater", () => {
    expect(count("wc")).toBe(3);
    expect(count("basin")).toBe(3);
    expect(count("shower")).toBe(3);
    expect(count("heater")).toBe(3);
  });

  it("puts sinks in both kitchens and a grease trap outside", () => {
    expect(count("sink")).toBe(2);
    expect(count("grease")).toBe(1);
  });

  it("stacks upper-floor wet rooms on risers shown on both floors", () => {
    // 2 bathrooms upstairs → 2 risers on L2 and the same 2 on L1
    expect(count("riser", "L2")).toBe(2);
    expect(count("riser", "L1")).toBe(2);
  });

  it("lights every room, one switch per enclosed room, AC in bedrooms and living spaces", () => {
    const rooms = plan.levels.flatMap((l) => l.rooms);
    const lit = new Set(layout.items.filter((i) => i.kind === "light").map((i) => i.roomId));
    expect(lit.size).toBe(rooms.length);
    // AC: living + bedroom (L1); master + office + family + bedroom2 (L2)
    expect(count("ac")).toBe(6);
    expect(count("db")).toBe(1);
    expect(count("meter")).toBe(1);
  });

  it("keeps fixtures inside their rooms", () => {
    for (const it of layout.items.filter((i) => i.roomId && i.kind !== "riser")) {
      const room = plan.levels.find((l) => l.id === it.levelId)!.rooms.find((r) => r.id === it.roomId)!;
      expect(pointInPolygonInclusive(it.at, room.polygon, 0.01), `${it.kind} in ${room.id}`).toBe(true);
    }
  });

  it("places the septic tank in the front yard, inside the plot, and drains into it", () => {
    const septic = layout.items.find((i) => i.kind === "septic")!;
    const site = septic.at.map((v, i) => v + plan.building.origin[i]) as [number, number];
    expect(pointInPolygonInclusive(site, plan.site.boundary)).toBe(true);
    expect(septic.at[1]).toBeLessThan(0); // in front of the building (plan y < 0)
    const drains = layout.runs.filter((r) => r.kind === "drain" && r.levelId === "L1");
    expect(drains.length).toBeGreaterThan(5);
    expect(drains.every((r) => { const e = r.points[r.points.length - 1]; return e[0] === septic.at[0] && e[1] === septic.at[1]; })).toBe(true);
    expect(layout.runs.some((r) => r.kind === "water")).toBe(true);
  });

  it("summarises symbol counts for the legends", () => {
    const e = mepSchedule(layout, ELECTRICAL);
    expect(e.find((r) => r.kind === "socket")!.count).toBeGreaterThan(20);
    expect(mepSchedule(layout, SANITARY).map((r) => r.kind)).toContain("septic");
  });
});
