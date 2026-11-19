"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
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
  type Slot,
} from "@/lib/pricing/materials";
import { savePlanVersion } from "@/app/projects/[id]/edit/actions";
import { savePreviewImage } from "@/app/projects/[id]/quote-actions";
import type { Colors } from "./HouseScene";

const HouseScene = dynamic(() => import("./HouseScene"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D…</div> });

/** Which 3D surface each material slot colours. */
const SLOT_MAT: Partial<Record<Slot, keyof Colors>> = {
  roof: "roof",
  exterior_wall: "ext_wall",
  interior_wall: "int_wall",
  floor: "floor",
  window: "window_frame",
  door: "door",
};

export function DesignStudio({
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
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [showLevel, setShowLevel] = useState<number | "all">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = plan !== initialPlan;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  const snapshot3d = async () => {
    const c = canvasRef.current;
    if (!c) return;
    // downscale to keep the stored image small
    const w = Math.min(1200, c.width);
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = Math.round((c.height * w) / c.width);
    tmp.getContext("2d")!.drawImage(c, 0, 0, tmp.width, tmp.height);
    const r = await savePreviewImage(baseVersion.id, tmp.toDataURL("image/jpeg", 0.85));
    setSnapMsg(r.ok ? t("snapSaved") : (r.error ?? "error"));
  };

  const est = useMemo(() => estimate(plan, catalog), [plan, catalog]);
  const packageTotals = useMemo(() => Object.fromEntries(PACKAGES.map((p) => [p, estimate(applyPackage(plan, p), catalog).total])), [plan, catalog]);
  const colors = useMemo(() => {
    const c: Colors = {};
    for (const slot of SLOTS) {
      const key = SLOT_MAT[slot];
      const m = selectedMaterial(plan, catalog, slot);
      if (key && m) c[key] = { color: m.color, roughness: m.roughness };
    }
    return c;
  }, [plan, catalog]);

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
    <div className="flex h-[calc(100vh-9rem)] min-h-[600px] gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-md border border-line bg-paper">
            {(["orbit", "walk"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-ink text-white" : "hover:bg-bg"}`}>
                {t(`mode_${m}`)}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line bg-paper">
            <button onClick={() => setShowLevel("all")} className={`px-3 py-1.5 ${showLevel === "all" ? "bg-accent text-white" : "hover:bg-bg"}`}>
              {t("wholeHouse")}
            </button>
            {plan.levels.map((l, i) => (
              <button key={l.id} onClick={() => setShowLevel(i)} className={`px-3 py-1.5 ${showLevel === i ? "bg-accent text-white" : "hover:bg-bg"}`}>
                {l.name[locale]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t(`hint_${mode}`)}</p>
          <button className="btn-ghost ml-auto px-2 py-1.5" onClick={snapshot3d} title={t("snapHint")}>
            📷 {t("snap")}
          </button>
          {snapMsg && <span className="text-xs text-ok">{snapMsg}</span>}
        </div>
        <div id="house-3d" className="flex-1 overflow-hidden rounded-lg border border-line" data-testid="three-canvas">
          <HouseScene key={mode} plan={plan} colors={colors} mode={mode} showLevel={showLevel} onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>

      <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
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
          <p className="text-xs text-muted">
            {t("breakdown", { base: baht(est.base), up: signed(est.materialsDelta) })}
          </p>
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
      </aside>
    </div>
  );
}
