import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { takeoff } from "@/lib/plan-core";
import { applyPackage, estimate, priceChangeFor, selectMaterial, selectedMaterial, type CatalogMaterial } from "../materials";

const m = (code: string, slot: CatalogMaterial["slot"], unitPrice: number, defaultFor: CatalogMaterial["defaultFor"] = []): CatalogMaterial => ({
  code, slot, unitPrice, defaultFor, nameTh: code, nameEn: code, unit: "m2", color: "#fff", roughness: 0.5, isSample: true,
});
const catalog = [
  m("FLR-STD", "floor", 450, ["standard"]),
  m("FLR-PREM", "floor", 900, ["premium", "luxury"]),
  m("FLR-WOOD", "floor", 2200),
  m("SAN-STD", "sanitary", 22000, ["standard"]),
  m("SAN-LUX", "sanitary", 90000, ["luxury"]),
];

describe("material pricing", () => {
  const plan = sampleTwoStoreyPlan();
  const q = takeoff(plan);

  it("standard package has no upgrade cost", () => {
    const e = estimate(plan, catalog);
    expect(e.materialsDelta).toBe(0);
    expect(e.total).toBe(Math.round(e.base / 1000) * 1000);
  });

  it("prices an explicit upgrade on its quantity", () => {
    const p = selectMaterial(plan, catalog, "floor", "FLR-WOOD");
    expect(selectedMaterial(p, catalog, "floor")?.code).toBe("FLR-WOOD");
    expect(estimate(p, catalog).materialsDelta).toBeCloseTo(q.floorIndoorM2 * (2200 - 450));
    expect(priceChangeFor(plan, catalog, "floor", "FLR-WOOD")).toBeCloseTo(q.floorIndoorM2 * 1750);
    // switching back to the package default removes the override
    expect(selectMaterial(p, catalog, "floor", "FLR-STD").selections).toEqual({});
  });

  it("packages switch every slot to their defaults", () => {
    const lux = applyPackage(selectMaterial(plan, catalog, "floor", "FLR-WOOD"), "luxury");
    expect(lux.selections).toEqual({});
    const e = estimate(lux, catalog);
    expect(e.lines.find((l) => l.slot === "floor")?.material?.code).toBe("FLR-PREM");
    expect(e.lines.find((l) => l.slot === "sanitary")?.delta).toBe(3 * (90000 - 22000));
  });
});
