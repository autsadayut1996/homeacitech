import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { area, validatePlan } from "@/lib/plan-core";
import { AI_OPTION_JSON_SCHEMA, AiOptionSchema, EXTERIOR, compileOption, decompilePlan, type AiOption } from "../format";
import { runDesignLoop, type CallModel, type ModelReply } from "../generate";
import { buildGeneratePrompt, describeSite } from "../prompt";

const sample = sampleTwoStoreyPlan();
const site = sample.site;

function reply(obj: unknown): ModelReply {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  return { content: [{ type: "text", text }], text, stopReason: "end_turn", model: "fake", usage: { input: 1, output: 1, cacheRead: 0 } };
}

/** A model that returns the scripted replies in order and records what it was sent. */
function scripted(replies: unknown[]) {
  const seen: string[] = [];
  const call: CallModel = async (messages) => {
    const last = messages[messages.length - 1];
    seen.push(typeof last.content === "string" ? last.content : JSON.stringify(last.content));
    const next = replies.shift();
    if (next === undefined) throw new Error("no more scripted replies");
    return reply(next);
  };
  return { call, seen };
}

const goodOption = (): AiOption => decompilePlan(sample, { title_th: "ตัวอย่าง", title_en: "Sample" });

describe("compile / decompile", () => {
  it("round-trips the sample plan into a valid plan", () => {
    const opt = goodOption();
    expect(AiOptionSchema.safeParse(opt).success).toBe(true);
    const { plan, issues } = compileOption(opt, site);
    expect(issues).toEqual([]);
    expect(plan.building.origin).toEqual([2, 2]);
    expect(plan.levels.map((l) => l.rooms.length)).toEqual([10, 11]);
    expect(plan.levels[1].elevationM).toBe(3.2);
    const v = validatePlan(plan);
    expect(v.errors).toEqual([]);
    // every door from the sample survives (positions are recomputed on the shared walls)
    expect(plan.levels[0].openings.filter((o) => o.kind !== "window").length).toBe(
      sample.levels[0].openings.filter((o) => o.kind !== "window").length,
    );
  });

  it("snaps coordinates and normalises reversed rectangles", () => {
    const opt = goodOption();
    const r = opt.levels[0].rooms.find((x) => x.id === "g-living")!;
    Object.assign(r, { x0: 12.01, x1: 4.98 });
    const { plan } = compileOption(opt, site);
    const room = plan.levels[0].rooms.find((x) => x.id === "g-living")!;
    expect(room.polygon[0]).toEqual([5, 0]);
    expect(area(room.polygon)).toBe(42);
  });

  it("reports doors between rooms that do not touch, and unknown ids", () => {
    const opt = goodOption();
    opt.levels[0].doors.push({ a: "g-garage", b: "g-kthai", kind: "door", widthM: 0.9 });
    opt.levels[0].doors.push({ a: "nope", b: EXTERIOR, kind: "door", widthM: 0.9 });
    const { issues } = compileOption(opt, site);
    expect(issues.map((i) => i.code).sort()).toEqual(["door_no_shared_wall", "unknown_room_ref"]);
  });

  it("warns about windows on interior sides but allows windows onto outdoor rooms", () => {
    const opt = goodOption();
    opt.levels[0].windows.push({ roomId: "g-bath", side: "left", widthM: 0.6 }); // bath | bedroom
    opt.levels[0].windows.push({ roomId: "g-stair", side: "bottom", widthM: 1 }); // stair | carport (outdoor)
    const { issues, plan } = compileOption(opt, site);
    expect(issues.map((i) => i.code)).toEqual(["window_no_exterior"]);
    expect(plan.levels[0].openings.some((o) => o.host.roomId === "g-stair" && o.kind === "window")).toBe(true);
  });

  it("places an exterior door on the room's longest open side", () => {
    const opt = goodOption();
    opt.levels[0].doors = opt.levels[0].doors.filter((d) => d.b !== EXTERIOR);
    opt.levels[0].doors.push({ a: "g-living", b: EXTERIOR, kind: "door", widthM: 1.2 });
    const { plan } = compileOption(opt, site);
    const d = plan.levels[0].openings.find((o) => o.host.roomId === "g-living" && o.kind === "door")!;
    // living room: bottom (7 m, open) vs right (6 m, open) → bottom
    expect(d.host.edgeIndex).toBe(0);
    expect(d.host.offsetM).toBeCloseTo((7 - 1.2) / 2);
  });
});

