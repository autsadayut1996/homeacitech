/**
 * The compact format the AI reads and writes, and the compiler between it and Plan JSON.
 *
 * The AI only decides the layout: room rectangles + which rooms connect + which sides get
 * windows. Exact door/window positions are computed here, on real shared/exterior walls,
 * so the model never has to do edge-offset arithmetic.
 */
import { z } from "zod";
import {
  type Issue,
  type Level,
  type Opening,
  type Plan,
  type Room,
  type Site,
  ROOM_TYPES,
  ROOM_TYPE_INFO,
  bbox,
  buildableArea,
  roomAcross,
} from "@/lib/plan-core";

export const SIDES = ["bottom", "right", "top", "left"] as const;
export type Side = (typeof SIDES)[number];
const SIDE_EDGE: Record<Side, number> = { bottom: 0, right: 1, top: 2, left: 3 };
export const EXTERIOR = "EXTERIOR";

export const AiRoomSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ROOM_TYPES),
  name_th: z.string().nullable(),
  name_en: z.string().nullable(),
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
  stairLinkId: z.string().nullable(),
});
export const AiDoorSchema = z.object({
  a: z.string(),
  b: z.string(),
  kind: z.enum(["door", "sliding_door", "opening"]),
  widthM: z.number(),
});
export const AiWindowSchema = z.object({ roomId: z.string(), side: z.enum(SIDES), widthM: z.number() });
export const AiLevelSchema = z.object({
  name_th: z.string(),
  name_en: z.string(),
  floorToFloorM: z.number(),
  rooms: z.array(AiRoomSchema),
  doors: z.array(AiDoorSchema),
  windows: z.array(AiWindowSchema),
});
export const AiOptionSchema = z.object({
  title_th: z.string(),
  title_en: z.string(),
  concept_th: z.string(),
  concept_en: z.string(),
  pros_th: z.array(z.string()),
  cons_th: z.array(z.string()),
  pros_en: z.array(z.string()),
  cons_en: z.array(z.string()),
  levels: z.array(AiLevelSchema).min(1),
  roof: z.object({
    type: z.enum(["hip", "gable", "flat", "shed", "butterfly"]),
    pitchDeg: z.number(),
    overhangM: z.number(),
  }),
});
export type AiOption = z.infer<typeof AiOptionSchema>;
export type AiLevel = z.infer<typeof AiLevelSchema>;

// ---- JSON Schema sent to the API (structured outputs: every object closed, all keys required) ----
const str = { type: "string" };
const num = { type: "number" };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const AI_OPTION_JSON_SCHEMA = obj({
  title_th: str,
  title_en: str,
  concept_th: str,
  concept_en: str,
  pros_th: { type: "array", items: str },
  cons_th: { type: "array", items: str },
  pros_en: { type: "array", items: str },
  cons_en: { type: "array", items: str },
  levels: {
    type: "array",
    items: obj({
      name_th: str,
      name_en: str,
      floorToFloorM: num,
      rooms: {
        type: "array",
        items: obj({
          id: str,
          type: { type: "string", enum: [...ROOM_TYPES] },
          name_th: nullableStr,
          name_en: nullableStr,
          x0: num,
          y0: num,
          x1: num,
          y1: num,
          stairLinkId: nullableStr,
        }),
      },
      doors: {
        type: "array",
        items: obj({ a: str, b: str, kind: { type: "string", enum: ["door", "sliding_door", "opening"] }, widthM: num }),
      },
      windows: {
        type: "array",
        items: obj({ roomId: str, side: { type: "string", enum: [...SIDES] }, widthM: num }),
      },
    }),
  },
  roof: obj({ type: { type: "string", enum: ["hip", "gable", "flat", "shed", "butterfly"] }, pitchDeg: num, overhangM: num }),
});

// ---- geometry helpers ----------------------------------------------------------

const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const r2 = (v: number) => Math.round(v * 1000) / 1000;

type Interval = [number, number];

function subtract(base: Interval, cuts: Interval[]): Interval[] {
  let out: Interval[] = [base];
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]) => {
      if (c1 <= a + 1e-6 || c0 >= b - 1e-6) return [[a, b] as Interval];
      const parts: Interval[] = [];
      if (c0 > a + 1e-6) parts.push([a, c0]);
      if (c1 < b - 1e-6) parts.push([c1, b]);
      return parts;
    });
  }
  return out;
}

interface RectRoom {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  outdoor: boolean;
}

/** Interval (in the side's own axis) of a room side, and the fixed coordinate of that side. */
function sideLine(r: RectRoom, side: Side): { fixed: number; span: Interval; axis: "x" | "y" } {
  switch (side) {
    case "bottom":
      return { fixed: r.y0, span: [r.x0, r.x1], axis: "x" };
    case "top":
      return { fixed: r.y1, span: [r.x0, r.x1], axis: "x" };
    case "left":
      return { fixed: r.x0, span: [r.y0, r.y1], axis: "y" };
    case "right":
      return { fixed: r.x1, span: [r.y0, r.y1], axis: "y" };
  }
}

