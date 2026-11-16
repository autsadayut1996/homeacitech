import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { buildScene, type BoxPrim } from "../scene";

describe("buildScene", () => {
  const scene = buildScene(sampleTwoStoreyPlan());
  const boxes = scene.prims.filter((p): p is BoxPrim => p.kind === "box");

  it("creates floors, walls, glass, doors and a roof", () => {
    const count = (m: string) => scene.prims.filter((p) => p.mat === m).length;
    expect(count("floor")).toBe(19); // enclosed rooms: 9 ground + 10 upper
    expect(count("floor_outdoor")).toBe(2); // carport + balcony
    expect(count("ext_wall")).toBeGreaterThan(10);
    expect(count("glass")).toBe(13); // 12 windows + 1 sliding door
    expect(count("door")).toBe(15);
    expect(scene.prims.filter((p) => p.kind === "mesh" && p.mat === "roof")).toHaveLength(1);
    expect(count("railing")).toBeGreaterThan(0);
  });

  it("keeps every box non-degenerate and within the storey height", () => {
    for (const b of boxes) {
      expect(Math.min(...b.size)).toBeGreaterThan(0);
      if (b.roof) continue;
      expect(b.center[1] + b.size[1] / 2).toBeLessThanOrEqual(6.2 + 1e-6);
    }
  });

  it("leaves a gap in the wall for the main door (no solid wall where the door is)", () => {
    // main door on the living room front wall: x 7.9–9.1 (plan), y = 0
    const blocking = boxes.filter(
      (b) =>
        (b.mat === "ext_wall" || b.mat === "int_wall") &&
        b.center[1] - b.size[1] / 2 < 1 && // reaches down to the floor
        Math.abs(b.center[2]) < 0.2 && // on the y = 0 line
        b.center[0] - b.size[0] / 2 < 8.4 &&
        b.center[0] + b.size[0] / 2 > 8.6,
    );
    expect(blocking).toEqual([]);
  });

  it("frames the building", () => {
    expect(scene.bounds.min).toEqual([0, 0, -16]);
    expect(scene.bounds.max[1]).toBeGreaterThan(6.2);
  });
});
