"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LandSchema, RequirementsSchema, siteFromLand } from "@/lib/brief";
import { PlanSchema, computeMetrics } from "@/lib/plan-core";
import { AiError, MODEL, anthropicCaller, runDesignLoop, type DesignResult } from "@/lib/ai/generate";
import { buildEditPrompt, buildGeneratePrompt, describeSite, type Variant } from "@/lib/ai/prompt";
import { decompilePlan, type AiOption } from "@/lib/ai/format";
import { roughPrice } from "@/lib/pricing/rough";
import { nextVersionNumber } from "@/lib/versions";

export type AiActionResult = { ok: true; versionId: string } | { ok: false; error: string; code?: string };

export interface AiSummary {
  variant?: Variant;
  instruction?: string;
  title_th: string;
  title_en: string;
  concept_th: string;
  concept_en: string;
  pros_th: string[];
  cons_th: string[];
  pros_en: string[];
  cons_en: string[];
  attempts: number;
  errors: number;
  warnings: number;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

function summaryOf(r: DesignResult, extra: Pick<AiSummary, "variant" | "instruction">): AiSummary {
  const o = r.option;
  return {
    ...extra,
    title_th: o.title_th,
    title_en: o.title_en,
    concept_th: o.concept_th,
    concept_en: o.concept_en,
    pros_th: o.pros_th,
    cons_th: o.cons_th,
    pros_en: o.pros_en,
    cons_en: o.cons_en,
    attempts: r.attempts.length,
    errors: r.validation.errors.length,
    warnings: r.validation.warnings.length,
  };
}

async function logGeneration(kind: string, versionId: string | null, prompt: string, r: DesignResult | null, error?: string) {
  const sum = (k: "input" | "output") => r?.attempts.reduce((s, a) => s + a.usage[k], 0) ?? null;
  await db.aiGeneration.create({
    data: {
      kind,
      versionId,
      model: r?.model ?? MODEL,
      request: json({ prompt }),
      response: r ? json(r.option) : json({ error }),
      validatorLog: r ? json(r.attempts.map((a) => ({ attempt: a.attempt, parseError: a.parseError, errors: a.errors, warnings: a.warnings }))) : undefined,
      attempts: r?.attempts.length ?? 0,
      inputTokens: sum("input"),
      outputTokens: sum("output"),
    },
  });
}

function failure(e: unknown): AiActionResult {
  if (e instanceof AiError) return { ok: false, error: e.message, code: e.code };
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function keyMissing(): AiActionResult | null {
  return process.env.ANTHROPIC_API_KEY ? null : { ok: false, error: "ANTHROPIC_API_KEY is not set", code: "missing_key" };
}

/** Generate one AI design option for a project. The UI calls this once per variant, in parallel. */
export async function generateOption(projectId: string, variant: Variant): Promise<AiActionResult> {
  const missing = keyMissing();
  if (missing) return missing;
  const project = await db.project.findUnique({ where: { id: projectId }, include: { brief: true } });
  if (!project?.brief) return { ok: false, error: "Project has no brief" };
  const land = LandSchema.parse(project.brief.land);
  const requirements = RequirementsSchema.parse(project.brief.requirements);
  const site = siteFromLand(land);
  const { budgetMin, budgetMax, freeText } = project.brief;
  const prompt = buildGeneratePrompt({ land, requirements, budgetMin, budgetMax, freeText }, site, variant);

  let result: DesignResult;
  try {
    result = await runDesignLoop({ call: anthropicCaller(), userPrompt: prompt, site });
  } catch (e) {
    await logGeneration("generate", null, prompt, null, String(e));
    return failure(e);
  }
  const metrics = computeMetrics(result.plan);
  const version = await db.designVersion.create({
    data: {
      projectId,
      number: null,
      isOption: true,
      label: result.option.title_th,
      plan: json(result.plan),
      derived: json(metrics),
      aiSummary: json(summaryOf(result, { variant })),
      totalPrice: roughPrice(metrics, result.plan.specPackage),
    },
  });
  await logGeneration("generate", version.id, prompt, result);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, versionId: version.id };
}

/** Keep an AI option: it becomes the next numbered version. */
export async function chooseOption(versionId: string): Promise<AiActionResult> {
  const v = await db.designVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (!v.isOption) return { ok: true, versionId };
  await db.designVersion.update({ where: { id: versionId }, data: { isOption: false, number: await nextVersionNumber(v.projectId) } });
  revalidatePath(`/projects/${v.projectId}`);
  return { ok: true, versionId };
}

export async function discardOption(versionId: string): Promise<AiActionResult> {
  const v = await db.designVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (!v.isOption) return { ok: false, error: "Only unchosen options can be discarded" };
  await db.designVersion.delete({ where: { id: versionId } });
  revalidatePath(`/projects/${v.projectId}`);
  return { ok: true, versionId };
}

/** Natural-language edit ("ขยายห้องนั่งเล่นอีก 1 เมตร") → a new numbered version. */
export async function editDesign(versionId: string, instruction: string): Promise<AiActionResult> {
  const missing = keyMissing();
  if (missing) return missing;
  const text = instruction.trim();
  if (!text) return { ok: false, error: "Empty instruction" };
  const source = await db.designVersion.findUniqueOrThrow({ where: { id: versionId } });
  const plan = PlanSchema.parse(source.plan);
  const prev = (source.aiSummary ?? {}) as Partial<AiOption>;
  const current = decompilePlan(plan, prev);
  const prompt = buildEditPrompt(JSON.stringify(current), text, describeSite(plan.site));

  let result: DesignResult;
  try {
    result = await runDesignLoop({
      call: anthropicCaller(),
      userPrompt: prompt,
      site: plan.site,
      specPackage: plan.specPackage,
      origin: plan.building.origin,
    });
  } catch (e) {
    await logGeneration("edit", null, prompt, null, String(e));
    return failure(e);
  }
  // keep selections made on the source version
  result.plan.selections = plan.selections;
  const metrics = computeMetrics(result.plan);
  const version = await db.designVersion.create({
    data: {
      projectId: source.projectId,
      number: await nextVersionNumber(source.projectId),
      parentId: source.id,
      label: text.slice(0, 80),
      plan: json(result.plan),
      derived: json(metrics),
      aiSummary: json(summaryOf(result, { instruction: text })),
      totalPrice: roughPrice(metrics, result.plan.specPackage),
    },
  });
  await logGeneration("edit", version.id, prompt, result);
  revalidatePath(`/projects/${source.projectId}`);
  return { ok: true, versionId: version.id };
}
