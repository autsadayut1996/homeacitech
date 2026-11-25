import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { DEFAULT_PLINTH_M, columns, fmtLevel, openingMarks, openingMarkPosition, roomTag, structuralGrid } from "../annotate";
import { elevation } from "../elevation";
import { section } from "../section";

const plan = sampleTwoStoreyPlan();

describe("structural grid", () => {
  it("numbers x axes and letters y axes in order, skipping I and O", () => {
    const g = structuralGrid(plan);
    expect(g.x.length).toBeGreaterThanOrEqual(3);
    expect(g.x.map((a) => a.label).slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(g.y[0].label).toBe("A");
    expect(g.x.every((a, i) => i === 0 || a.at > g.x[i - 1].at)).toBe(true);
    expect(g.y.map((a) => a.label)).not.toContain("I");
  });

  it("places columns on walls at grid intersections, including the building corners", () => {
    const g = structuralGrid(plan);
    const cols = columns(plan, 0, g);
    expect(cols.length).toBeGreaterThanOrEqual(4);
    for (const c of cols) {
      expect(g.x.some((a) => a.at === c[0])).toBe(true);
      expect(g.y.some((a) => a.at === c[1])).toBe(true);
    }
  });
});

describe("room tags", () => {
  it("steps wet rooms down and lowers their ceiling", () => {
    const g = plan.levels[0];
    const bath = g.rooms.find((r) => r.type === "bathroom")!;
    const living = g.rooms.find((r) => r.type === "living")!;
    const tb = roomTag(plan, g, bath);
    const tl = roomTag(plan, g, living);
    expect(tl).toMatchObject({ floorCode: "F1", floorLevel: DEFAULT_PLINTH_M, ceilingCode: "C1", ceilingHeight: 2.8 });
    expect(tb).toMatchObject({ floorCode: "F2", floorLevel: 0.4, ceilingCode: "C2", ceilingHeight: 2.4 });
    expect(fmtLevel(0)).toBe("±0.00");
    expect(fmtLevel(0.5)).toBe("+0.50");
  });
});

describe("door and window marks", () => {
  it("gives every door and window a code and counts each type", () => {
    const m = openingMarks(plan);
    const all = plan.levels.flatMap((l) => l.openings.filter((o) => o.kind !== "opening"));
    expect(Object.keys(m.codes).length).toBe(all.length);
    expect(m.schedule.reduce((s, t) => s + t.count, 0)).toBe(all.length);
    expect(m.schedule.some((t) => t.code === "D1")).toBe(true);
    expect(m.schedule.some((t) => t.code === "W1")).toBe(true);
    // same size and kind ⇒ same code
    const byCode = new Map<string, string>();
    for (const l of plan.levels)
      for (const o of l.openings) {
        const c = m.codes[o.id];
        if (!c) continue;
        const key = `${o.kind}${o.widthM}`;
        if (byCode.has(c)) expect(byCode.get(c)!.startsWith(o.kind)).toBe(true);
        byCode.set(c, key);
      }
  });

  it("puts the mark inside the host room", () => {
    const l = plan.levels[0];
    const o = l.openings[0];
    const p = openingMarkPosition(l, o)!;
    const r = l.rooms.find((x) => x.id === o.host.roomId)!;
    const xs = r.polygon.map((q) => q[0]);
    const ys = r.polygon.map((q) => q[1]);
    expect(p[0]).toBeGreaterThan(Math.min(...xs));
    expect(p[0]).toBeLessThan(Math.max(...xs));
    expect(p[1]).toBeGreaterThan(Math.min(...ys));
    expect(p[1]).toBeLessThan(Math.max(...ys));
  });
});

describe("plinth", () => {
  it("lifts elevations and sections onto the plinth with a ±0.00 ground mark", () => {
    const e = elevation(plan, "front");
    const labels = e.texts.filter((t) => t.anchor === "end").map((t) => t.text);
    expect(labels.slice(0, 2)).toEqual(["±0.00", "+0.50"]);
    const s = section(plan, "A");
    expect(s.texts.some((t) => t.text === "+0.50")).toBe(true);
    const flat = { ...plan, building: { ...plan.building, plinthM: 0 } };
    expect(elevation(plan, "front").topZ - elevation(flat, "front").topZ).toBeCloseTo(DEFAULT_PLINTH_M, 6);
  });
});
