import { computeMetrics, takeoff, type Plan, type Quantities } from "@/lib/plan-core";
import { basePrice } from "./rough";

export const SLOTS = ["roof", "exterior_wall", "interior_wall", "floor", "ceiling", "window", "door", "sanitary", "kitchen"] as const;
export type Slot = (typeof SLOTS)[number];
export type Package = Plan["specPackage"];
export const PACKAGES: Package[] = ["standard", "premium", "luxury"];

/** Which takeoff quantity each slot is priced on. */
export const SLOT_QUANTITY: Record<Slot, keyof Quantities> = {
  roof: "mainRoofM2",
  exterior_wall: "exteriorPaintM2",
  interior_wall: "interiorPaintM2",
  floor: "floorIndoorM2",
  ceiling: "ceilingM2",
  window: "glazedM2",
  door: "doorCount",
  sanitary: "bathroomCount",
  kitchen: "kitchenCount",
};

/** Plain-object material (serialisable to the client). */
export interface CatalogMaterial {
  code: string;
  slot: Slot;
  nameTh: string;
  nameEn: string;
  unit: string;
  unitPrice: number;
  color: string;
  roughness: number;
  defaultFor: Package[];
  isSample: boolean;
}

export function defaultMaterial(catalog: CatalogMaterial[], slot: Slot, pkg: Package): CatalogMaterial | undefined {
  const inSlot = catalog.filter((m) => m.slot === slot);
  return inSlot.find((m) => m.defaultFor.includes(pkg)) ?? inSlot.find((m) => m.defaultFor.includes("standard")) ?? inSlot[0];
}

/** The material in effect for a slot: explicit selection, else the package default. */
export function selectedMaterial(plan: Plan, catalog: CatalogMaterial[], slot: Slot): CatalogMaterial | undefined {
  const code = plan.selections[slot];
  return (code && catalog.find((m) => m.code === code && m.slot === slot)) || defaultMaterial(catalog, slot, plan.specPackage);
}

export interface EstimateLine {
  slot: Slot;
  material?: CatalogMaterial;
  quantity: number;
  /** Extra cost vs the standard-package default (can be negative). */
  delta: number;
}

export interface Estimate {
  base: number;
  lines: EstimateLine[];
  materialsDelta: number;
  total: number;
  quantities: Quantities;
  usesSamplePrices: boolean;
}

/** Rough estimate: base rate (standard finishes) + upgrade/downgrade per material slot. */
export function estimate(plan: Plan, catalog: CatalogMaterial[]): Estimate {
  const quantities = takeoff(plan);
  const base = basePrice(computeMetrics(plan));
  const lines: EstimateLine[] = SLOTS.map((slot) => {
    const quantity = quantities[SLOT_QUANTITY[slot]];
    const material = selectedMaterial(plan, catalog, slot);
    const std = defaultMaterial(catalog, slot, "standard");
    const delta = material && std ? quantity * (material.unitPrice - std.unitPrice) : 0;
    return { slot, material, quantity, delta };
  });
  const materialsDelta = lines.reduce((s, l) => s + l.delta, 0);
  const total = Math.round((base + materialsDelta) / 1000) * 1000;
  return { base, lines, materialsDelta, total, quantities, usesSamplePrices: catalog.some((m) => m.isSample) };
}

/** Price change of picking `code` for `slot`, relative to what the plan currently uses. */
export function priceChangeFor(plan: Plan, catalog: CatalogMaterial[], slot: Slot, code: string): number {
  const current = selectedMaterial(plan, catalog, slot);
  const next = catalog.find((m) => m.code === code);
  if (!current || !next) return 0;
  return takeoff(plan)[SLOT_QUANTITY[slot]] * (next.unitPrice - current.unitPrice);
}

/** Apply a package: clears per-slot overrides so every slot uses the package default. */
export function applyPackage(plan: Plan, pkg: Package): Plan {
  return { ...plan, specPackage: pkg, selections: {} };
}

export function selectMaterial(plan: Plan, catalog: CatalogMaterial[], slot: Slot, code: string): Plan {
  const selections = { ...plan.selections };
  if (defaultMaterial(catalog, slot, plan.specPackage)?.code === code) delete selections[slot];
  else selections[slot] = code;
  return { ...plan, selections };
}
