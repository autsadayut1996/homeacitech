"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BriefInputSchema, type BriefInput } from "@/lib/brief";
import { jurisdictionForProvince } from "@/lib/compliance/server";

export async function setLocale(locale: "th" | "en") {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export type SaveBriefResult = { ok: true; projectId: string } | { ok: false; fieldErrors: Record<string, string> };

async function nextProjectCode() {
  const year = new Date().getFullYear();
  const prefix = `P-${year}-`;
  const last = await db.project.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" } });
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function saveBrief(input: unknown, projectId?: string, title?: string): Promise<SaveBriefResult> {
  const parsed = BriefInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = i.path.join(".");
      if (fieldErrors[key]) continue;
      const missing = (i.code === "invalid_type" && i.received === "undefined") || (i.code === "too_small" && i.type === "string");
      fieldErrors[key] = i.code === "custom" ? i.message : missing ? "required" : "invalid";
    }
    return { ok: false, fieldErrors };
  }
  const b: BriefInput = parsed.data;
  const briefData = {
    land: b.land,
    requirements: b.requirements,
    budgetMin: b.budgetMin ?? null,
    budgetMax: b.budgetMax ?? null,
    freeText: b.freeText?.trim() || null,
  };
  const customerData = {
    name: b.customer.name,
    phone: b.customer.phone || null,
    email: b.customer.email || null,
    note: b.customer.note || null,
  };
  const autoTitle = title?.trim() || `${b.customer.name} — ${b.land.province}`;
  const jurisdiction = await jurisdictionForProvince(b.land.province);

  if (projectId) {
    const existing = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    await db.$transaction([
      db.customer.update({ where: { id: existing.customerId }, data: customerData }),
      db.project.update({ where: { id: projectId }, data: { title: autoTitle, jurisdictionId: jurisdiction?.id ?? null } }),
      db.brief.upsert({ where: { projectId }, create: { projectId, ...briefData }, update: briefData }),
    ]);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, projectId };
  }

  const project = await db.project.create({
    data: {
      code: await nextProjectCode(),
      title: autoTitle,
      customer: { create: customerData },
      jurisdiction: jurisdiction ? { connect: { id: jurisdiction.id } } : undefined,
      brief: { create: briefData },
    },
  });
  revalidatePath("/");
  return { ok: true, projectId: project.id };
}