const OPPOSITE: Record<Side, Side> = { bottom: "top", top: "bottom", left: "right", right: "left" };

/** Portion of `r`'s side that touches `other` (rooms on opposite sides of the same line). */
function sharedSpan(r: RectRoom, side: Side, other: RectRoom): Interval | null {
  const a = sideLine(r, side);
  const b = sideLine(other, OPPOSITE[side]);
  if (Math.abs(a.fixed - b.fixed) > 1e-3) return null;
  const lo = Math.max(a.span[0], b.span[0]);
  const hi = Math.min(a.span[1], b.span[1]);
  return hi - lo > 1e-3 ? [lo, hi] : null;
}

/** Offset along the CCW edge for a span on the given side (see samples.rect edge order). */
function edgeOffset(r: RectRoom, side: Side, start: number, width: number): number {
  switch (side) {
    case "bottom":
      return start - r.x0;
    case "right":
      return start - r.y0;
    case "top":
      return r.x1 - (start + width);
    case "left":
      return r.y1 - (start + width);
  }
}

function longest(intervals: Interval[]): Interval | null {
  return intervals.reduce<Interval | null>((best, iv) => (!best || iv[1] - iv[0] > best[1] - best[0] ? iv : best), null);
}

// ---- compile: AI option → Plan --------------------------------------------------

export interface CompileResult {
  plan: Plan;
  /** Problems found while placing doors/windows (fed back to the AI like validator errors). */
  issues: Issue[];
}

/**
 * AI coordinates are relative to the building origin, which defaults to the lower-left corner
 * of the buildable area (pass the existing origin when re-compiling an edited plan).
 */
export function compileOption(
  opt: AiOption,
  site: Site,
  { specPackage = "standard", origin }: { specPackage?: Plan["specPackage"]; origin?: [number, number] } = {},
): CompileResult {
  const issues: Issue[] = [];
  const bb = bbox(buildableArea(site).polygon.length ? buildableArea(site).polygon : site.boundary);
  const buildingOrigin: [number, number] = origin ?? [r2(bb.minX), r2(bb.minY)];
  let elevation = 0;

  const levels: Level[] = opt.levels.map((al, li) => {
    const levelId = `L${li + 1}`;
    const rects: RectRoom[] = al.rooms.map((r) => ({
      id: r.id,
      x0: snap(Math.min(r.x0, r.x1)),
      y0: snap(Math.min(r.y0, r.y1)),
      x1: snap(Math.max(r.x0, r.x1)),
      y1: snap(Math.max(r.y0, r.y1)),
      outdoor: ROOM_TYPE_INFO[r.type].outdoor,
    }));
    const byId = new Map(rects.map((r) => [r.id, r]));
    const rooms: Room[] = al.rooms.map((r, i) => {
      const q = rects[i];
      const room: Room = {
        id: r.id,
        type: r.type,
        polygon: [
          [r2(q.x0), r2(q.y0)],
          [r2(q.x1), r2(q.y0)],
          [r2(q.x1), r2(q.y1)],
          [r2(q.x0), r2(q.y1)],
        ],
      };
      if (r.name_th || r.name_en) room.name = { th: r.name_th ?? r.name_en ?? "", en: r.name_en ?? r.name_th ?? "" };
      if (r.type === "stair") room.stairLinkId = r.stairLinkId ?? "S1";
      return room;
    });

    const openings: Opening[] = [];
    const place = (room: RectRoom, side: Side, span: Interval, wanted: number, kind: Opening["kind"], margin: number) => {
      const len = span[1] - span[0];
      const width = snap(Math.min(wanted, len - 2 * margin));
      if (width < 0.5) return false;
      const start = snap(span[0] + (len - width) / 2);
      const offsetM = r2(edgeOffset(room, side, start, width));
      const isWindow = kind === "window";
      openings.push({
        id: `${levelId}-o${openings.length + 1}`,
        kind,
        host: { roomId: room.id, edgeIndex: SIDE_EDGE[side], offsetM: Math.max(0, offsetM) },
        widthM: r2(width),
        heightM: isWindow ? 1.2 : 2.1,
        sillM: isWindow ? 0.9 : 0,
      });
      return true;
    };

    for (const d of al.doors) {
      const a = byId.get(d.a);
      const bId = d.b;
      if (!a || (bId !== EXTERIOR && !byId.get(bId))) {
        issues.push({ code: "unknown_room_ref", severity: "error", levelId, params: { ref: !a ? d.a : bId } });
        continue;
      }
      if (bId === EXTERIOR) {
        // longest stretch of a's perimeter with nothing on the other side; prefer the front
        let best: { side: Side; span: Interval } | null = null;
        for (const side of SIDES) {
          const line = sideLine(a, side);
          const cuts = rects.filter((o) => o.id !== a.id).map((o) => sharedSpan(a, side, o)).filter((x): x is Interval => !!x);
          const iv = longest(subtract(line.span, cuts));
          if (iv && (!best || iv[1] - iv[0] > best.span[1] - best.span[0] + 0.5)) best = { side, span: iv };
        }
        if (!best || !place(a, best.side, best.span, d.widthM, d.kind, 0.15)) {
          issues.push({ code: "door_no_shared_wall", severity: "error", levelId, roomIds: [a.id], params: { other: EXTERIOR } });
        }
        continue;
      }
      const b = byId.get(bId)!;
      let done = false;
      for (const side of SIDES) {
        const span = sharedSpan(a, side, b);
        if (span && place(a, side, span, d.widthM, d.kind, 0.1)) {
          done = true;
          break;
        }
      }
      if (!done) issues.push({ code: "door_no_shared_wall", severity: "error", levelId, roomIds: [a.id, b.id], params: { other: b.id } });
    }

    for (const w of al.windows) {
      const room = byId.get(w.roomId);
      if (!room) {
        issues.push({ code: "unknown_room_ref", severity: "error", levelId, params: { ref: w.roomId } });
        continue;
      }
      const line = sideLine(room, w.side);
      // a window may face open air or an outdoor room (terrace, balcony, carport), not another enclosed room
      const cuts = rects.filter((o) => o.id !== room.id && !o.outdoor).map((o) => sharedSpan(room, w.side, o)).filter((x): x is Interval => !!x);
      const iv = longest(subtract(line.span, cuts));
      if (!iv || !place(room, w.side, iv, w.widthM, "window", 0.15)) {
        issues.push({ code: "window_no_exterior", severity: "warning", levelId, roomIds: [room.id], params: { side: w.side } });
      }
    }

    const level: Level = {
      id: levelId,
      name: { th: al.name_th, en: al.name_en },
      elevationM: r2(elevation),
      floorToFloorM: al.floorToFloorM > 2.4 && al.floorToFloorM < 6 ? al.floorToFloorM : 3,
      rooms,
      openings,
    };
    elevation += level.floorToFloorM;
    return level;
  });

  const plan: Plan = {
    schemaVersion: 1,
    units: "m",
    site,
    building: { origin: buildingOrigin, rotationDeg: 0 },
    levels,
    roof: {
      type: opt.roof.type,
      pitchDeg: Math.min(60, Math.max(0, opt.roof.pitchDeg)),
      overhangM: Math.max(0, opt.roof.overhangM),
    },
    wallSpec: { exteriorThicknessM: 0.15, interiorThicknessM: 0.1 },
    specPackage,
    selections: {},
    meta: { generatedBy: "ai", title: opt.title_th, rationale: opt.concept_th },
  };
  return { plan, issues };
}

