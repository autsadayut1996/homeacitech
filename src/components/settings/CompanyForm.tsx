"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveCompany, type CompanyInput } from "@/app/settings/company/actions";
import { DEFAULT_SPEC, type SpecSection } from "@/lib/documents/spec";
import { SLOTS } from "@/lib/pricing/materials";

const PLACEHOLDERS = ["date", "company.name", "company.address", "company.taxId", "customer.name", "customer.phone", "project.code", "project.location", "version", "area", "price.total", "price.totalText", "quotation.number", "payment.schedule"];

/** Shrink an uploaded logo to ≤ 480 px wide PNG so it fits in the database. */
async function readLogo(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return url;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const scale = Math.min(1, 480 / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function CompanyForm({ initial, usesDefaults }: { initial: CompanyInput; usesDefaults: { terms: boolean; contract: boolean; payment: boolean; spec: boolean } }) {
  const t = useTranslations("companyAdmin");
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CompanyInput>(k: K, val: CompanyInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const sum = v.paymentTerms.reduce((s, x) => s + (Number(x.pct) || 0), 0);

  const tSlot = useTranslations("studio");
  const setSec = (i: number, sec: SpecSection) => set("specTemplate", v.specTemplate.map((x, j) => (j === i ? sec : x)));
  const text2 = (a: "quoteIntroTh" | "quoteClosingTh", b: "quoteIntroEn" | "quoteClosingEn") => (
    <>
      <textarea className="input h-24 text-sm" value={v[a]} onChange={(e) => set(a, e.target.value)} />
      <textarea className="input h-24 text-sm" value={v[b]} onChange={(e) => set(b, e.target.value)} />
    </>
  );

  const field = (k: "nameTh" | "nameEn" | "address" | "taxId" | "phone" | "email" | "website", multiline = false) => (
    <label className={multiline ? "md:col-span-2" : ""}>
      <span className="label">{t(k)}</span>
      {multiline ? (
        <textarea className="input h-16" value={v[k]} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className="input" value={v[k]} onChange={(e) => set(k, e.target.value)} />
      )}
    </label>
  );
  const num = (k: "vatPct" | "quoteValidityDays" | "salesDiscountLimitPct") => (
    <label>
      <span className="label">{t(k)}</span>
      <input className="input" type="number" step="0.5" value={v[k]} onChange={(e) => set(k, Number(e.target.value))} />
    </label>
  );

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 md:grid-cols-2">
        <h2 className="text-lg font-semibold md:col-span-2">{t("company")}</h2>
        {field("nameTh")}
        {field("nameEn")}
        {field("address", true)}
        {field("taxId")}
        {field("phone")}
        {field("email")}
        {field("website")}
        <div className="md:col-span-2">
          <span className="label">{t("logo")}</span>
          <div className="flex items-center gap-3">
            {v.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.logo} alt="logo" className="h-14 w-auto rounded border border-line bg-white p-1" />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set("logo", await readLogo(f));
              }}
            />
            {v.logo && (
              <button className="text-sm text-bad" onClick={() => set("logo", null)}>
                {t("removeLogo")}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card grid gap-3 md:grid-cols-3">
        <h2 className="text-lg font-semibold md:col-span-3">{t("pricing")}</h2>
        {num("vatPct")}
        {num("quoteValidityDays")}
        {num("salesDiscountLimitPct")}
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">
          {t("payment")} {usesDefaults.payment && <span className="text-xs font-normal text-warn">({t("sample")})</span>}
        </h2>
        {v.paymentTerms.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" placeholder={t("labelTh")} value={p.labelTh} onChange={(e) => set("paymentTerms", v.paymentTerms.map((x, j) => (j === i ? { ...x, labelTh: e.target.value } : x)))} />
            <input className="input" placeholder={t("labelEn")} value={p.labelEn} onChange={(e) => set("paymentTerms", v.paymentTerms.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)))} />
            <input className="input w-24" type="number" value={p.pct} onChange={(e) => set("paymentTerms", v.paymentTerms.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))} />
            <span className="self-center text-sm">%</span>
            <button className="text-sm text-bad" onClick={() => set("paymentTerms", v.paymentTerms.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3 text-sm">
          <button className="text-accent" onClick={() => set("paymentTerms", [...v.paymentTerms, { labelTh: "", labelEn: "", pct: 0 }])}>
            + {t("addInstalment")}
          </button>
          <span className={Math.abs(sum - 100) < 1e-6 ? "text-ok" : "text-bad"}>{t("sum", { n: sum })}</span>
        </div>
      </section>

      <section className="card grid gap-3 md:grid-cols-2" data-testid="quote-format">
        <h2 className="text-lg font-semibold md:col-span-2">{t("quoteFormat")}</h2>
        <label>
          <span className="label">{t("quoteFormCode")}</span>
          <input className="input" value={v.quoteFormCode} placeholder="FM-SA-01" onChange={(e) => set("quoteFormCode", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={v.priceIncludesVat} onChange={(e) => set("priceIncludesVat", e.target.checked)} />
          {t("priceIncludesVat")}
        </label>
        <p className="text-sm font-medium md:col-span-2">{t("intro2")}</p>
        {text2("quoteIntroTh", "quoteIntroEn")}
        <p className="text-sm font-medium md:col-span-2">{t("closing")}</p>
        {text2("quoteClosingTh", "quoteClosingEn")}
        <p className="text-sm font-medium md:col-span-2">
          {t("quoteTerms")} {usesDefaults.terms && <span className="text-xs font-normal text-warn">({t("sample")})</span>}
        </p>
        <p className="-mt-2 text-xs text-muted md:col-span-2">{t("notesHint")}</p>
        <textarea className="input h-40 text-sm" value={v.quoteTermsTh} onChange={(e) => set("quoteTermsTh", e.target.value)} />
        <textarea className="input h-40 text-sm" value={v.quoteTermsEn} onChange={(e) => set("quoteTermsEn", e.target.value)} />
      </section>

      <section className="card space-y-2" data-testid="spec-editor">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">
            {t("specTitle")} {usesDefaults.spec && <span className="text-xs font-normal text-warn">({t("sample")})</span>}
          </h2>
          <button className="text-sm text-accent" onClick={() => set("specTemplate", [...v.specTemplate, { titleTh: `${v.specTemplate.length + 1}. `, titleEn: "", items: [] }])}>
            + {t("addSection")}
          </button>
          <button className="text-sm text-muted" onClick={() => confirm(t("resetSpecConfirm")) && set("specTemplate", DEFAULT_SPEC)}>
            ↺ {t("resetSpec")}
          </button>
        </div>
        <p className="text-xs text-muted">{t("specHint")}</p>
        {v.specTemplate.map((sec, i) => (
          <details key={i} className="rounded border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {sec.titleTh || "—"} <span className="text-muted">{sec.titleEn && `/ ${sec.titleEn}`} · {sec.items.length}</span>
            </summary>
            <div className="space-y-2 border-t border-line p-3">
              <div className="flex gap-2">
                <input className="input" value={sec.titleTh} placeholder={t("labelTh")} onChange={(e) => setSec(i, { ...sec, titleTh: e.target.value })} />
                <input className="input" value={sec.titleEn} placeholder={t("labelEn")} onChange={(e) => setSec(i, { ...sec, titleEn: e.target.value })} />
                <button className="text-sm text-bad" title={t("removeSection")} onClick={() => set("specTemplate", v.specTemplate.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
              {sec.items.map((it, k) => {
                const up = (patch: Partial<typeof it>) => setSec(i, { ...sec, items: sec.items.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                return (
                  <div key={k} className="grid gap-1 rounded bg-neutral-50 p-2 md:grid-cols-[1fr_1fr_10rem_auto]">
                    <input className="input text-sm" value={it.th} placeholder={t("itemTh")} onChange={(e) => up({ th: e.target.value })} />
                    <input className="input text-sm" value={it.en} placeholder={t("itemEn")} onChange={(e) => up({ en: e.target.value })} />
                    <select className="input text-sm" value={it.slot ?? ""} onChange={(e) => up({ slot: (e.target.value || undefined) as typeof it.slot })}>
                      <option value="">{t("noSlot")}</option>
                      {SLOTS.map((sl) => (
                        <option key={sl} value={sl}>
                          ⇢ {tSlot(`slot_${sl}` as never)}
                        </option>
                      ))}
                    </select>
                    <button className="text-sm text-bad" onClick={() => setSec(i, { ...sec, items: sec.items.filter((_, j) => j !== k) })}>
                      ✕
                    </button>
                    <textarea className="input h-14 text-sm" value={it.specTh} placeholder={it.slot ? t("specExtraTh") : t("specTh")} onChange={(e) => up({ specTh: e.target.value })} />
                    <textarea className="input h-14 text-sm" value={it.specEn} placeholder={it.slot ? t("specExtraEn") : t("specEn")} onChange={(e) => up({ specEn: e.target.value })} />
                  </div>
                );
              })}
              <button className="text-sm text-accent" onClick={() => setSec(i, { ...sec, items: [...sec.items, { th: "", en: "", specTh: "", specEn: "" }] })}>
                + {t("addItem")}
              </button>
            </div>
          </details>
        ))}
      </section>

      <section className="card grid gap-3 md:grid-cols-2">
        <h2 className="text-lg font-semibold md:col-span-2">
          {t("contract")} {usesDefaults.contract && <span className="text-xs font-normal text-warn">({t("sample")})</span>}
        </h2>
        <p className="text-xs text-muted md:col-span-2">
          {t("placeholders")} {PLACEHOLDERS.map((p) => `{{${p}}}`).join("  ")}
        </p>
        <textarea className="input h-80 font-mono text-xs" value={v.contractTemplateTh} onChange={(e) => set("contractTemplateTh", e.target.value)} />
        <textarea className="input h-80 font-mono text-xs" value={v.contractTemplateEn} onChange={(e) => set("contractTemplateEn", e.target.value)} />
      </section>

      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCompany(v);
              setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error });
            })
          }
        >
          {t("save")}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-muted">{t("note")}</p>
    </div>
  );
}
