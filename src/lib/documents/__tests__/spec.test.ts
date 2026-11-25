import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, SpecTemplateSchema, resolveSpec } from "../spec";
import { computeMoney, noteLines } from "../snapshot";
import { DEFAULT_QUOTE_TERMS_EN, DEFAULT_QUOTE_TERMS_TH } from "../defaults";

describe("specification template", () => {
  it("default template is valid and covers the reference categories", () => {
    expect(SpecTemplateSchema.safeParse(DEFAULT_SPEC).success).toBe(true);
    expect(DEFAULT_SPEC.length).toBeGreaterThanOrEqual(17);
    // every material slot appears somewhere so a chosen material always reaches the quotation
    const slots = new Set(DEFAULT_SPEC.flatMap((s) => s.items.map((i) => i.slot).filter(Boolean)));
    expect([...slots].sort()).toEqual(["ceiling", "door", "exterior_wall", "floor", "interior_wall", "kitchen", "roof", "sanitary", "window"]);
  });

  it("fills linked items with the chosen material and appends the template text", () => {
    const out = resolveSpec(
      [{ titleTh: "หลังคา", titleEn: "Roof", items: [{ th: "มุงหลังคา", en: "Covering", specTh: "พร้อมแผ่นสะท้อนความร้อน", specEn: "with foil", slot: "roof" }, { th: "โครง", en: "Frame", specTh: "เหล็ก", specEn: "Steel" }] }],
      { roof: { nameTh: "กระเบื้องคอนกรีต", nameEn: "Concrete tiles" } },
    );
    expect(out[0].items[0].specTh).toBe("กระเบื้องคอนกรีต — พร้อมแผ่นสะท้อนความร้อน");
    expect(out[0].items[0].specEn).toBe("Concrete tiles — with foil");
    expect(out[0].items[1].specTh).toBe("เหล็ก");
  });

  it("keeps the template text when no material is chosen for the slot", () => {
    const out = resolveSpec([{ titleTh: "ครัว", titleEn: "", items: [{ th: "ชุดครัว", en: "", specTh: "ตามแบบ", specEn: "", slot: "kitchen" }] }], {});
    expect(out[0].items[0].specTh).toBe("ตามแบบ");
  });
});

describe("quotation money and notes", () => {
  it("extracts VAT from VAT-inclusive prices", () => {
    const m = computeMoney(1_070_000, 70_000, 7, true);
    expect(m.total).toBe(1_000_000);
    expect(m.vat).toBeCloseTo(65_420.56, 2);
    expect(m.vatIncluded).toBe(true);
  });

  it("splits notes into lines and strips numbering", () => {
    expect(noteLines("1. a\n\n2) b\n- c\n  d  ")).toEqual(["a", "b", "c", "d"]);
    expect(noteLines(DEFAULT_QUOTE_TERMS_TH).length).toBe(noteLines(DEFAULT_QUOTE_TERMS_EN).length);
  });
});
