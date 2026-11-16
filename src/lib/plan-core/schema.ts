import { z } from "zod";

/**
 * Plan JSON — the single source of truth.
 * 2D editor, 3D viewer, BOQ, compliance checks, PDF and (phase 2) DXF all read this.
 *
 * Conventions
 * - Units: metres. Frame: x to the right, y up (away from the front of the plot).
 * - Room polygons are drawn on WALL CENTRELINES, so neighbouring rooms share edges exactly.
 * - Rooms are rectilinear (axis-aligned) in plan coordinates; `building.rotationDeg`
 *   rotates the whole building on the site if needed.
 * - Openings are anchored to a room edge (edge i = polygon[i] → polygon[i+1]) so they
 *   move with the room while editing.
 */

const num = z.number().finite();
export const PointSchema = z.tuple([num, num]);

export const ROOM_TYPES = [
  "living",
  "dining",
  "kitchen",
  "kitchen_thai",
  "master_bedroom",
  "bedroom",
  "bathroom",
  "shrine",
  "office",
  "maid_room",
  "laundry",
  "storage",
  "walk_in_closet",
  "multipurpose",
  "foyer",
  "corridor",
  "stair",
  "garage",
  "terrace",
  "balcony",
  "pool",
  "shop",
  "meeting",
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const OPENING_KINDS = ["door", "sliding_door", "window", "opening"] as const;

export const RoomSchema = z.object({
  id: z.string().min(1),
  type: RoomTypeSchema,
  name: z.object({ th: z.string(), en: z.string() }).optional(),
  polygon: z.array(PointSchema).min(3),
  ceilingHeightM: num.positive().optional(),
  /** Same id on consecutive levels = one continuous stair (only for type "stair"). */
  stairLinkId: z.string().optional(),
  finishes: z
    .object({ floor: z.string().optional(), wall: z.string().optional(), ceiling: z.string().optional() })
    .optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const OpeningSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(OPENING_KINDS),
  host: z.object({ roomId: z.string(), edgeIndex: z.number().int().min(0), offsetM: num.min(0) }),
  widthM: num.positive(),
  heightM: num.positive().optional(),
  sillM: num.min(0).optional(),
  productRef: z.string().optional(),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const LevelSchema = z.object({
  id: z.string().min(1),
  name: z.object({ th: z.string(), en: z.string() }),
  elevationM: num,
  floorToFloorM: num.positive(),
  rooms: z.array(RoomSchema),
  openings: z.array(OpeningSchema),
});
export type Level = z.infer<typeof LevelSchema>;

export const SiteSchema = z.object({
  /** Plot corners, counter-clockwise preferred. Edge 0 is conventionally the front. */
  boundary: z.array(PointSchema).min(3),
  /** Rotation (clockwise, degrees) from the +y axis to true north. 0 ⇒ +y points north. */
  northAngleDeg: num,
  roads: z.array(z.object({ edgeIndex: z.number().int().min(0), widthM: num.positive() })),
  /** Required clear distance from each boundary edge (computed by the rules engine). */
  setbacks: z.array(z.object({ edgeIndex: z.number().int().min(0), distanceM: num.min(0) })),
});
export type Site = z.infer<typeof SiteSchema>;

export const PlanSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.literal("m"),
  site: SiteSchema,
  building: z.object({ origin: PointSchema, rotationDeg: num }),
  levels: z.array(LevelSchema).min(1),
  roof: z.object({
    type: z.enum(["hip", "gable", "flat", "shed", "butterfly"]),
    pitchDeg: num.min(0).max(60),
    overhangM: num.min(0),
    material: z.string().optional(),
  }),
  wallSpec: z.object({
    exteriorThicknessM: num.positive(),
    interiorThicknessM: num.positive(),
    material: z.string().optional(),
  }),
  specPackage: z.enum(["standard", "premium", "luxury"]),
  /** Material overrides on top of the package: slot → material code. */
  selections: z.record(z.string(), z.string()).default({}),
  meta: z
    .object({
      generatedBy: z.enum(["ai", "manual", "seed"]).default("manual"),
      title: z.string().optional(),
      rationale: z.string().optional(),
    })
    .default({ generatedBy: "manual" }),
});
export type Plan = z.infer<typeof PlanSchema>;

export interface RoomTypeInfo {
  th: string;
  en: string;
  /** Needs plumbing. */
  wet: boolean;
  /** Open-air / not enclosed by walls (carport, terrace, balcony, pool). */
  outdoor: boolean;
  /** Should have a window or exterior door for light and ventilation. */
  needsDaylight: boolean;
  /** Reasonable sales-draft minimums (not legal minimums) — editable later in settings. */
  minAreaM2: number;
  minWidthM: number;
}

export const ROOM_TYPE_INFO: Record<RoomType, RoomTypeInfo> = {
  living: { th: "ห้องนั่งเล่น", en: "Living room", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 12, minWidthM: 3 },
  dining: { th: "ห้องรับประทานอาหาร", en: "Dining room", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 7, minWidthM: 2.4 },
  kitchen: { th: "ครัวฝรั่ง", en: "Kitchen", wet: true, outdoor: false, needsDaylight: false, minAreaM2: 5, minWidthM: 1.8 },
  kitchen_thai: { th: "ครัวไทย", en: "Thai kitchen", wet: true, outdoor: false, needsDaylight: true, minAreaM2: 5, minWidthM: 1.8 },
  master_bedroom: { th: "ห้องนอนใหญ่", en: "Master bedroom", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 14, minWidthM: 3.2 },
  bedroom: { th: "ห้องนอน", en: "Bedroom", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 9, minWidthM: 2.7 },
  bathroom: { th: "ห้องน้ำ", en: "Bathroom", wet: true, outdoor: false, needsDaylight: false, minAreaM2: 2.4, minWidthM: 1.2 },
  shrine: { th: "ห้องพระ", en: "Shrine room", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 4, minWidthM: 1.8 },
  office: { th: "ห้องทำงาน", en: "Office / study", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 7, minWidthM: 2.4 },
  maid_room: { th: "ห้องแม่บ้าน", en: "Maid's room", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 6, minWidthM: 2.2 },
  laundry: { th: "ห้องซักล้าง", en: "Laundry", wet: true, outdoor: false, needsDaylight: false, minAreaM2: 2.5, minWidthM: 1.2 },
  storage: { th: "ห้องเก็บของ", en: "Storage", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 1.5, minWidthM: 0.9 },
  walk_in_closet: { th: "ห้องแต่งตัว", en: "Walk-in closet", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 3, minWidthM: 1.5 },
  multipurpose: { th: "ห้องอเนกประสงค์", en: "Family / multipurpose", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 9, minWidthM: 2.7 },
  foyer: { th: "โถงทางเข้า", en: "Foyer", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 2, minWidthM: 1.2 },
  corridor: { th: "โถง/ทางเดิน", en: "Hall / corridor", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 1, minWidthM: 1 },
  stair: { th: "บันได", en: "Stair", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 5, minWidthM: 1.8 },
  garage: { th: "ที่จอดรถ", en: "Carport", wet: false, outdoor: true, needsDaylight: false, minAreaM2: 12.5, minWidthM: 2.5 },
  terrace: { th: "ระเบียง/ชาน", en: "Terrace", wet: false, outdoor: true, needsDaylight: false, minAreaM2: 2, minWidthM: 1.2 },
  balcony: { th: "ระเบียง", en: "Balcony", wet: false, outdoor: true, needsDaylight: false, minAreaM2: 1.5, minWidthM: 1 },
  pool: { th: "สระว่ายน้ำ", en: "Pool", wet: true, outdoor: true, needsDaylight: false, minAreaM2: 10, minWidthM: 2.5 },
  shop: { th: "หน้าร้าน", en: "Shop front", wet: false, outdoor: false, needsDaylight: true, minAreaM2: 12, minWidthM: 3 },
  meeting: { th: "ห้องประชุม", en: "Meeting room", wet: false, outdoor: false, needsDaylight: false, minAreaM2: 9, minWidthM: 2.7 },
};

export function roomLabel(room: Room, locale: "th" | "en"): string {
  return room.name?.[locale] ?? ROOM_TYPE_INFO[room.type][locale];
}
