import type { Land, Requirements } from "@/lib/brief";
import { ROOM_TYPE_INFO, ROOM_TYPES, type Site, bbox, buildableArea, compassBearing, edges, outwardNormal, signedArea } from "@/lib/plan-core";
import { BASE_RATE } from "@/lib/pricing/rough";
import { EXTERIOR, SIDES, type Side } from "./format";

const minTable = ROOM_TYPES.map((t) => {
  const i = ROOM_TYPE_INFO[t];
  return `${t} (${i.en}): min ${i.minAreaM2} m², min width ${i.minWidthM} m${i.wet ? ", wet" : ""}${i.outdoor ? ", outdoor/open-air" : ""}`;
}).join("\n");

/** Stable system prompt (cached). Do not interpolate anything request-specific here. */
export const SYSTEM_PROMPT = `You are a senior Thai residential architect working with a home-builder's sales team. During a meeting with a customer, you produce a SALES-DRAFT floor plan that the salesperson can show immediately and adjust later. Licensed architects and engineers will review it before anything is built, but it should already be a sensible, buildable, pleasant Thai house.

# Output
Return one design option as JSON matching the provided schema. Write the *_th fields in natural Thai and the *_en fields in English. Keep titles short (under 40 characters), the concept to 1–2 sentences, and 2–4 pros and 1–3 honest cons.

# Coordinate system
- Metres. x grows to the right, y grows away from the front of the plot. "bottom" = the side facing the front of the plot (y small), "top" = the back.
- (0,0) is the lower-left corner of the BUILDABLE AREA (the plot after setbacks). Every room must lie inside the buildable area given in the request.
- Each room is an axis-aligned rectangle x0<x1, y0<y1, measured on WALL CENTRELINES.
- Rooms on the same level must not overlap. Rooms that share a wall must have exactly equal coordinates on that wall (e.g. one room's x1 equals the neighbour's x0) — this is how walls and doors are found.
- Use a 0.5 m grid wherever practical, never finer than 0.05 m. Keep a regular structural grid: column spans of 3–5 m in each direction, with upper-floor walls generally stacked over lower-floor walls.

# Levels and stairs
- levels[0] is the ground floor. Provide exactly the number of floors requested.
- Each stair is a room of type "stair" that appears on every level it connects, with the same stairLinkId and the same rectangle on each level. A straight-run residential stair needs about 2.5 × 4 m; a U-shaped one about 2.5 × 3 m.
- Upper floors must sit within the ground-floor footprint plus at most a small cantilever; a carport roof may carry rooms above it.

# Doors and windows (you only say WHICH rooms connect; the system places them on the shared wall)
- doors: {a, b, kind, widthM}. a and b are room ids on the same level that share a wall, or b = "${EXTERIOR}" for an entrance from outside (ground floor). kind is "door" (0.8–1.0 m, main entrance 1.2–1.8 m), "sliding_door" (1.6–3 m, to terraces/balconies/gardens) or "opening" (a doorless gap for open-plan spaces, 1.5–4 m).
- Every room must be reachable from outside through doors/openings, and upper floors through the stair. Bathrooms usually open from a bedroom or a hall, never directly from the kitchen or dining room.
- Outdoor rooms (garage/carport, terrace, balcony, pool) on the ground floor count as connected to the outside.
- windows: {roomId, side, widthM} on a side of the room that faces outside or an outdoor room. Give every bedroom, living room, office and kitchen at least one window, ideally on two sides for cross-ventilation.

# Thai climate and customs
- Avoid bedrooms with exterior walls facing west (afternoon sun). Put garages, stairs, bathrooms, storage or kitchens on the west side as a heat buffer. North and east light is preferred for bedrooms.
- Deep eaves (overhang 0.8–1.5 m) and a pitched roof (hip or gable, 25–35°) unless the style calls for a flat or modern roof.
- Group wet rooms (bathrooms, kitchens, laundry) together and stack upper-floor bathrooms above ground-floor wet rooms to shorten plumbing.
- A Thai kitchen (kitchen_thai) is at the back with an exterior door and good ventilation; a western kitchen can open to the dining room.
- A shrine room is best on the top floor, never directly under a bathroom, and away from the toilet.
- Elderly family members need a ground-floor bedroom with an adjacent bathroom.
- Each parked car needs about 2.5 × 5.5 m; the carport is usually at the front, next to the road.

# Room types (use only these) and sales-draft minimums
${minTable}

# When you receive validation problems
Return the COMPLETE corrected design (all levels, rooms, doors and windows), fixing every listed error while keeping the rest of the design as close as possible to your previous answer.`;

export type Variant = "compact" | "balanced" | "spacious";

const VARIANT_TEXT: Record<Variant, string> = {
  compact: "Design option A — COST-EFFICIENT: the most compact plan that fully meets the brief, aiming near the lower end of the budget. Simple roof and structure, minimal corridors.",
  balanced: "Design option B — BALANCED: comfortable room sizes and good daylight, aiming for the middle of the budget.",
  spacious: "Design option C — SPACIOUS: generous living spaces, double-aspect rooms and outdoor living (terraces/balconies), aiming near the upper end of the budget.",
};

