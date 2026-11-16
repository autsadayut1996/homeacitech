/**
 * Building-regulation rules engine (preliminary checks only).
 *
 * Rules are DATA (stored per jurisdiction, editable by an admin). Each rule `type` has a
 * typed parameter schema and an evaluator here — admins change values, not code.
 * Every result says it is preliminary and must be certified by a licensed architect/engineer.
 */
import { z } from "zod";
import {
  type Plan,
  type Point,
  type Segment,
  type Site,
  computeMetrics,
  edges,
  isExteriorOpening,
  openingSegment,
  polygonToSite,
  segmentDistance,
  toSite,
  deriveWalls,
} from "@/lib/plan-core";

export const RULE_TYPES = [
  "opening_to_boundary",
  "setback_road_centerline",
  "setback_road_fraction",
  "height_vs_road",
  "max_height",
  "far_osr",
  "parking_min",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

const BUILDING_TYPES = ["single_storey", "two_storey", "three_plus", "pool_villa", "commercial", "home_office"] as const;

export const PARAM_SCHEMAS = {
  opening_to_boundary: z.object({
    heightThresholdM: z.number().positive(),
    minUnderM: z.number().min(0),
    minOverM: z.number().min(0),
    blankWallMinM: z.number().min(0),
    /** Severity for openings facing a public road (exemptions may apply there). */
    roadSide: z.enum(["fail", "warn", "skip"]).default("warn"),
  }),
  setback_road_centerline: z.object({ roadWidthBelowM: z.number().positive(), minFromCenterlineM: z.number().min(0) }),
  setback_road_fraction: z.object({
    appliesTo: z.array(z.enum(BUILDING_TYPES)),
    roadWidthMinM: z.number().min(0),
    roadWidthMaxM: z.number().positive(),
    fraction: z.number().min(0),
    overMaxDistanceM: z.number().min(0),
  }),
  height_vs_road: z.object({ factor: z.number().positive() }),
  max_height: z.object({ maxM: z.number().positive(), severity: z.enum(["fail", "warn"]).default("warn") }),
  far_osr: z.object({
    /** zone code → limits. Empty until an admin enters the current comprehensive-plan values. */
    zones: z.record(z.string(), z.object({ far: z.number().positive().nullable(), osrPercent: z.number().min(0).nullable() })),
  }),
  parking_min: z.object({
    appliesTo: z.array(z.enum(BUILDING_TYPES)),
    minFloorAreaM2: z.number().min(0),
    m2PerSpace: z.number().positive(),
  }),
} satisfies Record<RuleType, z.ZodTypeAny>;

export type RuleParams<T extends RuleType> = z.infer<(typeof PARAM_SCHEMAS)[T]>;

export interface RuleData {
  code: string;
  type: string;
  titleTh: string;
  titleEn: string;
  params: unknown;
  sourceRef: string;
  verified: boolean;
}

export type Status = "pass" | "warn" | "fail";

export interface Mark {
  /** Site-coordinate segment to draw on the plan. */
  a: Point;
  b: Point;
  status: Status;
  levelId?: string;
}

export interface RuleResult {
  code: string;
  type: string;
  title: { th: string; en: string };
  status: Status;
  /** Short explanation, both languages. */
  message: { th: string; en: string };
  details: { th: string; en: string }[];
  marks: Mark[];
  sourceRef: string;
  verified: boolean;
}

export interface ComplianceContext {
  plan: Plan;
  buildingType?: (typeof BUILDING_TYPES)[number];
  zone?: string | null;
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Building height for regulation purposes: top of the walls of the highest floor (eaves). */
export function regulatoryHeight(plan: Plan): number {
  return plan.levels.reduce((h, l) => Math.max(h, l.elevationM + l.floorToFloorM), 0);
}

function roadEdges(site: Site): Map<number, number> {
  return new Map(site.roads.map((r) => [r.edgeIndex, r.widthM]));
}

/** Footprint outline segments of every room on every level (site coordinates). */
function footprintSegments(plan: Plan): Segment[] {
  return plan.levels.flatMap((l) => l.rooms.filter((r) => r.type !== "pool").flatMap((r) => edges(polygonToSite(plan, r.polygon))));
}

function minDistanceToEdge(segs: Segment[], edge: Segment): { d: number; seg: Segment | null } {
  let best = { d: Infinity, seg: null as Segment | null };
  for (const s of segs) {
    const d = segmentDistance(s, edge);
    if (d < best.d) best = { d, seg: s };
  }
  return best;
}

/** Required setback from the road boundary for each road edge (centreline + fraction rules). */
export function roadSetbacks(site: Site, rules: RuleData[], buildingType?: string): Map<number, { distance: number; rule: string }> {
  const out = new Map<number, { distance: number; rule: string }>();
  const consider = (edge: number, distance: number, rule: string) => {
    const cur = out.get(edge);
    if (!cur || distance > cur.distance) out.set(edge, { distance, rule });
  };
  for (const rule of rules) {
    if (rule.type === "setback_road_centerline") {
      const p = PARAM_SCHEMAS.setback_road_centerline.safeParse(rule.params);
      if (!p.success) continue;
      for (const r of site.roads) if (r.widthM < p.data.roadWidthBelowM) consider(r.edgeIndex, Math.max(0, p.data.minFromCenterlineM - r.widthM / 2), rule.code);
    } else if (rule.type === "setback_road_fraction") {
      const p = PARAM_SCHEMAS.setback_road_fraction.safeParse(rule.params);
      if (!p.success || !buildingType || !p.data.appliesTo.includes(buildingType as never)) continue;
      for (const r of site.roads) {
        if (r.widthM < p.data.roadWidthMinM) continue;
        consider(r.edgeIndex, r.widthM > p.data.roadWidthMaxM ? p.data.overMaxDistanceM : r.widthM * p.data.fraction, rule.code);
      }
    }
  }
  return out;
}

/** Opening distance required for a building of the given height (rule opening_to_boundary). */
function openingDistance(rules: RuleData[], heightM: number): number | null {
  const rule = rules.find((r) => r.type === "opening_to_boundary");
  const p = rule && PARAM_SCHEMAS.opening_to_boundary.safeParse(rule.params);
  if (!p || !p.success) return null;
  return heightM < p.data.heightThresholdM ? p.data.minUnderM : p.data.minOverM;
}

/**
 * Setbacks to draw the buildable envelope with, assuming windows may face every side:
 * per edge the larger of the opening distance and any road setback.
 */
export function envelopeSetbacks(site: Site, rules: RuleData[], { floors, buildingType, fallback = 2 }: { floors: number; buildingType?: string; fallback?: number }) {
  const assumedHeight = floors * 3.2;
  const opening = openingDistance(rules, assumedHeight);
  const roads = roadSetbacks(site, rules, buildingType);
  return site.boundary.map((_, edgeIndex) => ({
    edgeIndex,
    distanceM: Math.max(opening ?? fallback, roads.get(edgeIndex)?.distance ?? 0),
  }));
}

// ---------------------------------------------------------------------------

function result(rule: RuleData, status: Status, message: { th: string; en: string }, details: RuleResult["details"] = [], marks: Mark[] = []): RuleResult {
  return {
    code: rule.code,
    type: rule.type,
    title: { th: rule.titleTh, en: rule.titleEn },
    status,
    message,
    details,
    marks,
    sourceRef: rule.sourceRef,
    verified: rule.verified,
  };
}

const worst = (a: Status, b: Status): Status => (a === "fail" || b === "fail" ? "fail" : a === "warn" || b === "warn" ? "warn" : "pass");

function evalOpeningToBoundary(rule: RuleData, p: RuleParams<"opening_to_boundary">, ctx: ComplianceContext): RuleResult {
  const { plan } = ctx;
  const H = regulatoryHeight(plan);
  const required = H < p.heightThresholdM ? p.minUnderM : p.minOverM;
  const boundary = edges(plan.site.boundary);
  const roads = roadEdges(plan.site);
  let status: Status = "pass";
  const details: RuleResult["details"] = [];
  const marks: Mark[] = [];

  for (const level of plan.levels) {
    // openings (windows, doors, vents) + open balconies/terraces above ground
    const candidates: { seg: Segment; what: { th: string; en: string } }[] = [];
    for (const o of level.openings) {
      if (o.kind === "opening" || !isExteriorOpening(level, o)) continue;
      const s = openingSegment(level, o);
      if (s) candidates.push({ seg: [toSite(plan, s[0]), toSite(plan, s[1])], what: { th: o.kind === "window" ? "หน้าต่าง" : "ประตู", en: o.kind === "window" ? "Window" : "Door" } });
    }
    if (level.elevationM > 0) {
      for (const r of level.rooms) {
        if (r.type !== "balcony" && r.type !== "terrace") continue;
        for (const e of edges(polygonToSite(plan, r.polygon))) candidates.push({ seg: e, what: { th: "ระเบียง", en: "Balcony" } });
      }
    }
    for (const c of candidates) {
      boundary.forEach((edge, ei) => {
        const d = segmentDistance(c.seg, edge);
        if (d + 1e-6 >= required) return;
        const isRoad = roads.has(ei);
        if (isRoad && p.roadSide === "skip") return;
        const s: Status = isRoad && p.roadSide === "warn" ? "warn" : "fail";
        status = worst(status, s);
        marks.push({ a: c.seg[0], b: c.seg[1], status: s, levelId: level.id });
        details.push({
          th: `${level.name.th}: ${c.what.th} ห่างแนวเขต ${f2(d)} ม. (ต้อง ≥ ${required} ม.)${isRoad ? " — ด้านติดถนน อาจมีข้อยกเว้น" : ""}`,
          en: `${level.name.en}: ${c.what.en} is ${f2(d)} m from the boundary (needs ≥ ${required} m)${isRoad ? " — road side, exemptions may apply" : ""}`,
        });
      });
    }
    // blank exterior walls closer than blankWallMinM (but not on the line) are not allowed
    for (const w of deriveWalls(plan, level)) {
      if (w.kind !== "exterior") continue;
      const seg: Segment = [toSite(plan, w.a), toSite(plan, w.b)];
      boundary.forEach((edge) => {
        const d = segmentDistance(seg, edge);
        if (d < p.blankWallMinM - 1e-6) {
          const s: Status = d < 0.01 ? "warn" : "fail";
          status = worst(status, s);
          marks.push({ a: seg[0], b: seg[1], status: s, levelId: level.id });
          details.push(
            d < 0.01
              ? { th: `${level.name.th}: ผนังชิดแนวเขต — ต้องมีหนังสือยินยอมจากเจ้าของที่ดินข้างเคียง`, en: `${level.name.en}: wall on the boundary — needs the neighbour's written consent` }
              : { th: `${level.name.th}: ผนังทึบห่างแนวเขต ${f2(d)} ม. (ต้อง ≥ ${p.blankWallMinM} ม. หรือชิดแนวเขต)`, en: `${level.name.en}: blank wall ${f2(d)} m from the boundary (needs ≥ ${p.blankWallMinM} m or on the line)` },
          );
        }
      });
    }
  }
  const msg =
    status === "pass"
      ? { th: `ช่องเปิดทุกจุดห่างแนวเขต ≥ ${required} ม. (อาคารสูง ${f2(H)} ม.)`, en: `All openings ≥ ${required} m from the boundary (building height ${f2(H)} m)` }
      : { th: `พบ ${details.length} จุดที่ใกล้แนวเขตเกินกำหนด (อาคารสูง ${f2(H)} ม. ต้องห่าง ${required} ม.)`, en: `${details.length} item(s) too close to the boundary (height ${f2(H)} m requires ${required} m)` };
  return result(rule, status, msg, details.slice(0, 12), marks);
}

function evalRoadSetback(rule: RuleData, ctx: ComplianceContext): RuleResult {
  const { plan } = ctx;
  const req = roadSetbacks(plan.site, [rule], ctx.buildingType);
  if (req.size === 0) return result(rule, "pass", { th: "ไม่เข้าเงื่อนไขของกฎข้อนี้", en: "Not applicable to this plot / building" });
  const segs = footprintSegments(plan);
  const boundary = edges(plan.site.boundary);
  let status: Status = "pass";
  const details: RuleResult["details"] = [];
  const marks: Mark[] = [];
  for (const [ei, { distance }] of req) {
    const { d, seg } = minDistanceToEdge(segs, boundary[ei]);
    if (d + 1e-6 < distance) {
      status = "fail";
      if (seg) marks.push({ a: seg[0], b: seg[1], status: "fail" });
      details.push({ th: `ด้านติดถนน: อาคารห่างแนวเขต ${f2(d)} ม. (ต้อง ≥ ${f2(distance)} ม.)`, en: `Road side: building is ${f2(d)} m from the boundary (needs ≥ ${f2(distance)} m)` });
    } else {
      details.push({ th: `ด้านติดถนน: ห่าง ${f2(d)} ม. (ต้อง ≥ ${f2(distance)} ม.)`, en: `Road side: ${f2(d)} m (needs ≥ ${f2(distance)} m)` });
    }
  }
  const msg = status === "pass" ? { th: "ระยะร่นจากถนนผ่าน", en: "Road setback satisfied" } : { th: "อาคารล้ำระยะร่นจากถนน", en: "Building encroaches on the road setback" };
  return result(rule, status, msg, details, marks);
}

function evalHeightVsRoad(rule: RuleData, p: RuleParams<"height_vs_road">, ctx: ComplianceContext): RuleResult {
  const { plan } = ctx;
  const H = regulatoryHeight(plan);
  if (!plan.site.roads.length) return result(rule, "pass", { th: "ที่ดินไม่ติดถนน — ไม่เข้าเงื่อนไข", en: "No adjoining road — not applicable" });
  const segs = footprintSegments(plan);
  const boundary = edges(plan.site.boundary);
  // the most permissive (widest) road governs
  let allowed = 0;
  for (const r of plan.site.roads) {
    const { d } = minDistanceToEdge(segs, boundary[r.edgeIndex]);
    allowed = Math.max(allowed, p.factor * (r.widthM + d));
  }
  const ok = H <= allowed + 1e-6;
  return result(
    rule,
    ok ? "pass" : "fail",
    ok
      ? { th: `อาคารสูง ${f2(H)} ม. ไม่เกิน ${f2(allowed)} ม.`, en: `Height ${f2(H)} m ≤ ${f2(allowed)} m` }
      : { th: `อาคารสูง ${f2(H)} ม. เกิน ${f2(allowed)} ม. (${p.factor} เท่าของระยะถึงฝั่งตรงข้ามถนน)`, en: `Height ${f2(H)} m exceeds ${f2(allowed)} m (${p.factor}× distance to the far side of the road)` },
  );
}

function evalMaxHeight(rule: RuleData, p: RuleParams<"max_height">, ctx: ComplianceContext): RuleResult {
  const H = regulatoryHeight(ctx.plan);
  const ok = H <= p.maxM;
  return result(
    rule,
    ok ? "pass" : p.severity,
    ok ? { th: `อาคารสูง ${f2(H)} ม. (ไม่เกิน ${p.maxM} ม.)`, en: `Height ${f2(H)} m (≤ ${p.maxM} m)` } : { th: `อาคารสูง ${f2(H)} ม. เกิน ${p.maxM} ม.`, en: `Height ${f2(H)} m exceeds ${p.maxM} m` },
  );
}

function evalFarOsr(rule: RuleData, p: RuleParams<"far_osr">, ctx: ComplianceContext): RuleResult {
  const m = computeMetrics(ctx.plan);
  const actual = { th: `FAR ${f2(m.far)} · OSR ${f2(m.osrPercent)}%`, en: `FAR ${f2(m.far)} · OSR ${f2(m.osrPercent)}%` };
  if (!ctx.zone) return result(rule, "warn", { th: `ยังไม่ได้ระบุประเภทที่ดินตามผังเมือง (สีผังเมือง) — ${actual.th}`, en: `Land-use zone not specified — ${actual.en}` });
  const z = p.zones[ctx.zone];
  if (!z || (z.far === null && z.osrPercent === null)) {
    return result(rule, "warn", { th: `ยังไม่ได้ตั้งค่า FAR/OSR สำหรับ "${ctx.zone}" ในหน้าตั้งค่ากฎหมาย — ${actual.th}`, en: `No FAR/OSR configured for zone "${ctx.zone}" — ${actual.en}` });
  }
  const details: RuleResult["details"] = [];
  let status: Status = "pass";
  if (z.far !== null) {
    const ok = m.far <= z.far + 1e-6;
    if (!ok) status = "fail";
    details.push({ th: `FAR ${f2(m.far)} ${ok ? "≤" : ">"} ${z.far}`, en: `FAR ${f2(m.far)} ${ok ? "≤" : ">"} ${z.far}` });
  }
  if (z.osrPercent !== null) {
    const ok = m.osrPercent + 1e-6 >= z.osrPercent;
    if (!ok) status = "fail";
    details.push({ th: `OSR ${f2(m.osrPercent)}% ${ok ? "≥" : "<"} ${z.osrPercent}%`, en: `OSR ${f2(m.osrPercent)}% ${ok ? "≥" : "<"} ${z.osrPercent}%` });
  }
  return result(rule, status, status === "pass" ? { th: `ผ่านเกณฑ์ผังเมือง ${ctx.zone}`, en: `Within zone ${ctx.zone} limits` } : { th: `เกินเกณฑ์ผังเมือง ${ctx.zone}`, en: `Exceeds zone ${ctx.zone} limits` }, details);
}

function evalParking(rule: RuleData, p: RuleParams<"parking_min">, ctx: ComplianceContext): RuleResult {
  const m = computeMetrics(ctx.plan);
  if (!ctx.buildingType || !p.appliesTo.includes(ctx.buildingType) || m.indoorAreaM2 < p.minFloorAreaM2) {
    return result(rule, "pass", { th: "ไม่เข้าเงื่อนไขของกฎข้อนี้", en: "Not applicable to this building" });
  }
  const need = Math.ceil(m.indoorAreaM2 / p.m2PerSpace);
  const ok = m.parkingSpaces >= need;
  return result(rule, ok ? "pass" : "fail", { th: `ที่จอดรถ ${m.parkingSpaces} คัน (ต้องมี ≥ ${need})`, en: `${m.parkingSpaces} parking space(s) (needs ≥ ${need})` });
}

export function evaluateRule(rule: RuleData, ctx: ComplianceContext): RuleResult {
  const type = rule.type as RuleType;
  if (!(RULE_TYPES as readonly string[]).includes(type)) return result(rule, "warn", { th: `ไม่รู้จักประเภทกฎ "${rule.type}"`, en: `Unknown rule type "${rule.type}"` });
  const parsed = PARAM_SCHEMAS[type].safeParse(rule.params);
  if (!parsed.success) return result(rule, "warn", { th: "ค่าพารามิเตอร์ของกฎไม่ถูกต้อง — ตรวจในหน้าตั้งค่า", en: "Invalid rule parameters — check the settings page" });
  const p = parsed.data;
  switch (type) {
    case "opening_to_boundary":
      return evalOpeningToBoundary(rule, p as RuleParams<"opening_to_boundary">, ctx);
    case "setback_road_centerline":
    case "setback_road_fraction":
      return evalRoadSetback(rule, ctx);
    case "height_vs_road":
      return evalHeightVsRoad(rule, p as RuleParams<"height_vs_road">, ctx);
    case "max_height":
      return evalMaxHeight(rule, p as RuleParams<"max_height">, ctx);
    case "far_osr":
      return evalFarOsr(rule, p as RuleParams<"far_osr">, ctx);
    case "parking_min":
      return evalParking(rule, p as RuleParams<"parking_min">, ctx);
  }
}

export function evaluateAll(rules: RuleData[], ctx: ComplianceContext): RuleResult[] {
  return rules.map((r) => evaluateRule(r, ctx));
}

export function overallStatus(results: RuleResult[]): Status {
  return results.reduce<Status>((s, r) => worst(s, r.status), "pass");
}