describe("JSON schema for structured outputs", () => {
  it("closes every object and requires every key", () => {
    const walk = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        Object.values(s.properties as Record<string, Record<string, unknown>>).forEach(walk);
      }
      if (s.type === "array") walk(s.items as Record<string, unknown>);
    };
    walk(AI_OPTION_JSON_SCHEMA as Record<string, unknown>);
  });
});

describe("prompt", () => {
  it("describes orientation and roads", () => {
    const ctx = describeSite(site);
    expect(ctx.widthM).toBe(12);
    expect(ctx.depthM).toBe(16);
    expect(ctx.sides.bottom.compass).toBe("N");
    expect(ctx.sides.right.compass).toBe("W");
    expect(ctx.sides.bottom.road).toBe(6);
    const p = buildGeneratePrompt(
      {
        land: { shape: "rect", widthM: 16, depthM: 20, frontFacing: "N", roads: [{ side: "front", widthM: 6 }], province: "กรุงเทพมหานคร" },
        requirements: { buildingType: "two_storey", floors: 2, bedrooms: 3, bathrooms: 3, parking: 2, specialRooms: ["shrine"], style: "modern" },
        budgetMin: 4_000_000,
        budgetMax: 5_000_000,
        freeText: "อยากได้บ้านโปร่ง",
      },
      site,
      "balanced",
    );
    expect(p).toContain("x 0–12 m, y 0–16 m");
    expect(p).toContain("bottom side faces N");
    expect(p).toContain("along a 6 m road");
    expect(p).toContain("อยากได้บ้านโปร่ง");
  });
});

describe("runDesignLoop", () => {
  it("returns on the first attempt when the design is valid", async () => {
    const { call } = scripted([goodOption()]);
    const r = await runDesignLoop({ call, userPrompt: "x", site });
    expect(r.validation.ok).toBe(true);
    expect(r.attempts).toHaveLength(1);
  });

  it("feeds validator errors back and accepts the fix", async () => {
    const broken = goodOption();
    broken.levels[0].rooms.find((x) => x.id === "g-living")!.x0 = 4; // overlaps the carport
    const { call, seen } = scripted([broken, goodOption()]);
    const r = await runDesignLoop({ call, userPrompt: "x", site });
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[0].errors.map((e) => e.code)).toContain("room_overlap");
    expect(seen[1]).toContain("room_overlap");
    expect(seen[1]).toContain("g-living");
    expect(r.validation.ok).toBe(true);
    // conversation: user, assistant, user(feedback), assistant
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("recovers from malformed JSON", async () => {
    const { call, seen } = scripted(["{not json", goodOption()]);
    const r = await runDesignLoop({ call, userPrompt: "x", site });
    expect(r.attempts[0].parseError).toBeTruthy();
    expect(seen[1]).toContain("not valid JSON");
    expect(r.validation.ok).toBe(true);
  });

  it("gives up after the max attempts and returns the least-bad design", async () => {
    const worse = goodOption();
    worse.levels[0].rooms.find((x) => x.id === "g-living")!.x0 = 4;
    worse.levels[1].rooms.find((x) => x.id === "u-office")!.x0 = 6;
    const bad = goodOption();
    bad.levels[0].rooms.find((x) => x.id === "g-living")!.x0 = 4;
    const { call } = scripted([worse, bad, worse]);
    const r = await runDesignLoop({ call, userPrompt: "x", site, maxAttempts: 3 });
    expect(r.attempts).toHaveLength(3);
    expect(r.validation.ok).toBe(false);
    expect(r.validation.errors).toHaveLength(1);
  });
});
