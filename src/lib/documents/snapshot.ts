import type { Plan } from "@/lib/plan-core";
import type { PaymentTerm } from "./defaults";
import { bahtText, bahtTextEn } from "./bahttext";

/** Everything printed on a quotation/contract, frozen when the document is issued. */
export interface QuoteSnapshot {
  locale: "th" | "en";
  number: string;
  issuedAt: string;
  validUntil: string;
  isDraft: boolean;
  company: { nameTh: string; nameEn: string; address: string | null; taxId: string | null; phone: string | null; email: string | null; website: string | null; logo: string | null };
  customer: { name: string; phone: string | null; email: string | null };
  project: { code: string; title: string; location: string; buildingType: string | null; style: string | null };
  version: { number: number | null; label: string | null };
  plan: Plan;
  areas: { total: number; indoor: number; bedrooms: number; bathrooms: number; parking: number; landSqWa: number };
  /** Specification lines (material per slot). */
  spec: { slot: string; nameTh: string; nameEn: string; quantity: number; unit: string }[];
  packageName: string;
  /** Price lines shown in the summary table. */
  lines: { labelTh: string; labelEn: string; amount: number }[];
  money: Money;
  installments: { labelTh: string; labelEn: string; pct: number; amount: number }[];
  terms: string;
  contractTemplate: string;
  priceReference: string;
}

export interface Money {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  vatPct: number;
  vat: number;
  total: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Subtotal (before VAT) → discount → VAT → total. */
export function computeMoney(subtotal: number, discount: number, vatPct: number): Money {
  const d = Math.min(Math.max(0, discount), subtotal);
  const afterDiscount = r2(subtotal - d);
  const vat = r2((afterDiscount * vatPct) / 100);
  return { subtotal: r2(subtotal), discount: r2(d), afterDiscount, vatPct, vat, total: r2(afterDiscount + vat) };
}

/** Split the total into instalments; the last one absorbs rounding so the sum is exact. */
export function splitInstallments(total: number, terms: PaymentTerm[]) {
  let used = 0;
  return terms.map((t, i) => {
    const amount = i === terms.length - 1 ? r2(total - used) : r2(Math.round((total * t.pct) / 100));
    used = r2(used + amount);
    return { ...t, amount };
  });
}

export function validatePaymentTerms(terms: PaymentTerm[]): string | null {
  if (!terms.length) return "at least one instalment";
  if (terms.some((t) => !t.labelTh.trim() || !(t.pct > 0))) return "every instalment needs a label and a percentage > 0";
  const sum = terms.reduce((s, t) => s + t.pct, 0);
  return Math.abs(sum - 100) > 1e-6 ? `percentages add up to ${sum}, not 100` : null;
}

/** Fill {{placeholders}} in a contract template. Unknown placeholders are left visible. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export function contractVars(s: QuoteSnapshot): Record<string, string> {
  const th = s.locale === "th";
  const fmt = (n: number) => n.toLocaleString(th ? "th-TH" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    date: new Date(s.issuedAt).toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" }),
    "company.name": th ? s.company.nameTh : s.company.nameEn,
    "company.address": s.company.address ?? "-",
    "company.taxId": s.company.taxId ?? "-",
    "customer.name": s.customer.name,
    "customer.phone": s.customer.phone ?? "-",
    "project.code": s.project.code,
    "project.location": s.project.location,
    version: String(s.version.number ?? "-"),
    area: s.areas.total.toFixed(0),
    "price.total": fmt(s.money.total),
    "price.totalText": th ? bahtText(s.money.total) : bahtTextEn(s.money.total),
    "quotation.number": s.number,
    "payment.schedule": s.installments.map((i) => `   - ${th ? i.labelTh : i.labelEn} ${i.pct}% = ${fmt(i.amount)} ${th ? "บาท" : "THB"}`).join("\n"),
  };
}
