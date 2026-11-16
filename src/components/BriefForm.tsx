"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveBrief } from "@/app/actions";
import { BUILDING_TYPES, FACINGS, ROAD_SIDES, SPECIAL_ROOMS, STYLES, LandSchema, landAreaSqWa, type BriefInput } from "@/lib/brief";
import { formatRaiNganWa } from "@/lib/plan-core/site";

type Road = { side: string | number; widthM: string };

export interface BriefFormValues {
  title: string;
  customer: { name: string; phone: string; email: string; note: string };
  land: {
    shape: "rect" | "irregular";
    widthM: string;
    depthM: string;
    cornersText: string;
    areaSqWa: string;
    frontFacing: string;
    roads: Road[];
    province: string;
    district: string;
  };
  requirements: {
    buildingType: string;
    floors: string;
    bedrooms: string;
    bathrooms: string;
    parking: string;
    specialRooms: string[];
    targetAreaM2: string;
    style: string;
  };
  budgetMin: string;
  budgetMax: string;
  freeText: string;
}

export const EMPTY_BRIEF: BriefFormValues = {
  title: "",
  customer: { name: "", phone: "", email: "", note: "" },
  land: { shape: "rect", widthM: "", depthM: "", cornersText: "", areaSqWa: "", frontFacing: "N", roads: [{ side: "front", widthM: "6" }], province: "กรุงเทพมหานคร", district: "" },
  requirements: { buildingType: "two_storey", floors: "2", bedrooms: "3", bathrooms: "2", parking: "2", specialRooms: [], targetAreaM2: "", style: "modern" },
  budgetMin: "",
  budgetMax: "",
  freeText: "",
};

function parseCorners(text: string): [number, number][] {
  return text
    .split(/\n/)
    .map((l) => l.split(/[,\s]+/).filter(Boolean).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite)) as [number, number][];
}

function toInput(v: BriefFormValues): BriefInput {
  const land = v.land;
  return {
    customer: v.customer,
    land: {
      shape: land.shape,
      widthM: land.widthM as unknown as number,
      depthM: land.depthM as unknown as number,
      corners: land.shape === "irregular" ? parseCorners(land.cornersText) : undefined,
      areaSqWa: land.areaSqWa as unknown as number,
      frontFacing: land.frontFacing as BriefInput["land"]["frontFacing"],
      roads: land.roads.map((r) => ({ side: r.side as never, widthM: r.widthM as unknown as number })),
      province: land.province,
      district: land.district,
    },
    requirements: v.requirements as unknown as BriefInput["requirements"],
    budgetMin: v.budgetMin as unknown as number,
    budgetMax: v.budgetMax as unknown as number,
    freeText: v.freeText,
  };
}

