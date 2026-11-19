"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { validatePaymentTerms } from "@/lib/documents/snapshot";
import type { PaymentTerm } from "@/lib/documents/defaults";

export interface CompanyInput {
  nameTh: string;
  nameEn: string;
  address: string;
  taxId: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;
  vatPct: number;
  quoteValidityDays: number;
  salesDiscountLimitPct: number;
  paymentTerms: PaymentTerm[];
  quoteTermsTh: string;
  quoteTermsEn: string;
  contractTemplateTh: string;
  contractTemplateEn: string;
}

export async function saveCompany(input: CompanyInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.nameTh.trim()) return { ok: false, error: "nameTh: required" };
  const termsError = validatePaymentTerms(input.paymentTerms);
  if (termsError) return { ok: false, error: `paymentTerms: ${termsError}` };
  if (!(input.vatPct >= 0 && input.vatPct <= 30)) return { ok: false, error: "vatPct: 0–30" };
  if (!(input.quoteValidityDays >= 1 && input.quoteValidityDays <= 365)) return { ok: false, error: "quoteValidityDays: 1–365" };
  if (!(input.salesDiscountLimitPct >= 0 && input.salesDiscountLimitPct <= 50)) return { ok: false, error: "salesDiscountLimitPct: 0–50" };
  if (input.logo && (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(input.logo) || input.logo.length > 600_000)) return { ok: false, error: "logo: PNG/JPEG/WebP/SVG up to ~400 KB" };
  const opt = (s: string) => s.trim() || null;
  const data = {
    nameTh: input.nameTh.trim(),
    nameEn: input.nameEn.trim() || input.nameTh.trim(),
    address: opt(input.address),
    taxId: opt(input.taxId),
    phone: opt(input.phone),
    email: opt(input.email),
    website: opt(input.website),
    logoUrl: input.logo,
    vatPct: input.vatPct,
    quoteValidityDays: Math.round(input.quoteValidityDays),
    salesDiscountLimitPct: input.salesDiscountLimitPct,
    paymentTerms: input.paymentTerms.map((t) => ({ labelTh: t.labelTh.trim(), labelEn: t.labelEn.trim() || t.labelTh.trim(), pct: t.pct })) as unknown as Prisma.InputJsonValue,
    quoteTermsTh: opt(input.quoteTermsTh),
    quoteTermsEn: opt(input.quoteTermsEn),
    contractTemplateTh: opt(input.contractTemplateTh),
    contractTemplateEn: opt(input.contractTemplateEn),
  };
  await db.companySettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  revalidatePath("/settings/company");
  return { ok: true };
}
