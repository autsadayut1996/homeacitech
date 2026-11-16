"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PARAM_SCHEMAS, RULE_TYPES, type RuleType } from "@/lib/compliance/rules";

export type RuleSaveResult = { ok: true } | { ok: false; error: string };

export async function updateRule(
  ruleId: string,
  input: { titleTh: string; titleEn: string; paramsJson: string; sourceRef: string; verified: boolean; verifiedBy: string },
): Promise<RuleSaveResult> {
  const rule = await db.rule.findUnique({ where: { id: ruleId } });
  if (!rule) return { ok: false, error: "Rule not found" };
  let params: unknown;
  try {
    params = JSON.parse(input.paramsJson);
  } catch {
    return { ok: false, error: "params: invalid JSON" };
  }
  if ((RULE_TYPES as readonly string[]).includes(rule.type)) {
    const parsed = PARAM_SCHEMAS[rule.type as RuleType].safeParse(params);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ") };
    params = parsed.data;
  }
  if (input.verified && !input.verifiedBy.trim()) return { ok: false, error: "verifiedBy: required when marking as verified" };
  const changedValues = JSON.stringify(params) !== JSON.stringify(rule.params);
  const verified = input.verified;
  await db.rule.update({
    where: { id: ruleId },
    data: {
      titleTh: input.titleTh.trim(),
      titleEn: input.titleEn.trim(),
      params: params as Prisma.InputJsonValue,
      sourceRef: input.sourceRef.trim(),
      verified,
      verifiedBy: verified ? input.verifiedBy.trim() : null,
      verifiedAt: verified ? (rule.verified && !changedValues ? rule.verifiedAt : new Date()) : null,
    },
  });
  revalidatePath("/settings/rules");
  return { ok: true };
}

/** New area (e.g. a province with its own local rules), starting as a copy of another area's rules. */
export async function createJurisdiction(input: { code: string; nameTh: string; nameEn: string; copyFrom: string }): Promise<RuleSaveResult> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) return { ok: false, error: "code: use A–Z, 0–9 and -" };
  if (!input.nameTh.trim()) return { ok: false, error: "nameTh: required" };
  if (await db.jurisdiction.findUnique({ where: { code } })) return { ok: false, error: "code: already exists" };
  const src = await db.ruleSet.findFirst({ where: { jurisdiction: { code: input.copyFrom }, isActive: true }, orderBy: { version: "desc" }, include: { rules: true } });
  await db.jurisdiction.create({
    data: {
      code,
      nameTh: input.nameTh.trim(),
      nameEn: input.nameEn.trim() || input.nameTh.trim(),
      ruleSets: {
        create: {
          version: 1,
          rules: {
            create: (src?.rules ?? []).map((r) => ({
              code: r.code,
              type: r.type,
              titleTh: r.titleTh,
              titleEn: r.titleEn,
              params: r.params as Prisma.InputJsonValue,
              sourceRef: r.sourceRef,
              verified: false,
            })),
          },
        },
      },
    },
  });
  revalidatePath("/settings/rules");
  return { ok: true };
}
