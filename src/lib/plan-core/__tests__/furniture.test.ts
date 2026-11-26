import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "../samples";
import { furniture, openingSymbols } from "../furniture";
import { pointInPolygonInclusive } from "../geometry";

const plan = sampleTwoStoreyPlan();

describe("drafting symbols", () => {
  it("draws a leaf and a swing arc for every hinged door, glazing for every window", () => {
    for (const level of plan.levels) {
      const shapes = openingSymbols(plan, level);
      const doors = level.openings.filter((o) => o.kind === "door");
      const windows = level.openings.filter((o) => o.kind === "window");
      expect(shapes.length).toBeGreaterThanOrEqual(doors.length * 2 + windows.length * 6);
    }
  });

  it("swings doors into their host room", () => {
    const level = plan.levels[0];
    const door = level.openings.find((o) => o.kind === "door" && o.widthM <= 1.1)!;
    const room = level.rooms.find((r) => r.id === door.host.roomId)!;
    const arc = openingSymbols(plan, level).find((s) => s.kind === "poly" && s.pts.length > 5 && s.pts.every((p) => pointInPolygonInclusive(p, room.polygon, 0.15)));
    expect(arc).toBeTruthy();
  });

  it("furnishes bedrooms, bathrooms, kitchen and carport, all inside their rooms", () => {
    for (const level of plan.levels) {
      const shapes = furniture(plan, level);
      for (const r of level.rooms.filter((x) => ["master_bedroom", "bedroom", "bathroom", "kitchen", "garage", "living"].includes(x.type))) {
        const inRoom = shapes.filter((s) => (s.kind === "circle" ? [s.c] : s.pts).every((p) => pointInPolygonInclusive(p, r.polygon, 0.02)));
        expect(inRoom.length, `${level.id}/${r.type}`).toBeGreaterThan(0);
      }
    }
  });
});
