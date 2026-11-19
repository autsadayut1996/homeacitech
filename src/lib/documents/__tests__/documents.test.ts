import { describe, expect, it } from "vitest";
import { bahtText, bahtTextEn } from "../bahttext";
import { computeMoney, renderTemplate, splitInstallments, validatePaymentTerms } from "../snapshot";
import { DEFAULT_PAYMENT_TERMS } from "../defaults";

describe("bahtText", () => {
  it.each([
    [0, "ศูนย์บาทถ้วน"],
    [1, "หนึ่งบาทถ้วน"],
    [11, "สิบเอ็ดบาทถ้วน"],
    [21, "ยี่สิบเอ็ดบาทถ้วน"],
    [101, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [1_000_000, "หนึ่งล้านบาทถ้วน"],
    [1_000_001, "หนึ่งล้านเอ็ดบาทถ้วน"],
    [11_000_000, "สิบเอ็ดล้านบาทถ้วน"],
    [5_250_000, "ห้าล้านสองแสนห้าหมื่นบาทถ้วน"],
    [4_914_000, "สี่ล้านเก้าแสนหนึ่งหมื่นสี่พันบาทถ้วน"],
    [1234.5, "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"],
    [0.25, "ยี่สิบห้าสตางค์"],
    [120_000_000, "หนึ่งร้อยยี่สิบล้านบาทถ้วน"],
  ])("%d → %s", (n, text) => expect(bahtText(n)).toBe(text));

  it("has an English version", () => {
    expect(bahtTextEn(5_250_000)).toBe("Five million two hundred fifty thousand baht only");
    expect(bahtTextEn(1234.5)).toBe("One thousand two hundred thirty-four baht and fifty satang");
  });
});

describe("money", () => {
  it("applies discount then VAT", () => {
    expect(computeMoney(5_000_000, 100_000, 7)).toEqual({ subtotal: 5_000_000, discount: 100_000, afterDiscount: 4_900_000, vatPct: 7, vat: 343_000, total: 5_243_000 });
    expect(computeMoney(1000, 5000, 7).discount).toBe(1000); // never more than the subtotal
  });

  it("splits instalments that add up exactly", () => {
    const parts = splitInstallments(5_243_000.33, DEFAULT_PAYMENT_TERMS);
    expect(parts).toHaveLength(7);
    expect(parts[0].amount).toBe(524_300);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(5_243_000.33, 2);
  });

  it("validates payment terms", () => {
    expect(validatePaymentTerms(DEFAULT_PAYMENT_TERMS)).toBeNull();
    expect(validatePaymentTerms([{ labelTh: "a", labelEn: "a", pct: 60 }])).toMatch(/60/);
    expect(validatePaymentTerms([])).toBeTruthy();
  });
});

describe("contract template", () => {
  it("fills known placeholders and leaves unknown ones visible", () => {
    expect(renderTemplate("ผู้ว่าจ้าง {{customer.name}} / {{ price.total }} / {{oops}}", { "customer.name": "สมชาย", "price.total": "1,000.00" })).toBe(
      "ผู้ว่าจ้าง สมชาย / 1,000.00 / {{oops}}",
    );
  });
});
