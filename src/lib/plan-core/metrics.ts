import { area, rectilinearUnionArea } from "./geometry";
import { ROOM_TYPE_INFO, type Plan } from "./schema";
import { deriveWalls, wallLength } from "./walls";
import { siteArea, sqmToSqWa } from "./site";

export interface LevelMetrics {
  levelId: string;
  indoorAreaM2: number;
  outdoorAreaM2: number;
  totalAreaM2: number;
  exteriorWallLengthM: number;
  interiorWallLengthM: number;
  roomCount: number;
}

export interface PlanMetrics {
  landAreaM2: number;
  landAreaSqWa: number;
  levels: LevelMetrics[];
  /** Enclosed (air-conditioned-type) area, all levels. */
  indoorAreaM2: number;
  /** พื้นที่ใช้สอยรวม — includes covered carport, terraces, balconies (common Thai sales convention). */
  totalAreaM2: number;
  /** Projected footprint of the building on the plot. */
  footprintM2: number;
  /** Open space = land − footprint. */
  openSpaceM2: number;
  /** FAR = total floor area / land area (preliminary — legal FAR uses gross area incl. walls). */
  far: number;
  /** OSR % = open space / total floor area × 100 (Bangkok comprehensive-plan definition). */
  osrPercent: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
}

export function computeMetrics(plan: Plan): PlanMetrics {
  const levels: LevelMetrics[] = plan.levels.map((level) => {
    let indoor = 0;
    let outdoor = 0;
    for (const r of level.rooms) {
      const a = area(r.polygon);
      if (ROOM_TYPE_INFO[r.type].outdoor) outdoor += a;
      else indoor += a;
    }
    const walls = deriveWalls(plan, level);
    return {
      levelId: level.id,
      indoorAreaM2: indoor,
      outdoorAreaM2: outdoor,
      totalAreaM2: indoor + outdoor,
      exteriorWallLengthM: walls.filter((w) => w.kind === "exterior").reduce((s, w) => s + wallLength(w), 0),
      interiorWallLengthM: walls.filter((w) => w.kind === "interior").reduce((s, w) => s + wallLength(w), 0),
      roomCount: level.rooms.length,
    };
  });

  const landAreaM2 = siteArea(plan.site);
  // Pools are not building footprint; everything else (incl. carport roof) is.
  // Area is rotation-invariant, so the union is computed in (rectilinear) plan coordinates.
  const footprintM2 = rectilinearUnionArea(
    plan.levels.flatMap((l) => l.rooms.filter((r) => r.type !== "pool").map((r) => r.polygon)),
  );
  const totalAreaM2 = levels.reduce((s, l) => s + l.totalAreaM2, 0);
  const openSpaceM2 = Math.max(0, landAreaM2 - footprintM2);
  const allRooms = plan.levels.flatMap((l) => l.rooms);
  const garageArea = allRooms.filter((r) => r.type === "garage").reduce((s, r) => s + area(r.polygon), 0);

  return {
    landAreaM2,
    landAreaSqWa: sqmToSqWa(landAreaM2),
    levels,
    indoorAreaM2: levels.reduce((s, l) => s + l.indoorAreaM2, 0),
    totalAreaM2,
    footprintM2,
    openSpaceM2,
    far: landAreaM2 > 0 ? totalAreaM2 / landAreaM2 : 0,
    osrPercent: totalAreaM2 > 0 ? (openSpaceM2 / totalAreaM2) * 100 : 0,
    bedrooms: allRooms.filter((r) => r.type === "bedroom" || r.type === "master_bedroom").length,
    bathrooms: allRooms.filter((r) => r.type === "bathroom").length,
    // 2.5 × 5 m per car is the usual sales assumption.
    parkingSpaces: Math.floor(garageArea / 12.5),
  };
}
