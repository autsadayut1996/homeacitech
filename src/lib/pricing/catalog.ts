import "server-only";
import { db } from "@/lib/db";
import type { Plan } from "@/lib/plan-core";
import { estimate, type CatalogMaterial, type Package, type Slot } from "./materials";

export async function loadCatalog(): Promise<CatalogMaterial[]> {
  const rows = await db.material.findMany({ where: { active: true }, orderBy: [{ slot: "asc" }, { sortOrder: "asc" }] });
  return rows.map((m) => ({
    code: m.code,
    slot: m.slot as Slot,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    unit: m.unit,
    unitPrice: Number(m.unitPrice),
    color: m.color,
    roughness: m.roughness,
    defaultFor: m.defaultFor as Package[],
    isSample: m.isSample,
  }));
}

export async function estimatePlan(plan: Plan) {
  return estimate(plan, await loadCatalog());
}
