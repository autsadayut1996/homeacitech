"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { transition, type Action, type ApprovalLike, type Status } from "@/lib/workflow";
import { afterVersionAdded, checkCanAddVersion, latestVersion, nextVersionNumber } from "@/lib/versions";

export type WfResult = { ok: true } | { ok: false; error: { th: string; en: string } };
const err = (th: string, en: string): WfResult => ({ ok: false, error: { th, en } });

async function context(projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const version = await latestVersion(projectId);
  const approvals = await db.approval.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const like: ApprovalLike[] = approvals.map((a) => ({ type: a.type, status: a.status, versionId: a.versionId, approver: a.approver, licenseNo: a.licenseNo }));
  return { project, version, approvals, like, status: project.status as Status };
}

async function apply(projectId: string, status: Status, action: Action, extra?: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<WfResult> {
  const r = transition(status, action);
  if (!r.ok) return { ok: false, error: r.reason };
  await db.$transaction(async (tx) => {
    await extra?.(tx);
    await tx.project.update({ where: { id: projectId }, data: { status: r.next } });
    if (r.next === "DESIGN_REVIEW" && status !== "DESIGN_REVIEW") {
      const v = await tx.designVersion.findFirst({ where: { projectId, number: { not: null } }, orderBy: { number: "desc" } });
      await tx.approval.createMany({
        data: (["ARCHITECTURE", "ENGINEERING"] as const).map((type) => ({ projectId, versionId: v?.id ?? null, type, status: "PENDING" as const })),
      });
    }
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function proposeToCustomer(projectId: string): Promise<WfResult> {
  const c = await context(projectId);
  return apply(projectId, c.status, { type: "propose", hasVersion: !!c.version });
}

export async function requestPriceApproval(projectId: string, discountAmount: number, note: string): Promise<WfResult> {
  const c = await context(projectId);
  if (!c.version?.totalPrice) return err("เวอร์ชันนี้ยังไม่มีราคา", "This version has no price");
  const list = Number(c.version.totalPrice);
  if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount >= list) return err("ส่วนลดไม่ถูกต้อง", "Invalid discount");
  const settings = await db.companySettings.findUnique({ where: { id: "default" } });
  const limitPct = Number(settings?.salesDiscountLimitPct ?? 3);
  const discountPct = (discountAmount / list) * 100;
  const r = transition(c.status, { type: "request_price", discountPct, limitPct });
  const auto = r.ok && r.autoApprovedPrice;
  return apply(projectId, c.status, { type: "request_price", discountPct, limitPct }, (tx) =>
    tx.approval.create({
      data: {
        projectId,
        versionId: c.version!.id,
        type: "PRICE",
        status: auto ? "APPROVED" : "PENDING",
        listPrice: list,
        discountAmount,
        approver: auto ? `อัตโนมัติ — ส่วนลดไม่เกิน ${limitPct}%` : null,
        note: note.trim() || null,
        decidedAt: auto ? new Date() : null,
      },
    }),
  );
}

export async function decidePrice(approvalId: string, input: { approver: string; approve: boolean; note: string }): Promise<WfResult> {
  if (!input.approver.trim()) return err("กรุณาใส่ชื่อผู้อนุมัติ", "Approver name is required");
  const a = await db.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (a.type !== "PRICE" || a.status !== "PENDING") return err("รายการนี้ไม่ได้รออนุมัติ", "This item is not pending");
  const c = await context(a.projectId);
  return apply(a.projectId, c.status, { type: "price_decision", approved: input.approve }, (tx) =>
    tx.approval.update({
      where: { id: approvalId },
      data: { status: input.approve ? "APPROVED" : "CHANGES_REQUESTED", approver: input.approver.trim(), note: input.note.trim() || a.note, decidedAt: new Date() },
    }),
  );
}

export async function decideDesign(approvalId: string, input: { approver: string; licenseNo: string; approve: boolean; note: string }): Promise<WfResult> {
  if (!input.approver.trim()) return err("กรุณาใส่ชื่อผู้ตรวจ", "Reviewer name is required");
  if (input.approve && !input.licenseNo.trim()) return err("การอนุมัติแบบต้องระบุเลขใบอนุญาตประกอบวิชาชีพ", "Approving a design requires a professional licence number");
  if (!input.approve && !input.note.trim()) return err("กรุณาระบุสิ่งที่ต้องแก้", "Describe what needs to change");
  const a = await db.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (a.type === "PRICE" || a.status !== "PENDING") return err("รายการนี้ไม่ได้รอตรวจ", "This item is not pending");
  const c = await context(a.projectId);
  if (!c.version || a.versionId !== c.version.id) return err("รายการนี้เป็นของแบบเวอร์ชันเก่า", "This review belongs to an older version");
  const updated = c.like.map((x, i) =>
    c.approvals[i].id === approvalId ? { ...x, status: (input.approve ? "APPROVED" : "CHANGES_REQUESTED") as ApprovalLike["status"], approver: input.approver, licenseNo: input.licenseNo } : x,
  );
  return apply(a.projectId, c.status, { type: "design_decision", approvals: updated, versionId: c.version.id }, (tx) =>
    tx.approval.update({
      where: { id: approvalId },
      data: {
        status: input.approve ? "APPROVED" : "CHANGES_REQUESTED",
        approver: input.approver.trim(),
        licenseNo: input.licenseNo.trim() || null,
        note: input.note.trim() || null,
        decidedAt: new Date(),
      },
    }),
  );
}

export async function signContract(projectId: string): Promise<WfResult> {
  const c = await context(projectId);
  return apply(projectId, c.status, { type: "sign_contract" });
}

export async function startPermitPrep(projectId: string): Promise<WfResult> {
  const c = await context(projectId);
  if (!c.version) return err("ไม่มีแบบ", "No design");
  return apply(projectId, c.status, { type: "permit_prep", approvals: c.like, versionId: c.version.id });
}

// ---- comments on the plan -------------------------------------------------------

export async function addComment(versionId: string, input: { author: string; role: "ARCHITECTURE" | "ENGINEERING" | "PRICE" | null; levelId: string | null; x: number | null; y: number | null; body: string }): Promise<WfResult> {
  if (!input.author.trim() || !input.body.trim()) return err("กรุณาใส่ชื่อและข้อความ", "Name and comment are required");
  const v = await db.designVersion.findUniqueOrThrow({ where: { id: versionId } });
  await db.reviewComment.create({ data: { versionId, author: input.author.trim(), role: input.role, levelId: input.levelId, x: input.x, y: input.y, body: input.body.trim() } });
  revalidatePath(`/projects/${v.projectId}/review`);
  return { ok: true };
}

export async function setCommentResolved(commentId: string, resolved: boolean): Promise<WfResult> {
  const c = await db.reviewComment.update({ where: { id: commentId }, data: { resolved }, include: { version: true } });
  revalidatePath(`/projects/${c.version.projectId}/review`);
  return { ok: true };
}

// ---- versions --------------------------------------------------------------------

/** Restore an old version: copies it as a NEW version (history is never rewritten). */
export async function restoreVersion(versionId: string): Promise<{ ok: true; versionId: string } | { ok: false; error: { th: string; en: string } }> {
  const v = await db.designVersion.findUniqueOrThrow({ where: { id: versionId } });
  const locked = await checkCanAddVersion(v.projectId);
  if (locked) return { ok: false, error: locked };
  const created = await db.designVersion.create({
    data: {
      projectId: v.projectId,
      number: await nextVersionNumber(v.projectId),
      parentId: v.id,
      label: `ย้อนกลับเป็น v${v.number} / restored v${v.number}`,
      plan: v.plan as Prisma.InputJsonValue,
      derived: (v.derived ?? undefined) as Prisma.InputJsonValue | undefined,
      aiSummary: (v.aiSummary ?? undefined) as Prisma.InputJsonValue | undefined,
      totalPrice: v.totalPrice,
    },
  });
  await afterVersionAdded(v.projectId);
  revalidatePath(`/projects/${v.projectId}`);
  return { ok: true, versionId: created.id };
}