export function BriefForm({ initial, projectId }: { initial: BriefFormValues; projectId?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const set = <K extends keyof BriefFormValues>(k: K, val: BriefFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setCustomer = (k: keyof BriefFormValues["customer"], val: string) => setV((s) => ({ ...s, customer: { ...s.customer, [k]: val } }));
  const setLand = <K extends keyof BriefFormValues["land"]>(k: K, val: BriefFormValues["land"][K]) => setV((s) => ({ ...s, land: { ...s.land, [k]: val } }));
  const setReq = <K extends keyof BriefFormValues["requirements"]>(k: K, val: BriefFormValues["requirements"][K]) =>
    setV((s) => ({ ...s, requirements: { ...s.requirements, [k]: val } }));

  const computed = useMemo(() => {
    const parsed = LandSchema.safeParse({ ...toInput(v).land, areaSqWa: undefined });
    if (!parsed.success) return null;
    const { fromShape } = landAreaSqWa(parsed.data);
    return fromShape > 0 ? fromShape : null;
  }, [v]);

  const err = (path: string) => (errors[path] ? t(`brief.err_${errors[path]}` as never) : null);
  const cls = (path: string) => `input ${errors[path] ? "input-error" : ""}`;

  const sides: (string | number)[] =
    v.land.shape === "rect" ? [...ROAD_SIDES] : parseCorners(v.land.cornersText).map((_, i) => i);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveBrief(toInput(v), projectId, v.title);
      if (res.ok) router.push(`/projects/${res.projectId}`);
      else setErrors(res.fieldErrors);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {Object.keys(errors).length > 0 && <div className="rounded-md bg-red-50 p-3 text-sm text-bad">{t("brief.errors")}</div>}

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("brief.customer")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("brief.customerName") + " *"} error={err("customer.name")}>
            <input className={cls("customer.name")} value={v.customer.name} onChange={(e) => setCustomer("name", e.target.value)} />
          </Field>
          <Field label={t("brief.projectTitle")} hint={t("brief.projectTitleHint")}>
            <input className="input" value={v.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label={t("brief.phone")}>
            <input className="input" value={v.customer.phone} onChange={(e) => setCustomer("phone", e.target.value)} />
          </Field>
          <Field label={t("brief.email")} error={err("customer.email")}>
            <input className={cls("customer.email")} type="email" value={v.customer.email} onChange={(e) => setCustomer("email", e.target.value)} />
          </Field>
          <Field label={t("brief.note")} className="col-span-2">
            <input className="input" value={v.customer.note} onChange={(e) => setCustomer("note", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("brief.land")}</h2>
        <div className="flex gap-4 text-sm">
          {(["rect", "irregular"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" checked={v.land.shape === s} onChange={() => setV((st) => ({ ...st, land: { ...st.land, shape: s, roads: [{ side: s === "rect" ? "front" : 0, widthM: st.land.roads[0]?.widthM ?? "6" }] } }))} />
              {t(`brief.shape_${s}`)}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {v.land.shape === "rect" ? (
            <>
              <Field label={t("brief.width") + " *"} error={err("land.widthM")}>
                <input className={cls("land.widthM")} inputMode="decimal" value={v.land.widthM} onChange={(e) => setLand("widthM", e.target.value)} />
              </Field>
              <Field label={t("brief.depth") + " *"}>
                <input className={cls("land.widthM")} inputMode="decimal" value={v.land.depthM} onChange={(e) => setLand("depthM", e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label={t("brief.corners")} error={err("land.corners")} className="col-span-2 row-span-2">
              <textarea className={cls("land.corners") + " h-28 font-mono"} value={v.land.cornersText} onChange={(e) => setLand("cornersText", e.target.value)} placeholder={"0,0\n12,0\n14,25\n0,25"} />
            </Field>
          )}
          <Field label={t("brief.areaSqWa")} hint={computed ? t("brief.computedArea", { sqwa: computed.toFixed(1), rng: formatRaiNganWa(computed) }) : t("brief.areaSqWaHint")}>
            <input className="input" inputMode="decimal" value={v.land.areaSqWa} onChange={(e) => setLand("areaSqWa", e.target.value)} />
          </Field>
          <Field label={t("brief.frontFacing")}>
            <select className="input" value={v.land.frontFacing} onChange={(e) => setLand("frontFacing", e.target.value)}>
              {FACINGS.map((f) => (
                <option key={f} value={f}>
                  {t(`facing.${f}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("brief.province") + " *"} error={err("land.province")}>
            <input className={cls("land.province")} value={v.land.province} onChange={(e) => setLand("province", e.target.value)} />
          </Field>
          <Field label={t("brief.district")}>
            <input className="input" value={v.land.district} onChange={(e) => setLand("district", e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="label">{t("brief.roads")}</span>
          <div className="space-y-2">
            {v.land.roads.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="input w-48"
                  value={String(r.side)}
                  onChange={(e) => {
                    const roads = [...v.land.roads];
                    roads[i] = { ...r, side: v.land.shape === "rect" ? e.target.value : Number(e.target.value) };
                    setLand("roads", roads);
                  }}
                >
                  {sides.map((s) => (
                    <option key={s} value={String(s)}>
                      {typeof s === "number" ? t("brief.edge", { n: s + 1 }) : t(`brief.side_${s}`)}
                    </option>
                  ))}
                </select>
                <input
                  className={cls(`land.roads.${i}.widthM`) + " w-32"}
                  inputMode="decimal"
                  placeholder={t("brief.roadWidth")}
                  value={r.widthM}
                  onChange={(e) => {
                    const roads = [...v.land.roads];
                    roads[i] = { ...r, widthM: e.target.value };
                    setLand("roads", roads);
                  }}
                />
                <span className="text-sm text-muted">{t("units.m")}</span>
                {v.land.roads.length > 1 && (
                  <button type="button" className="text-sm text-bad" onClick={() => setLand("roads", v.land.roads.filter((_, j) => j !== i))}>
                    {t("brief.remove")}
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="text-sm text-accent" onClick={() => setLand("roads", [...v.land.roads, { side: sides[0] ?? "front", widthM: "" }])}>
              {t("brief.addRoad")}
            </button>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("brief.requirements")}</h2>
        <div className="grid grid-cols-4 gap-4">
          <Field label={t("brief.buildingType")}>
            <select className="input" value={v.requirements.buildingType} onChange={(e) => setReq("buildingType", e.target.value)}>
              {BUILDING_TYPES.map((b) => (
                <option key={b} value={b}>
                  {t(`buildingType.${b}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("brief.style")}>
            <select className="input" value={v.requirements.style} onChange={(e) => setReq("style", e.target.value)}>
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {t(`style.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("brief.targetArea")}>
            <input className="input" inputMode="decimal" value={v.requirements.targetAreaM2} onChange={(e) => setReq("targetAreaM2", e.target.value)} />
          </Field>
          <div />
          {(["floors", "bedrooms", "bathrooms", "parking"] as const).map((k) => (
            <Field key={k} label={t(`brief.${k}`)} error={err(`requirements.${k}`)}>
              <input className={cls(`requirements.${k}`)} type="number" min={k === "floors" ? 1 : 0} value={v.requirements[k]} onChange={(e) => setReq(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <div>
          <span className="label">{t("brief.specialRooms")}</span>
          <div className="flex flex-wrap gap-2">
            {SPECIAL_ROOMS.map((r) => {
              const on = v.requirements.specialRooms.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReq("specialRooms", on ? v.requirements.specialRooms.filter((x) => x !== r) : [...v.requirements.specialRooms, r])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent text-white" : "border-line bg-paper hover:bg-bg"}`}
                >
                  {t(`special.${r}`)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Field label={`${t("brief.budget")} — ${t("brief.budgetMin")}`}>
            <input className="input" inputMode="numeric" value={v.budgetMin} onChange={(e) => set("budgetMin", e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field label={`${t("brief.budget")} — ${t("brief.budgetMax")}`} error={err("budgetMax")}>
            <input className={cls("budgetMax")} inputMode="numeric" value={v.budgetMax} onChange={(e) => set("budgetMax", e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
        </div>
        <Field label={t("brief.freeText")} hint={t("brief.freeTextHint")}>
          <textarea className="input h-28" value={v.freeText} onChange={(e) => set("freeText", e.target.value)} />
        </Field>
      </section>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? t("brief.saving") : t("brief.save")}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>
          {t("brief.cancel")}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
