import { z } from "zod";
import { FACING_BEARING, northAngleForFrontFacing, sqWaToSqm, type Facing, type Site } from "./plan-core";
import { area } from "./plan-core/geometry";
import { envelopeSetbacks, type RuleData } from "./compliance/rules";

export const FACINGS = Object.keys(FACING_BEARING) as Facing[];
export const ROAD_SIDES = ["front", "right", "back", "left"] as const;
export type RoadSide = (typeof ROAD_SIDES)[number];

export const BUILDING_TYPES = ["single_storey", "two_storey", "three_plus", "pool_villa", "commercial", "home_office"] as const;
export const STYLES = ["modern", "minimal", "nordic", "loft", "thai_contemporary", "tropical", "luxury", "japanese"] as const;
export const SPECIAL_ROOMS = [
  "shrine",
  "office",
  "maid_room",
  "pool",
  "kitchen_thai",
  "kitchen",
  "shop",
  "walk_in_closet",
  "laundry",
  "storage",
  "multipurpose",
  "elderly_bedroom",
] as const;

const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().finite().optional());
const reqNum = (min = 0) => z.preprocess((v) => (v === "" ? undefined : Number(v)), z.number().finite().min(min));

export const LandSchema = z
  .object({
    shape: z.enum(["rect", "irregular"]),
    widthM: optNum,
    depthM: optNum,
    /** Irregular plots: corner coordinates in metres, edge 0 = front. */
    corners: z.array(z.tuple([z.number(), z.number()])).optional(),
    /** Title-deed area (ตร.วา). If blank it is computed from the shape. */
    areaSqWa: optNum,
    frontFacing: z.enum(FACINGS as [Facing, ...Facing[]]),
    roads: z.array(z.object({ side: z.union([z.enum(ROAD_SIDES), z.number().int().min(0)]), widthM: reqNum(1) })).min(1),
    province: z.string().min(1),
    district: z.string().optional(),
    /** Land-use zone of the comprehensive plan (e.g. "ย.3"), used for FAR/OSR. */
    zone: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.shape === "rect" && (!v.widthM || !v.depthM)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["widthM"], message: "width_depth_required" });
    }
    if (v.shape === "irregular" && (!v.corners || v.corners.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["corners"], message: "corners_required" });
    }
  });
export type Land = z.infer<typeof LandSchema>;

export const RequirementsSchema = z.object({
  buildingType: z.enum(BUILDING_TYPES),
  floors: reqNum(1),
  bedrooms: reqNum(0),
  bathrooms: reqNum(0),
  parking: reqNum(0),
  specialRooms: z.array(z.enum(SPECIAL_ROOMS)).default([]),
  targetAreaM2: optNum,
  style: z.enum(STYLES),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

export const BriefInputSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(1),
      phone: z.string().trim().optional(),
      email: z.union([z.string().trim().email(), z.literal("")]).optional(),
      note: z.string().optional(),
    }),
    land: LandSchema,
    requirements: RequirementsSchema,
    budgetMin: optNum,
    budgetMax: optNum,
    freeText: z.string().optional(),
  })
  .refine((v) => v.budgetMin === undefined || v.budgetMax === undefined || v.budgetMin <= v.budgetMax, {
    path: ["budgetMax"],
    message: "budget_range",
  });
export type BriefInput = z.infer<typeof BriefInputSchema>;

/** Plot corners (CCW, edge 0 = front along +x). */
export function landBoundary(land: Land): [number, number][] {
  if (land.shape === "irregular" && land.corners) return land.corners;
  const w = land.widthM ?? 0;
  const d = land.depthM ?? 0;
  return [[0, 0], [w, 0], [w, d], [0, d]];
}

const SIDE_EDGE: Record<RoadSide, number> = { front: 0, right: 1, back: 2, left: 3 };

/** Used only when no regulation rules are available for the plot. */
export const PROVISIONAL_SETBACK_M = 2;

/**
 * Site for a plot. With `rules`, setbacks are the regulation envelope (opening distance on every
 * side, plus road setbacks); without, a provisional 2 m on every side.
 */
export function siteFromLand(land: Land, rules?: RuleData[], opts: { floors?: number; buildingType?: string } = {}): Site {
  const boundary = landBoundary(land);
  const site: Site = {
    boundary,
    northAngleDeg: northAngleForFrontFacing(land.frontFacing),
    roads: land.roads.map((r) => ({ edgeIndex: typeof r.side === "number" ? r.side : SIDE_EDGE[r.side], widthM: r.widthM })),
    setbacks: boundary.map((_, edgeIndex) => ({ edgeIndex, distanceM: PROVISIONAL_SETBACK_M })),
  };
  if (rules?.length) site.setbacks = envelopeSetbacks(site, rules, { floors: opts.floors ?? 2, buildingType: opts.buildingType });
  return site;
}

export function landAreaSqWa(land: Land): { sqwa: number; fromShape: number } {
  const fromShape = area(landBoundary(land)) / 4;
  return { sqwa: land.areaSqWa ?? fromShape, fromShape };
}

export { sqWaToSqm };
