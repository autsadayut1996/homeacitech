"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LandSchema, RequirementsSchema, landAreaSqWa } from "@/lib/brief";
import { PlanSchema, computeMetrics } from "@/lib/plan-core";
import { loadCatalog } from "@/lib/pricing/catalog";
import { estimate } from "@/lib/pricing/materials";
import { getCompany } from "@/lib/documents/company";
import { computeMoney, splitInstallments, type QuoteSnapshot } from "@/lib/documents/snapshot";
import { latestVersion } from "@/lib/versions";
import { priceIsApproved, type Status } from "@/lib/workflow";

export type QuoteResult = { ok: true; quotationId: string } | { ok: false; error: { th: string; en: string } };

async function nextQuoteNumber() {
  const prefix = `QT-${new Date().getFullYear()}-`;
  const last = await db.quotation.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  return `${prefix}${String(last ? Number(last.number.slice(prefix.length)) + 1 : 1).padStart(4, "0")}`;
}

const SLOT_TH: Record<string, string> = { roof: "หลังคา", exterior_wall: "ผนังภายนอก", interior_wall: "ผนังภายใน", floor: "พื้น", ceiling: "ฝ้าเพดาน", window: "หน้าต่าง", door: "ประตู", sanitary: "สุขภัณฑ์", kitchen: "ชุดครัว" };
const SLOT_EN: Record<string, string> = { roof: "Roof", exterior_wall: "Exterior walls", interior_wall: "Interior walls", floor: "Flooring", ceiling: "Ceiling", window: "Windows", door: "Doors", sanitary: "Sanitary ware", kitchen: "Kitchen" };

/** Issue a quotation for the project's latest version. Everything printed is frozen in `snapshot`. */
export async function createQuotation(projectId: string, locale: "th" | "en"): Promise<QuoteResult> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { customer: true, brief: true, approvals: true } });
  if (!project) return { ok: false, error: { th: "ไม่พบโปรเจกต์", en: "Project not found" } };
  const version = await latestVersion(projectId);
  const plan = version && PlanSchema.safeParse(version.plan);
  if (!version || !plan || !plan.success) return { ok: false, error: { th: "ต้องมีแบบอย่างน้อย 1 เวอร์ชัน", en: "Save or choose a design version first" } };

  const [company, catalog, priceList] = await Promise.all([getCompany(), loadCatalog(), db.priceListVersion.findFirst({ where: { isActive: true }, orderBy: { effectiveAt: "desc" } })]);
  const est = estimate(plan.data, catalog);
  const m = computeMetrics(plan.data);
  const land = LandSchema.safeParse(project.brief?.land);
  const req = RequirementsSchema.safeParse(project.brief?.requirements);
  const approvedPrice = project.approvals.findLast((a) => a.type === "PRICE" && a.status === "APPROVED" && a.versionId === version.id);
  const isDraft = !(approvedPrice && priceIsApproved(project.status as Status));
  const discount = approvedPrice?.discountAmount ? Number(approvedPrice.discountAmount) : 0;

  const upgrades = est.lines.filter((l) => Math.abs(l.delta) >= 1);
  const upgradeTotal = upgrades.reduce((s, l) => s + Math.round(l.delta), 0);
  const lines: QuoteSnapshot["lines"] = [
    {
      labelTh: `ค่าก่อสร้างตามแบบ วัสดุมาตรฐาน (พื้นที่ใช้สอยรวม ${m.totalAreaM2.toFixed(0)} ตร.ม.)`,
      labelEn: `Construction to the design, standard specification (${m.totalAreaM2.toFixed(0)} m² total)`,
      amount: est.total - upgradeTotal,
    },
    ...upgrades.map((l) => ({
      labelTh: `${l.delta > 0 ? "ปรับเพิ่ม" : "ปรับลด"}: ${SLOT_TH[l.slot]} — ${l.material?.nameTh ?? ""}`,
      labelEn: `${l.delta > 0 ? "Upgrade" : "Downgrade"}: ${SLOT_EN[l.slot]} — ${l.material?.nameEn ?? ""}`,
      amount: Math.round(l.delta),
    })),
  ];
  const money = computeMoney(est.total, discount, company.vatPct);
  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + company.quoteValidityDays * 86400_000);
  const th = locale === "th";
  const dateFmt = (d: Date) => d.toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const priceReference = [
    priceList ? `${th ? "ฐานราคา" : "Price base"}: ${priceList.name} (${th ? "มีผล" : "effective"} ${dateFmt(priceList.effectiveAt)})` : null,
    est.usesSamplePrices ? (th ? "ราคาวัสดุ: ข้อมูลตัวอย่าง" : "Material prices: sample data") : null,
    `${th ? "คำนวณเมื่อ" : "Calculated"} ${dateFmt(issuedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const number = await nextQuoteNumber();
  const snapshot: QuoteSnapshot = {
    locale,
    number,
    issuedAt: issuedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    isDraft,
    company: { nameTh: company.nameTh, nameEn: company.nameEn, address: company.address, taxId: company.taxId, phone: company.phone, email: company.email, website: company.website, logo: company.logo },
    customer: { name: project.customer.name, phone: project.customer.phone, email: project.customer.email },
    project: {
      code: project.code,
      title: project.title,
      location: land.success ? [land.data.district, land.data.province].filter(Boolean).join(", ") : "-",
      buildingType: req.success ? req.data.buildingType : null,
      style: req.success ? req.data.style : null,
    },
    version: { number: version.number, label: version.label },
    plan: plan.data,
    areas: {
      total: m.totalAreaM2,
      indoor: m.indoorAreaM2,
      bedrooms: m.bedrooms,
      bathrooms: m.bathrooms,
      parking: m.parkingSpaces,
      landSqWa: land.success ? landAreaSqWa(land.data).sqwa : m.landAreaSqWa,
    },
    spec: est.lines
      .filter((l) => l.material)
      .map((l) => ({ slot: l.slot, nameTh: l.material!.nameTh, nameEn: l.material!.nameEn, quantity: Math.round(l.quantity * 100) / 100, unit: l.material!.unit })),
    packageName: plan.data.specPackage,
    lines,
    money,
    installments: splitInstallments(money.total, company.paymentTerms),
    terms: th ? company.quoteTermsTh : company.quoteTermsEn,
    contractTemplate: th ? company.contractTemplateTh : company.contractTemplateEn,
    priceReference,
  };

  const q = await db.quotation.create({
    data: {
      projectId,
      versionId: version.id,
      number,
      discount: money.discount,
      isDraft,
      locale,
      validUntil,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, quotationId: q.id };
}
