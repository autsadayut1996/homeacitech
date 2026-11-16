import type { Opening, Plan, Room, RoomType } from "./schema";
import { northAngleForFrontFacing } from "./site";

/** Axis-aligned room helper. Polygon is CCW: edge0 = bottom, 1 = right, 2 = top, 3 = left. */
export function rect(id: string, type: RoomType, x0: number, y0: number, x1: number, y1: number, extra: Partial<Room> = {}): Room {
  return { id, type, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ...extra };
}

export function op(id: string, kind: Opening["kind"], roomId: string, edgeIndex: number, offsetM: number, widthM: number): Opening {
  const defaults = kind === "window" ? { heightM: 1.2, sillM: 0.9 } : { heightM: 2.1, sillM: 0 };
  return { id, kind, host: { roomId, edgeIndex, offsetM }, widthM, ...defaults };
}

/**
 * Sample: 2-storey, 3 bed / 3 bath on a 16 × 20 m plot (80 ตร.วา), road along the front,
 * plot front facing north. Building footprint 12 × 16 m placed 2 m in from every boundary.
 */
export function sampleTwoStoreyPlan(): Plan {
  return {
    schemaVersion: 1,
    units: "m",
    site: {
      boundary: [[0, 0], [16, 0], [16, 20], [0, 20]],
      northAngleDeg: northAngleForFrontFacing("N"),
      roads: [{ edgeIndex: 0, widthM: 6 }],
      setbacks: [0, 1, 2, 3].map((edgeIndex) => ({ edgeIndex, distanceM: 2 })),
    },
    building: { origin: [2, 2], rotationDeg: 0 },
    levels: [
      {
        id: "L1",
        name: { th: "ชั้น 1", en: "Ground floor" },
        elevationM: 0,
        floorToFloorM: 3.2,
        rooms: [
          rect("g-garage", "garage", 0, 0, 5, 6),
          rect("g-living", "living", 5, 0, 12, 6),
          rect("g-stair", "stair", 0, 6, 2.5, 10, { stairLinkId: "S1" }),
          rect("g-hall", "corridor", 2.5, 6, 5, 10),
          rect("g-dining", "dining", 5, 6, 12, 10),
          rect("g-bed", "bedroom", 0, 10, 4, 16, { name: { th: "ห้องนอนผู้สูงอายุ", en: "Elderly bedroom" } }),
          rect("g-bath", "bathroom", 4, 10, 6, 13),
          rect("g-store", "storage", 4, 13, 6, 16),
          rect("g-kitchen", "kitchen", 6, 10, 9, 16),
          rect("g-kthai", "kitchen_thai", 9, 10, 12, 16),
        ],
        openings: [
          op("g-d-main", "door", "g-living", 0, 2.5, 1.2),
          op("g-w-living", "window", "g-living", 0, 4.5, 2),
          op("g-o-living-dining", "opening", "g-living", 2, 1, 4),
          op("g-o-dining-hall", "opening", "g-dining", 3, 0.5, 3),
          op("g-o-hall-stair", "opening", "g-hall", 3, 0.5, 3),
          op("g-d-garage-hall", "door", "g-hall", 0, 0.8, 0.9),
          op("g-d-bed", "door", "g-bed", 0, 2.7, 0.9),
          op("g-w-bed-e", "window", "g-bed", 3, 2, 1.5),
          op("g-w-bed-back", "window", "g-bed", 2, 1, 1.2),
          op("g-d-bath", "door", "g-bath", 0, 0.1, 0.8),
          op("g-d-kitchen", "door", "g-kitchen", 0, 0.5, 1),
          op("g-w-kitchen", "window", "g-kitchen", 2, 0.75, 1.5),
          op("g-d-kthai", "door", "g-kthai", 3, 1, 0.9),
          op("g-d-back", "door", "g-kthai", 1, 3, 0.9),
          op("g-w-kthai", "window", "g-kthai", 2, 0.75, 1.5),
          op("g-d-store", "door", "g-store", 1, 1, 0.8),
          op("g-w-dining", "window", "g-dining", 1, 1, 2),
        ],
      },
      {
        id: "L2",
        name: { th: "ชั้น 2", en: "Upper floor" },
        elevationM: 3.2,
        floorToFloorM: 3,
        rooms: [
          rect("u-master", "master_bedroom", 0, 0, 5, 6),
          rect("u-mbath", "bathroom", 5, 0, 7.5, 3, { name: { th: "ห้องน้ำห้องนอนใหญ่", en: "Master bathroom" } }),
          rect("u-walkin", "walk_in_closet", 5, 3, 7.5, 6),
          rect("u-office", "office", 7.5, 0, 12, 6),
          rect("u-stair", "stair", 0, 6, 2.5, 10, { stairLinkId: "S1" }),
          rect("u-hall", "corridor", 2.5, 6, 5, 10),
          rect("u-family", "multipurpose", 5, 6, 12, 10),
          rect("u-bed2", "bedroom", 0, 10, 4, 16),
          rect("u-bath2", "bathroom", 4, 10, 6, 13),
          rect("u-closet", "walk_in_closet", 4, 13, 6, 16),
          rect("u-balcony", "balcony", 6, 10, 12, 16),
        ],
        openings: [
          op("u-o-hall-stair", "opening", "u-hall", 3, 0.5, 3),
          op("u-d-master", "door", "u-master", 2, 0.5, 0.9),
          op("u-w-master-n", "window", "u-master", 0, 1.5, 2),
          op("u-w-master-e", "window", "u-master", 3, 2, 1.5),
          op("u-d-mbath", "door", "u-mbath", 3, 1, 0.8),
          op("u-w-mbath", "window", "u-mbath", 0, 0.8, 0.8),
          op("u-d-walkin", "door", "u-walkin", 3, 1, 0.8),
          op("u-o-family-hall", "opening", "u-family", 3, 0.5, 3),
          op("u-d-office", "door", "u-office", 2, 1, 0.9),
          op("u-w-office", "window", "u-office", 0, 1, 2),
          op("u-d-bed2", "door", "u-bed2", 0, 2.7, 0.9),
          op("u-w-bed2-e", "window", "u-bed2", 3, 2, 1.5),
          op("u-w-bed2-back", "window", "u-bed2", 2, 1, 1.2),
          op("u-d-bath2", "door", "u-bath2", 0, 0.1, 0.8),
          op("u-d-closet", "door", "u-closet", 3, 1, 0.8),
          op("u-sd-balcony", "sliding_door", "u-balcony", 0, 2, 2.4),
        ],
      },
    ],
    roof: { type: "hip", pitchDeg: 30, overhangM: 1.0 },
    wallSpec: { exteriorThicknessM: 0.15, interiorThicknessM: 0.1 },
    specPackage: "standard",
    selections: {},
    meta: { generatedBy: "seed", title: "บ้าน 2 ชั้น 3 นอน 3 น้ำ (ตัวอย่าง)" },
  };
}
