import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan, rect } from "../samples";
import { diffPlans } from "../diff";

describe("diffPlans", () => {
  it("finds no changes between identical plans", () => {
    const d = diffPlans(sampleTwoStoreyPlan(), sampleTwoStoreyPlan());
    expect(d.rooms).toEqual([]);
    expect(d.selections).toEqual([]);
  });

  it("classifies added, removed, resized, moved and retyped rooms", () => {
    const a = sampleTwoStoreyPlan();
    const b = sampleTwoStoreyPlan();
    const L = b.levels[0];
    L.rooms.find((r) => r.id === "g-living")!.polygon = rect("", "living", 5, 0, 13, 6).polygon; // resized
    L.rooms.find((r) => r.id === "g-store")!.type = "shrine"; // retyped
    L.rooms = L.rooms.filter((r) => r.id !== "g-bath"); // removed
    L.rooms.push(rect("g-new", "laundry", 12, 10, 14, 12)); // added
    b.levels[1].rooms.find((r) => r.id === "u-walkin")!.polygon = rect("", "walk_in_closet", 5, 3.5, 7.5, 6.5).polygon; // moved
    b.selections = { floor: "FLR-WOOD" };
    const d = diffPlans(a, b);
    const kinds = Object.fromEntries(d.rooms.map((r) => [r.room.id, r.kind]));
    expect(kinds).toEqual({ "g-living": "resized", "g-store": "retyped", "g-new": "added", "g-bath": "removed", "u-walkin": "moved" });
    expect(d.rooms.find((r) => r.room.id === "g-living")).toMatchObject({ areaBefore: 42, areaAfter: 48 });
    expect(d.selections).toEqual([{ slot: "floor", before: undefined, after: "FLR-WOOD" }]);
    expect(d.metrics.after.totalAreaM2 - d.metrics.before.totalAreaM2).toBeCloseTo(6 - 6 + 4);
  });
});
