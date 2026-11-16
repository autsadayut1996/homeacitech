import { area, edges, pointAlong, type Segment } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Opening, type Plan } from "./schema";
import { roomAcross } from "./validator";
import { deriveWalls, wallLength } from "./walls";
import { roofArea, roofParts } from "./roof";

/** Quantities taken off the plan. Units: m, m², counts. Used by material pricing and the BOQ. */
export interface Quantities {
  floorIndoorM2: number;
  floorOutdoorM2: number;
  ceilingM2: number;
  exteriorWallLengthM: number;
  interiorWallLengthM: number;
  /** Outside face of exterior walls, minus openings. */
  exteriorPaintM2: number;
  /** Both faces of interior walls + inside face of exterior walls, minus openings. */
  interiorPaintM2: number;
  roofM2: number;
  /** Main (pitched/flat) roof only — what the roof-covering material applies to. */
  mainRoofM2: number;
  doorCount: number;
  /** Windows + sliding doors (aluminium frames, glass). */
  glazedM2: number;
  windowCount: number;
  bathroomCount: number;
  kitchenCount: number;
}

export function openingSegment(level: Level, o: Opening): Segment | null {
  const room = level.rooms.find((r) => r.id === o.host.roomId);
  const e = room && edges(room.polygon)[o.host.edgeIndex];
  if (!e) return null;
  return [pointAlong(e, o.host.offsetM), pointAlong(e, o.host.offsetM + o.widthM)];
}

export function isExteriorOpening(level: Level, o: Opening): boolean {
  const room = level.rooms.find((r) => r.id === o.host.roomId);
  if (!room) return false;
  const across = roomAcross(level, room, o.host.edgeIndex, o.host.offsetM + o.widthM / 2);
  return !across || ROOM_TYPE_INFO[across.type].outdoor;
}

const openingArea = (o: Opening) => o.widthM * (o.heightM ?? (o.kind === "window" ? 1.2 : 2.1));

export function takeoff(plan: Plan): Quantities {
  const q: Quantities = {
    floorIndoorM2: 0,
    floorOutdoorM2: 0,
    ceilingM2: 0,
    exteriorWallLengthM: 0,
    interiorWallLengthM: 0,
    exteriorPaintM2: 0,
    interiorPaintM2: 0,
    roofM2: 0,
    mainRoofM2: 0,
    doorCount: 0,
    glazedM2: 0,
    windowCount: 0,
    bathroomCount: 0,
    kitchenCount: 0,
  };
  for (const level of plan.levels) {
    const h = level.floorToFloorM;
    for (const r of level.rooms) {
      const a = area(r.polygon);
      if (ROOM_TYPE_INFO[r.type].outdoor) q.floorOutdoorM2 += a;
      else {
        q.floorIndoorM2 += a;
        q.ceilingM2 += a;
      }
      if (r.type === "bathroom") q.bathroomCount++;
      if (r.type === "kitchen" || r.type === "kitchen_thai") q.kitchenCount++;
    }
    let ext = 0;
    let int = 0;
    for (const w of deriveWalls(plan, level)) {
      if (w.kind === "exterior") ext += wallLength(w);
      else int += wallLength(w);
    }
    q.exteriorWallLengthM += ext;
    q.interiorWallLengthM += int;
    let extOpen = 0;
    let intOpen = 0;
    for (const o of level.openings) {
      const exterior = isExteriorOpening(level, o);
      if (o.kind !== "opening") {
        if (exterior) extOpen += openingArea(o);
        else intOpen += openingArea(o);
      }
      if (o.kind === "door") q.doorCount++;
      if (o.kind === "window" || o.kind === "sliding_door") q.glazedM2 += openingArea(o);
      if (o.kind === "window") q.windowCount++;
    }
    q.exteriorPaintM2 += Math.max(0, ext * h - extOpen);
    q.interiorPaintM2 += Math.max(0, (int * 2 + ext) * h - intOpen * 2 - extOpen);
  }
  for (const p of roofParts(plan)) {
    const a = roofArea(p);
    q.roofM2 += a;
    if (p.kind !== "slab") q.mainRoofM2 += a;
  }
  return q;
}