// ---- decompile: Plan → AI option (for natural-language edits) ------------------

export function decompilePlan(plan: Plan, summary?: Partial<AiOption>): AiOption {
  const levels: AiLevel[] = plan.levels.map((level) => {
    const doors: AiLevel["doors"] = [];
    const windows: AiLevel["windows"] = [];
    const byId = new Map(level.rooms.map((r) => [r.id, r]));
    for (const o of level.openings) {
      const room = byId.get(o.host.roomId);
      if (!room) continue;
      const side = SIDES[o.host.edgeIndex] ?? "bottom";
      if (o.kind === "window") {
        windows.push({ roomId: room.id, side, widthM: o.widthM });
        continue;
      }
      const across = roomAcross(level, room, o.host.edgeIndex, o.host.offsetM + o.widthM / 2);
      doors.push({ a: room.id, b: across?.id ?? EXTERIOR, kind: o.kind, widthM: o.widthM });
    }
    return {
      name_th: level.name.th,
      name_en: level.name.en,
      floorToFloorM: level.floorToFloorM,
      rooms: level.rooms.map((r) => {
        const b = bbox(r.polygon);
        return {
          id: r.id,
          type: r.type,
          name_th: r.name?.th ?? null,
          name_en: r.name?.en ?? null,
          x0: b.minX,
          y0: b.minY,
          x1: b.maxX,
          y1: b.maxY,
          stairLinkId: r.stairLinkId ?? null,
        };
      }),
      doors,
      windows,
    };
  });
  return {
    title_th: summary?.title_th ?? plan.meta.title ?? "",
    title_en: summary?.title_en ?? "",
    concept_th: summary?.concept_th ?? plan.meta.rationale ?? "",
    concept_en: summary?.concept_en ?? "",
    pros_th: summary?.pros_th ?? [],
    cons_th: summary?.cons_th ?? [],
    pros_en: summary?.pros_en ?? [],
    cons_en: summary?.cons_en ?? [],
    levels,
    roof: { type: plan.roof.type, pitchDeg: plan.roof.pitchDeg, overhangM: plan.roof.overhangM },
  };
}
