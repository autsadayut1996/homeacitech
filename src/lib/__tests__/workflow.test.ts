import { describe, expect, it } from "vitest";
import { onNewVersion, priceIsApproved, transition, type ApprovalLike } from "../workflow";

const arch = (over: Partial<ApprovalLike> = {}): ApprovalLike => ({ type: "ARCHITECTURE", status: "APPROVED", versionId: "v1", approver: "A", licenseNo: "ส-1", ...over });
const eng = (over: Partial<ApprovalLike> = {}): ApprovalLike => ({ type: "ENGINEERING", status: "APPROVED", versionId: "v1", approver: "E", licenseNo: "ภย-2", ...over });
const next = (r: ReturnType<typeof transition>) => (r.ok ? r.next : `blocked: ${r.reason.en}`);

describe("workflow", () => {
  it("walks the happy path", () => {
    expect(next(transition("DRAFT", { type: "propose", hasVersion: true }))).toBe("PROPOSED");
    expect(next(transition("PROPOSED", { type: "request_price", discountPct: 5, limitPct: 3 }))).toBe("PRICE_APPROVAL");
    expect(next(transition("PRICE_APPROVAL", { type: "price_decision", approved: true }))).toBe("DESIGN_REVIEW");
    expect(next(transition("DESIGN_REVIEW", { type: "design_decision", approvals: [arch()], versionId: "v1" }))).toBe("DESIGN_REVIEW");
    expect(next(transition("DESIGN_REVIEW", { type: "design_decision", approvals: [arch(), eng()], versionId: "v1" }))).toBe("APPROVED");
    expect(next(transition("APPROVED", { type: "sign_contract" }))).toBe("CONTRACT_SIGNED");
    expect(next(transition("CONTRACT_SIGNED", { type: "permit_prep", approvals: [arch(), eng()], versionId: "v1" }))).toBe("PERMIT_PREP");
  });

  it("auto-approves a discount within the sales limit", () => {
    const r = transition("PROPOSED", { type: "request_price", discountPct: 2, limitPct: 3 });
    expect(r.ok && r.next).toBe("DESIGN_REVIEW");
    expect(r.ok && r.autoApprovedPrice).toBe(true);
  });

  it("sends rejections back to PROPOSED", () => {
    expect(next(transition("PRICE_APPROVAL", { type: "price_decision", approved: false }))).toBe("PROPOSED");
    expect(next(transition("DESIGN_REVIEW", { type: "design_decision", approvals: [arch({ status: "CHANGES_REQUESTED" }), eng()], versionId: "v1" }))).toBe("PROPOSED");
  });

  it("cannot skip steps", () => {
    expect(transition("DRAFT", { type: "sign_contract" }).ok).toBe(false);
    expect(transition("PROPOSED", { type: "permit_prep", approvals: [arch(), eng()], versionId: "v1" }).ok).toBe(false);
    expect(transition("DRAFT", { type: "propose", hasVersion: false }).ok).toBe(false);
    expect(transition("DESIGN_REVIEW", { type: "price_decision", approved: true }).ok).toBe(false);
  });

  it("requires licensed approvals of the same version for permit preparation", () => {
    const r1 = transition("CONTRACT_SIGNED", { type: "permit_prep", approvals: [arch({ licenseNo: "" }), eng()], versionId: "v1" });
    expect(next(r1)).toMatch(/licensed architect/);
    const r2 = transition("CONTRACT_SIGNED", { type: "permit_prep", approvals: [arch(), eng({ versionId: "v0" })], versionId: "v1" });
    expect(next(r2)).toMatch(/licensed engineer/);
    // design approval also requires licence numbers
    expect(next(transition("DESIGN_REVIEW", { type: "design_decision", approvals: [arch(), eng({ licenseNo: null })], versionId: "v1" }))).toBe("DESIGN_REVIEW");
  });

  it("voids approvals when the design changes, locks after the contract", () => {
    expect(onNewVersion("DRAFT")).toEqual({ allowed: true });
    expect(onNewVersion("DESIGN_REVIEW")).toEqual({ allowed: true, resetTo: "PROPOSED" });
    expect(onNewVersion("CONTRACT_SIGNED")).toEqual({ allowed: false });
  });

  it("knows when the price is final", () => {
    expect(priceIsApproved("PRICE_APPROVAL")).toBe(false);
    expect(priceIsApproved("DESIGN_REVIEW")).toBe(true);
  });
});
