"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PlanSchema, computeMetrics } from "@/lib/plan-core";
import { estimatePlan } from "@/lib/pricing/catalog";
import { nextVersionNumber } from "@/lib/versions";

export type SaveResult = { ok: true; versionId: string; number: number } | { ok: false; error: string };

/** Save an edited plan as a new numbered version (the source version is never overwritten). */
export async function savePlanVersion(projectId: string, parentId: string, plan: unknown, label: string): Promise<SaveResult> {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const parent = await db.designVersion.findUnique({ where: { id: parentId } });
  if (!parent || parent.projectId !== projectId) return { ok: false, error: "Source version not found" };
  const p = { ...parsed.data, meta: { ...parsed.data.meta, generatedBy: "manual" as const } };
  const metrics = computeMetrics(p);
  const number = await nextVersionNumber(projectId);
  const v = await db.designVersion.create({
    data: {
      projectId,
      number,
      parentId,
      label: label.trim().slice(0, 80) || null,
      plan: p as unknown as Prisma.InputJsonValue,
      derived: metrics as unknown as Prisma.InputJsonValue,
      aiSummary: parent.aiSummary ?? undefined,
      totalPrice: (await estimatePlan(p)).total,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, versionId: v.id, number };
}
