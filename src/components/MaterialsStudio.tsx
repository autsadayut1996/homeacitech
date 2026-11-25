"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Plan } from "@/lib/plan-core";
import {
  PACKAGES,
  SLOTS,
  applyPackage,
  estimate,
  priceChangeFor,
  selectMaterial,
  selectedMaterial,
  type CatalogMaterial,
} from "@/lib/pricing/materials";
import { savePlanVersion } from "@/app/projects/[id]/edit/actions";

/** Spec packages and per-slot materials with live price changes (no 3D — the architect does that). */
export function MaterialsStudio({
  projectId,
  baseVersion,
  initialPlan,
  catalog,
  savedTotal,
  locale,
}: {
  projectId: string;
  baseVersion: { id: string; number: number | null };
  initialPlan: Plan;
  catalog: CatalogMaterial[];
  savedTotal: number | null;
  locale: "th" | "en";
}) {
  const t = useTranslations("studio");
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = plan !== initialPlan;

  const est = useMemo(() => estimate(plan, catalog), [plan, catalog]);
  const packageTotals = useMemo(() => Object.fromEntries(PACKAGES.map((p) => [p, estimate(applyPackage(plan, p), catalog).total])), [plan, catalog]);

  const nf = (n: number) => n.toLocaleString(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 });
  const baht = (n: number) => `฿${nf(n)}`;
  const signed = (n: number) => (Math.abs(n) < 1 ? "±0" : `${n > 0 ? "+" : "−"}฿${nf(Math.abs(n))}`);
  const name = (m: CatalogMaterial) => (locale === "th" ? m.nameTh : m.nameEn);
  const unitLabel = (u: string) => t(`unit_${u}` as never);

  const save = async () => {
    setSaving(true);
    setError(null);
    const changed = SLOTS.filter((s) => selectedMaterial(plan, catalog, s)?.code !== selectedMaterial(initialPlan, catalog, s)?.code)
      .map((s) => name(selectedMaterial(plan, catalog, s)!))
      .slice(0, 3);
    const label = plan.specPackage !== initialPlan.specPackage ? `${t("package")}: ${t(`pkg_${plan.specPackage}`)}` : `${t("materials")}: ${changed.join(", ")}`;
    const res = await savePlanVersion(projectId, baseVersion.id, plan, label);
    setSaving(false);
    if (res.ok) {
      router.push(`/projects/${projectId}?v=${res.versionId}`);
      router.refresh();
    } else setError(res.error);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* summary: total, packages, per-slot breakdown */}
      <aside className="space-y-3 lg:sticky lg:top-4">
        <div className="card space-y-2 p-4">
          <p className="text-xs text-muted">{t("estimate")}</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="total">
            {baht(est.total)}
          </p>
          {savedTotal !== null && (
            <p className={`text-sm font-medium ${est.total > savedTotal ? "text-warn" : est.total < savedTotal ? "text-ok" : "text-muted"}`} data-testid="vs-saved">
              {signed(est.total - savedTotal)} {t("vsSaved", { n: baseVersion.number ?? "?" })}
            </p>
          )}
          <p className="text-xs text-muted">{t("breakdown", { base: baht(est.base), up: signed(est.materialsDelta) })}</p>
          {est.usesSamplePrices && <p className="rounded bg-amber-50 p-2 text-xs text-warn">⚠️ {t("samplePrices")}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!dirty || saving} onClick={save}>
              {saving ? t("saving") : t("save")}
            </button>
            <button className="btn-ghost" disabled={!dirty || saving} onClick={() => setPlan(initialPlan)}>
              {t("reset")}
            </button>
          </div>
          {error && <p className="text-xs text-bad">{error}</p>}
        </div>

        <div className="card p-4">
          <p className="mb-2 font-semibold">{t("package")}</p>
          <div className="grid grid-cols-3 gap-2">
            {PACKAGES.map((p) => {
              const active = plan.specPackage === p && Object.keys(plan.selections).length === 0;
              return (
                <button
                  key={p}
                  onClick={() => setPlan((cur) => applyPackage(cur, p))}
                  className={`rounded-md border p-2 text-left text-sm ${active ? "border-accent bg-accent/10" : plan.specPackage === p ? "border-accent" : "border-line hover:bg-bg"}`}
                >
                  <span className="block font-medium">{t(`pkg_${p}`)}</span>
                  <span className="block text-xs tabular-nums text-muted">{baht(packageTotals[p])}</span>
                  {!active && <span className="block text-xs tabular-nums">{signed(packageTotals[p] - est.total)}</span>}
                </button>
              );
            })}
          </div>
          {Object.keys(plan.selections).length > 0 && <p className="mt-2 text-xs text-muted">{t("customised", { n: Object.keys(plan.selections).length })}</p>}
        </div>

        <div className="card p-4">
          <p className="mb-2 font-semibold">{t("summaryTitle")}</p>
          <table className="w-full text-xs" data-testid="slot-summary">
            <tbody>
              {est.lines.map((l) => (
                <tr key={l.slot} className="border-t border-line">
                  <td className="py-1 pr-2 text-muted">{t(`slot_${l.slot}`)}</td>
                  <td className="pr-2">{l.material ? name(l.material) : "—"}</td>
                  <td className={`whitespace-nowrap text-right tabular-nums ${l.delta > 0 ? "text-warn" : l.delta < 0 ? "text-ok" : "text-muted"}`}>{signed(l.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">{t("deltaNote")}</p>
        </div>
      </aside>

      {/* material choices */}
      <div className="grid gap-3 md:grid-cols-2">
        {SLOTS.map((slot) => {
          const options = catalog.filter((m) => m.slot === slot);
          if (!options.length) return null;
          const current = selectedMaterial(plan, catalog, slot);
          const line = est.lines.find((l) => l.slot === slot)!;
          return (
            <div key={slot} className="card p-4" data-testid={`slot-${slot}`}>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="font-semibold">{t(`slot_${slot}`)}</p>
                <p className="text-xs text-muted">
                  {nf(line.quantity)} {current ? unitLabel(current.unit) : ""}
                </p>
              </div>
              <ul className="space-y-1">
                {options.map((m) => {
                  const on = current?.code === m.code;
                  const diff = on ? 0 : priceChangeFor(plan, catalog, slot, m.code);
                  return (
                    <li key={m.code}>
                      <button
                        onClick={() => setPlan((cur) => selectMaterial(cur, catalog, slot, m.code))}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm ${on ? "border-accent bg-accent/10" : "border-transparent hover:bg-bg"}`}
                      >
                        <span className="h-5 w-5 shrink-0 rounded border border-line" style={{ background: m.color }} />
                        <span className="flex-1">
                          {name(m)}
                          <span className="block text-xs text-muted">
                            {baht(m.unitPrice)}/{unitLabel(m.unit)}
                            {m.defaultFor.length > 0 && ` · ${m.defaultFor.map((p) => t(`pkg_${p}`)).join(", ")}`}
                          </span>
                        </span>
                        <span className={`text-xs tabular-nums ${on ? "text-accent" : diff > 0 ? "text-warn" : diff < 0 ? "text-ok" : "text-muted"}`}>
                          {on ? t("inUse") : signed(diff)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