export interface SiteContext {
  buildableText: string;
  widthM: number;
  depthM: number;
  sides: Record<Side, { bearing: number; compass: string; road?: number }>;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassName = (b: number) => COMPASS[Math.round(b / 45) % 8];

export function describeSite(site: Site): SiteContext {
  const buildable = buildableArea(site);
  const poly = buildable.polygon.length ? buildable.polygon : site.boundary;
  const bb = bbox(poly);
  const local = poly.map(([x, y]) => [round(x - bb.minX), round(y - bb.minY)]);
  const isRect = poly.length === 4 && Math.abs(bb.width * bb.height - Math.abs(signedArea(poly))) < 0.01;
  const dirs: Record<Side, [number, number]> = { bottom: [0, -1], right: [1, 0], top: [0, 1], left: [-1, 0] };
  const sides = Object.fromEntries(
    SIDES.map((s) => {
      const bearing = compassBearing(dirs[s], site.northAngleDeg);
      return [s, { bearing: Math.round(bearing), compass: compassName(bearing) }];
    }),
  ) as SiteContext["sides"];
  // attach each road to the side whose outward direction best matches the road edge's outward normal
  const ccw = signedArea(site.boundary) >= 0;
  for (const road of site.roads) {
    const e = edges(site.boundary)[road.edgeIndex];
    if (!e) continue;
    const n0 = outwardNormal(e);
    const n = ccw ? n0 : [-n0[0], -n0[1]];
    const best = SIDES.reduce((a, b) => (dirs[b][0] * n[0] + dirs[b][1] * n[1] > dirs[a][0] * n[0] + dirs[a][1] * n[1] ? b : a));
    sides[best].road = road.widthM;
  }
  return {
    widthM: round(bb.width),
    depthM: round(bb.height),
    sides,
    buildableText: isRect
      ? `Buildable area: rectangle x 0–${round(bb.width)} m, y 0–${round(bb.height)} m.`
      : `Buildable area: polygon ${JSON.stringify(local)} (bounding box ${round(bb.width)} × ${round(bb.height)} m). Keep every room corner inside it.`,
  };
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

export interface BriefForPrompt {
  land: Land;
  requirements: Requirements;
  budgetMin?: number | null;
  budgetMax?: number | null;
  freeText?: string | null;
}

export function buildGeneratePrompt(brief: BriefForPrompt, site: Site, variant: Variant): string {
  const ctx = describeSite(site);
  const r = brief.requirements;
  const rate = BASE_RATE.indoor;
  const budgetLine =
    brief.budgetMin || brief.budgetMax
      ? `Budget: ${brief.budgetMin?.toLocaleString("en") ?? "?"} – ${brief.budgetMax?.toLocaleString("en") ?? "?"} THB. At roughly ${rate.toLocaleString("en")} THB per m² of enclosed area (about half that for carports/terraces), this suggests about ${Math.round((brief.budgetMin ?? brief.budgetMax ?? 0) / rate)}–${Math.round((brief.budgetMax ?? brief.budgetMin ?? 0) / rate)} m² enclosed.`
      : "Budget: not specified.";
  const sideLines = SIDES.map((s) => {
    const d = ctx.sides[s];
    return `- ${s} side faces ${d.compass} (${d.bearing}°)${d.road ? `, along a ${d.road} m road` : ""}`;
  }).join("\n");

  return `${VARIANT_TEXT[variant]}

# Site
${ctx.buildableText}
${sideLines}
Province: ${brief.land.province}${brief.land.district ? `, ${brief.land.district}` : ""}

# Requirements
- Building type: ${r.buildingType}; style: ${r.style}; floors: ${r.floors}
- Bedrooms: ${r.bedrooms} (count master_bedroom + bedroom); bathrooms: ${r.bathrooms}; parking: ${r.parking} car(s)
- Special rooms: ${r.specialRooms.length ? r.specialRooms.join(", ") : "none"}
- Target usable area: ${r.targetAreaM2 ? `about ${r.targetAreaM2} m² (all floors, incl. carport/terraces)` : "not specified — size it from the budget"}
- ${budgetLine}

# What the customer said (verbatim, may be Thai)
${brief.freeText?.trim() || "(nothing extra)"}`;
}

export function buildEditPrompt(currentJson: string, instruction: string, ctx: SiteContext): string {
  return `Here is the current design (same JSON format you return):
${currentJson}

${ctx.buildableText}

The salesperson asks for this change (may be Thai):
"${instruction}"

Apply the change, adjust neighbouring rooms so nothing overlaps and everything stays inside the buildable area, keep all other rooms, ids, doors and windows as they are where possible, and update the title, concept, pros and cons only if the change makes them inaccurate. Return the complete design.`;
}
