import "server-only";
import { db } from "@/lib/db";
import type { RuleData } from "./rules";

export interface LoadedRules {
  rules: RuleData[];
  jurisdiction: { code: string; nameTh: string; nameEn: string } | null;
  ruleSetId: string | null;
  ruleSetVersion: number | null;
}

/** Active rule set for a jurisdiction (falls back to the national defaults). */
export async function loadRules(jurisdictionId: string | null | undefined): Promise<LoadedRules> {
  const j =
    (jurisdictionId ? await db.jurisdiction.findUnique({ where: { id: jurisdictionId } }) : null) ??
    (await db.jurisdiction.findUnique({ where: { code: "TH-DEFAULT" } }));
  if (!j) return { rules: [], jurisdiction: null, ruleSetId: null, ruleSetVersion: null };
  const set = await db.ruleSet.findFirst({ where: { jurisdictionId: j.id, isActive: true }, orderBy: { version: "desc" }, include: { rules: { orderBy: { code: "asc" } } } });
  return {
    rules: (set?.rules ?? []).map((r) => ({ code: r.code, type: r.type, titleTh: r.titleTh, titleEn: r.titleEn, params: r.params, sourceRef: r.sourceRef, verified: r.verified })),
    jurisdiction: { code: j.code, nameTh: j.nameTh, nameEn: j.nameEn },
    ruleSetId: set?.id ?? null,
    ruleSetVersion: set?.version ?? null,
  };
}

/** Jurisdiction for a province name: exact Thai-name match, then Bangkok, then national defaults. */
export async function jurisdictionForProvince(province: string) {
  const exact = await db.jurisdiction.findFirst({ where: { nameTh: province.trim() } });
  if (exact) return exact;
  if (/กรุงเทพ|bangkok/i.test(province)) return db.jurisdiction.findUnique({ where: { code: "TH-BKK" } });
  return db.jurisdiction.findUnique({ where: { code: "TH-DEFAULT" } });
}
