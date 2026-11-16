import { describe, expect, it } from "vitest";
import { computeMetrics } from "../metrics";
import { rect, op, sampleTwoStoreyPlan } from "../samples";
import { deriveWalls, wallLength } from "../walls";
import { validatePlan, type IssueCode } from "../validator";
import { describeIssue, issuesForPrompt } from "../messages";
import type { Plan } from "../schema";

const codes = (plan: unknown) => {
  const r = validatePlan(plan);
  return { errors: r.errors.map((e) => e.code), warnings: r.warnings.map((w) => w.code), ok: r.ok };
};
const clone = (): Plan => structuredClone(sampleTwoStoreyPlan());

describe("sample plan", () => {
  it("passes validation with only the expected plumbing warning", () => {
    const r = codes(sampleTwoStoreyPlan());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(["wet_not_stacked"]); // master bath sits above the living room
  });

  it("computes metrics", () => {
    const m = computeMetrics(sampleTwoStoreyPlan());
    expect(m.landAreaM2).toBe(320);
    expect(m.landAreaSqWa).toBe(80);
    expect(m.levels[0].totalAreaM2).toBe(192);
    expect(m.levels[0].outdoorAreaM2).toBe(30);
    expect(m.levels[1].outdoorAreaM2).toBe(36);
    expect(m.totalAreaM2).toBe(384);
    expect(m.indoorAreaM2).toBe(318);
    expect(m.footprintM2).toBe(192);
    expect(m.openSpaceM2).toBe(128);
    expect(m.far).toBeCloseTo(1.2);
    expect(m.osrPercent).toBeCloseTo(33.33, 1);
    expect(m.bedrooms).toBe(3);
    expect(m.bathrooms).toBe(3);
    expect(m.parkingSpaces).toBe(2);
  });
});

describe("walls", () => {
  it("derives exterior and interior walls from rooms", () => {
    const plan: Plan = {
      ...clone(),
      levels: [
        {
          id: "L1",
          name: { th: "", en: "" },
          elevationM: 0,
          floorToFloorM: 3,
          rooms: [rect("a", "living", 0, 0, 4, 4), rect("b", "bedroom", 4, 0, 8, 4), rect("c", "terrace", 0, 4, 8, 6)],
          openings: [],
        },
      ],
    };
    const walls = deriveWalls(plan, plan.levels[0]);
    const ext = walls.filter((w) => w.kind === "exterior").reduce((s, w) => s + wallLength(w), 0);
    const int = walls.filter((w) => w.kind === "interior").reduce((s, w) => s + wallLength(w), 0);
    expect(ext).toBe(8 + 4 + 4 + 8); // perimeter of the enclosed 8×4 block, incl. the wall facing the terrace
    expect(int).toBe(4);
    // terrace edges facing open air produce no walls
    expect(walls.every((w) => w.roomIds.some((id) => id !== "c"))).toBe(true);
  });
});

describe("validator — errors", () => {
  const expectError = (plan: unknown, code: IssueCode) => {
    const r = codes(plan);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain(code);
  };

  it("rejects schema problems", () => {
    const p = clone() as unknown as { levels: unknown[] };
    p.levels = [];
    expectError(p, "schema");
  });

  it("rejects overlapping rooms", () => {
    const p = clone();
    p.levels[0].rooms.find((r) => r.id === "g-living")!.polygon = [[4, 0], [12, 0], [12, 6], [4, 6]];
    expectError(p, "room_overlap");
  });

  it("rejects rooms in the setback", () => {
    const p = clone();
    p.building.origin = [1, 2];
    expectError(p, "room_outside_buildable");
  });

  it("rejects undersized and narrow rooms", () => {
    const p = clone();
    p.levels[0].rooms.push(rect("tiny", "bedroom", 0, 16, 2, 17));
    const r = codes(p);
    expect(r.errors).toContain("room_too_small");
    expect(r.errors).toContain("room_too_narrow");
  });

  it("rejects non-rectilinear rooms", () => {
    const p = clone();
    p.levels[0].rooms.find((r) => r.id === "g-store")!.polygon = [[4, 13], [6, 13], [5, 16]];
    expectError(p, "room_not_rectilinear");
  });

  it("rejects rooms without access", () => {
    const p = clone();
    p.levels[0].openings = p.levels[0].openings.filter((o) => o.id !== "g-d-bed");
    const r = validatePlan(p);
    expect(r.errors.find((e) => e.code === "room_unreachable")?.roomIds).toEqual(["g-bed"]);
  });

  it("rejects an upper level with no stair, or a misaligned stair", () => {
    const p = clone();
    p.levels[1].rooms.find((r) => r.id === "u-stair")!.stairLinkId = "OTHER";
    expectError(p, "stair_missing");

    const q = clone();
    const s = q.levels[1].rooms.find((r) => r.id === "u-stair")!;
    const h = q.levels[1].rooms.find((r) => r.id === "u-hall")!;
    // swap stair and hall footprints
    [s.polygon, h.polygon] = [h.polygon, s.polygon];
    expectError(q, "stair_misaligned");
  });

  it("rejects openings that do not fit their wall", () => {
    const p = clone();
    p.levels[0].openings.push(op("bad", "window", "g-bath", 0, 1.5, 1));
    expectError(p, "opening_off_edge");
    const q = clone();
    q.levels[0].openings.push(op("bad", "window", "nope", 0, 0, 1));
    expectError(q, "opening_bad_host");
  });

  it("rejects duplicate ids", () => {
    const p = clone();
    p.levels[1].rooms[0].id = "g-living";
    expectError(p, "duplicate_id");
  });
});

describe("validator — warnings", () => {
  it("warns about west-facing bedrooms", () => {
    const p = clone();
    p.site.northAngleDeg = 0; // now +x faces east and -x faces west
    expect(codes(p).warnings).toContain("bedroom_west");
  });

  it("warns about rooms without daylight and interior windows", () => {
    const p = clone();
    p.levels[0].openings = p.levels[0].openings.filter((o) => !o.id.startsWith("g-w-bed"));
    p.levels[0].openings.push(op("g-w-int", "window", "g-bath", 3, 0.5, 0.6)); // bath ↔ bedroom wall
    const w = codes(p).warnings;
    expect(w).toContain("no_daylight");
    expect(w).toContain("window_on_interior_wall");
  });
});

describe("messages", () => {
  it("renders Thai and English text and a prompt list", () => {
    const r = validatePlan({ ...clone(), building: { origin: [1, 2], rotationDeg: 0 } });
    const issue = r.errors[0];
    expect(describeIssue(issue, "th")).toMatch(/ระยะร่น/);
    expect(describeIssue(issue, "en")).toMatch(/setback/);
    expect(issuesForPrompt(r.errors)).toMatch(/room_outside_buildable/);
  });
});
