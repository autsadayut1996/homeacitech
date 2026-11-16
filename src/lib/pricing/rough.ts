import type { PlanMetrics } from "@/lib/plan-core";

/**
 * PLACEHOLDER base construction rate (THB per m²) with STANDARD-package finishes, used until
 * the company price list is imported and the full BOQ is computed (milestone 6).
 * Package/material upgrades are priced on top of this by `estimate()` (materials.ts).
 */
export const BASE_RATE = { indoor: 14000, outdoor: 7000 };

export function basePrice(m: Pick<PlanMetrics, "indoorAreaM2" | "totalAreaM2">): number {
  const outdoor = m.totalAreaM2 - m.indoorAreaM2;
  return Math.round(m.indoorAreaM2 * BASE_RATE.indoor + outdoor * BASE_RATE.outdoor);
}
