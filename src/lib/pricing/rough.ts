import type { Plan, PlanMetrics } from "@/lib/plan-core";

/**
 * PLACEHOLDER rough construction rates (THB per m²) used only until the company price
 * list is imported and the BOQ is computed (milestone 6). Shown in the UI as an estimate.
 */
export const ROUGH_RATES: Record<Plan["specPackage"], { indoor: number; outdoor: number }> = {
  standard: { indoor: 14000, outdoor: 7000 },
  premium: { indoor: 18000, outdoor: 9000 },
  luxury: { indoor: 25000, outdoor: 12000 },
};

export function roughPrice(m: PlanMetrics, pkg: Plan["specPackage"] = "standard"): number {
  const r = ROUGH_RATES[pkg];
  const outdoor = m.totalAreaM2 - m.indoorAreaM2;
  return Math.round((m.indoorAreaM2 * r.indoor + outdoor * r.outdoor) / 1000) * 1000;
}
