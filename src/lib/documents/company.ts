import "server-only";
import { db } from "@/lib/db";
import {
  DEFAULT_CLOSING_EN,
  DEFAULT_CLOSING_TH,
  DEFAULT_CONTRACT_EN,
  DEFAULT_CONTRACT_TH,
  DEFAULT_INTRO_EN,
  DEFAULT_INTRO_TH,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_QUOTE_TERMS_EN,
  DEFAULT_QUOTE_TERMS_TH,
  type PaymentTerm,
} from "./defaults";
import { DEFAULT_SPEC, SpecTemplateSchema, type SpecSection } from "./spec";

export interface Company {
  nameTh: string;
  nameEn: string;
  address: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo: string | null;
  vatPct: number;
  quoteValidityDays: number;
  salesDiscountLimitPct: number;
  paymentTerms: PaymentTerm[];
  quoteTermsTh: string;
  quoteTermsEn: string;
  contractTemplateTh: string;
  contractTemplateEn: string;
  quoteFormCode: string | null;
  priceIncludesVat: boolean;
  quoteIntroTh: string;
  quoteIntroEn: string;
  quoteClosingTh: string;
  quoteClosingEn: string;
  specTemplate: SpecSection[];
  /** True while the documents still use the built-in sample content. */
  usesDefaults: { terms: boolean; contract: boolean; payment: boolean; spec: boolean };
}

/** Company settings with built-in defaults filling any empty field. */
export async function getCompany(): Promise<Company> {
  const c = await db.companySettings.findUnique({ where: { id: "default" } });
  const spec = SpecTemplateSchema.safeParse(c?.specTemplate);
  const hasSpec = spec.success && spec.data.length > 0;
  const terms = Array.isArray(c?.paymentTerms) ? (c!.paymentTerms as unknown as PaymentTerm[]) : null;
  return {
    nameTh: c?.nameTh ?? "บริษัทของคุณ",
    nameEn: c?.nameEn ?? "Your company",
    address: c?.address ?? null,
    taxId: c?.taxId ?? null,
    phone: c?.phone ?? null,
    email: c?.email ?? null,
    website: c?.website ?? null,
    logo: c?.logoUrl ?? null,
    vatPct: Number(c?.vatPct ?? 7),
    quoteValidityDays: c?.quoteValidityDays ?? 30,
    salesDiscountLimitPct: Number(c?.salesDiscountLimitPct ?? 3),
    paymentTerms: terms?.length ? terms : DEFAULT_PAYMENT_TERMS,
    quoteTermsTh: c?.quoteTermsTh || DEFAULT_QUOTE_TERMS_TH,
    quoteTermsEn: c?.quoteTermsEn || DEFAULT_QUOTE_TERMS_EN,
    contractTemplateTh: c?.contractTemplateTh || DEFAULT_CONTRACT_TH,
    contractTemplateEn: c?.contractTemplateEn || DEFAULT_CONTRACT_EN,
    quoteFormCode: c?.quoteFormCode ?? null,
    priceIncludesVat: c?.priceIncludesVat ?? true,
    quoteIntroTh: c?.quoteIntroTh || DEFAULT_INTRO_TH,
    quoteIntroEn: c?.quoteIntroEn || DEFAULT_INTRO_EN,
    quoteClosingTh: c?.quoteClosingTh || DEFAULT_CLOSING_TH,
    quoteClosingEn: c?.quoteClosingEn || DEFAULT_CLOSING_EN,
    specTemplate: hasSpec ? spec.data : DEFAULT_SPEC,
    usesDefaults: { terms: !c?.quoteTermsTh, contract: !c?.contractTemplateTh, payment: !terms?.length, spec: !hasSpec },
  };
}
