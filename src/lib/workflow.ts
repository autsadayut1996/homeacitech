/**
 * Project status workflow (pure — enforced on the server by every action).
 *
 *  DRAFT → PROPOSED → PRICE_APPROVAL → DESIGN_REVIEW → APPROVED → CONTRACT_SIGNED → PERMIT_PREP
 *
 * - A discount within the sales limit is approved automatically (PROPOSED → DESIGN_REVIEW).
 * - Rejections send the project back to PROPOSED.
 * - PERMIT_PREP is only reachable when a licensed architect AND engineer approved the
 *   contracted version and recorded their licence numbers. It cannot be skipped.
 */
export const STATUSES = ["DRAFT", "PROPOSED", "PRICE_APPROVAL", "DESIGN_REVIEW", "APPROVED", "CONTRACT_SIGNED", "PERMIT_PREP"] as const;
export type Status = (typeof STATUSES)[number];

export type ApprovalType = "PRICE" | "ARCHITECTURE" | "ENGINEERING";
export type ApprovalStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED";

export interface ApprovalLike {
  type: ApprovalType;
  status: ApprovalStatus;
  versionId: string | null;
  approver: string | null;
  licenseNo: string | null;
}

export type Action =
  | { type: "propose"; hasVersion: boolean }
  | { type: "request_price"; discountPct: number; limitPct: number }
  | { type: "price_decision"; approved: boolean }
  | { type: "design_decision"; approvals: ApprovalLike[]; versionId: string }
  | { type: "sign_contract" }
  | { type: "permit_prep"; approvals: ApprovalLike[]; versionId: string };

export type Transition = { ok: true; next: Status; autoApprovedPrice?: boolean } | { ok: false; reason: { th: string; en: string } };

const no = (th: string, en: string): Transition => ({ ok: false, reason: { th, en } });

/** Approved by a licensed professional (licence number recorded) for this exact version. */
export function licensedApproval(approvals: ApprovalLike[], type: "ARCHITECTURE" | "ENGINEERING", versionId: string) {
  return approvals.find((a) => a.type === type && a.status === "APPROVED" && a.versionId === versionId && !!a.approver?.trim() && !!a.licenseNo?.trim());
}

export function transition(status: Status, action: Action): Transition {
  switch (action.type) {
    case "propose":
      if (status !== "DRAFT") return no("เสนอลูกค้าได้จากสถานะร่างเท่านั้น", "Only a draft can be proposed");
      if (!action.hasVersion) return no("ต้องมีแบบที่เลือกแล้วอย่างน้อย 1 เวอร์ชัน", "Choose or save a design version first");
      return { ok: true, next: "PROPOSED" };
    case "request_price":
      if (status !== "PROPOSED") return no("ขออนุมัติราคาได้หลังเสนอลูกค้าแล้ว", "Request price approval after proposing to the customer");
      if (action.discountPct < 0 || action.discountPct >= 100) return no("ส่วนลดไม่ถูกต้อง", "Invalid discount");
      return action.discountPct <= action.limitPct ? { ok: true, next: "DESIGN_REVIEW", autoApprovedPrice: true } : { ok: true, next: "PRICE_APPROVAL" };
    case "price_decision":
      if (status !== "PRICE_APPROVAL") return no("ไม่มีคำขออนุมัติราคาที่รออยู่", "No price approval is pending");
      return { ok: true, next: action.approved ? "DESIGN_REVIEW" : "PROPOSED" };
    case "design_decision": {
      if (status !== "DESIGN_REVIEW") return no("ไม่มีแบบที่รอตรวจ", "No design review is pending");
      const forVersion = action.approvals.filter((a) => a.versionId === action.versionId && a.type !== "PRICE");
      if (forVersion.some((a) => a.status === "CHANGES_REQUESTED")) return { ok: true, next: "PROPOSED" };
      const both = licensedApproval(action.approvals, "ARCHITECTURE", action.versionId) && licensedApproval(action.approvals, "ENGINEERING", action.versionId);
      return { ok: true, next: both ? "APPROVED" : "DESIGN_REVIEW" };
    }
    case "sign_contract":
      if (status !== "APPROVED") return no("เซ็นสัญญาได้หลังแบบและราคาได้รับอนุมัติแล้ว", "The contract can be signed only after approval");
      return { ok: true, next: "CONTRACT_SIGNED" };
    case "permit_prep":
      if (status !== "CONTRACT_SIGNED") return no("เตรียมยื่นขออนุญาตได้หลังเซ็นสัญญาแล้ว", "Permit preparation starts after the contract is signed");
      if (!licensedApproval(action.approvals, "ARCHITECTURE", action.versionId))
        return no("ต้องมีสถาปนิกผู้มีใบอนุญาตอนุมัติแบบเวอร์ชันนี้ (พร้อมเลขใบอนุญาต)", "A licensed architect must approve this version (with licence number)");
      if (!licensedApproval(action.approvals, "ENGINEERING", action.versionId))
        return no("ต้องมีวิศวกรผู้มีใบอนุญาตอนุมัติแบบเวอร์ชันนี้ (พร้อมเลขใบอนุญาต)", "A licensed engineer must approve this version (with licence number)");
      return { ok: true, next: "PERMIT_PREP" };
  }
}

/**
 * What saving a new design version does to the workflow:
 * - before submission: nothing
 * - while being approved / approved: approvals are void → back to PROPOSED
 * - after the contract: locked (changes need a formal change order, outside this MVP)
 */
export function onNewVersion(status: Status): { allowed: boolean; resetTo?: Status } {
  if (status === "CONTRACT_SIGNED" || status === "PERMIT_PREP") return { allowed: false };
  if (status === "PRICE_APPROVAL" || status === "DESIGN_REVIEW" || status === "APPROVED") return { allowed: true, resetTo: "PROPOSED" };
  return { allowed: true };
}

/** Is the price final (no DRAFT watermark)? Only once price approval is done. */
export function priceIsApproved(status: Status): boolean {
  return STATUSES.indexOf(status) >= STATUSES.indexOf("DESIGN_REVIEW");
}
