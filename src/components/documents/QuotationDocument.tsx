import { getTranslations } from "next-intl/server";
import type { QuoteSnapshot } from "@/lib/documents/snapshot";
import { bahtText, bahtTextEn } from "@/lib/documents/bahttext";
import { SitePlanSvg } from "@/components/SitePlanSvg";
import { ElevationSvg } from "@/components/ElevationSvg";
import { elevations } from "@/lib/plan-core";
import { DocHeader, Signatures, Watermark } from "./DocHeader";

export async function QuotationDocument({ s }: { s: QuoteSnapshot }) {
  const locale = s.locale;
  const t = await getTranslations({ locale });
  const th = locale === "th";
  const money = (n: number) => n.toLocaleString(th ? "th-TH" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (iso: string) => new Date(iso).toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const unit = (u: string) => t(`studio.unit_${u}` as never);

  return (
    <article className="doc-paper" data-testid="quotation">
      <Watermark show={s.isDraft} text={t("doc.draft")} />
      <DocHeader
        s={s}
        title={t("doc.quotation")}
        lines={[
          [t("doc.number"), s.number],
          [t("doc.date"), date(s.issuedAt)],
          [t("doc.validUntil"), date(s.validUntil)],
          ...(s.isDraft ? ([[t("doc.status"), t("doc.draft")]] as [string, string][]) : []),
        ]}
      />

      <div className="doc-section grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold">{t("doc.customer")}</p>
          <p>{s.customer.name}</p>
          <p className="text-xs">{[s.customer.phone, s.customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="font-semibold">{t("doc.project")}</p>
          <p>
            {s.project.code} — {s.project.title}
          </p>
          <p className="text-xs">
            {s.project.location} · {t("doc.land", { sqwa: s.areas.landSqWa.toFixed(1) })}
            {s.project.buildingType && ` · ${t(`buildingType.${s.project.buildingType}` as never)}`}
            {s.project.style && ` · ${t(`style.${s.project.style}` as never)}`}
          </p>
          <p className="text-xs">
            {t("doc.designVersion", { n: s.version.number ?? "-" })}
            {s.version.label ? ` — ${s.version.label}` : ""}
          </p>
        </div>
      </div>

      <div className="doc-section">
        <div className={`grid gap-2 ${s.plan.levels.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {s.plan.levels.map((l, i) => (
            <figure key={l.id} className="rounded border border-neutral-300 p-1">
              <figcaption className="text-xs font-medium">{l.name[locale]}</figcaption>
              <SitePlanSvg site={s.plan.site} plan={s.plan} levelIndex={i} locale={locale} className="w-full" />
            </figure>
          ))}
        </div>
        <p className="mt-1 text-xs">
          {t("doc.areas", { total: s.areas.total.toFixed(0), indoor: s.areas.indoor.toFixed(0), bed: s.areas.bedrooms, bath: s.areas.bathrooms, park: s.areas.parking })}
        </p>
      </div>

      <div className="doc-section" data-testid="doc-elevations">
        <p className="mb-1 font-semibold">{t("elev.title")}</p>
        <div className="grid grid-cols-2 gap-2">
          {elevations(s.plan).map((e) => (
            <figure key={e.side} className="rounded border border-neutral-300 p-1">
              <ElevationSvg e={e} title={t("elev.name", { side: t(`elev.${e.side}` as never), dir: t(`facing.${e.facing}` as never) })} className="w-full" />
            </figure>
          ))}
        </div>
      </div>

      <div className="doc-section">
        <p className="mb-1 font-semibold">
          {t("doc.spec")} — {t(`studio.pkg_${s.packageName}` as never)}
        </p>
        <table>
          <thead>
            <tr>
              <th style={{ width: "28%" }}>{t("doc.item")}</th>
              <th>{t("doc.material")}</th>
              <th style={{ width: "18%", textAlign: "right" }}>{t("doc.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {s.spec.map((x) => (
              <tr key={x.slot}>
                <td>{t(`studio.slot_${x.slot}` as never)}</td>
                <td>{th ? x.nameTh : x.nameEn}</td>
                <td style={{ textAlign: "right" }}>
                  {x.quantity.toLocaleString(th ? "th-TH" : "en-US", { maximumFractionDigits: 1 })} {unit(x.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-section">
        <p className="mb-1 font-semibold">{t("doc.price")}</p>
        <table data-testid="price-table">
          <thead>
            <tr>
              <th style={{ width: "6%" }}>#</th>
              <th>{t("doc.item")}</th>
              <th style={{ width: "24%", textAlign: "right" }}>{t("doc.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{th ? l.labelTh : l.labelEn}</td>
                <td style={{ textAlign: "right" }}>{money(l.amount)}</td>
              </tr>
            ))}
            {[
              [t("doc.subtotal"), s.money.subtotal],
              ...(s.money.discount > 0 ? ([[t("doc.discount"), -s.money.discount], [t("doc.afterDiscount"), s.money.afterDiscount]] as [string, number][]) : []),
              [t("doc.vat", { pct: s.money.vatPct }), s.money.vat],
            ].map(([k, v]) => (
              <tr key={k as string}>
                <td colSpan={2} style={{ textAlign: "right" }}>
                  {k}
                </td>
                <td style={{ textAlign: "right" }}>{money(v as number)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ textAlign: "right" }} className="font-bold">
                {t("doc.total")}
              </td>
              <td style={{ textAlign: "right" }} className="font-bold" data-testid="grand-total">
                {money(s.money.total)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-right text-xs font-medium">({th ? bahtText(s.money.total) : bahtTextEn(s.money.total)})</p>
      </div>

      <div className="doc-section">
        <p className="mb-1 font-semibold">{t("doc.payment")}</p>
        <table>
          <tbody>
            {s.installments.map((p, i) => (
              <tr key={i}>
                <td>{th ? p.labelTh : p.labelEn}</td>
                <td style={{ width: "10%", textAlign: "right" }}>{p.pct}%</td>
                <td style={{ width: "24%", textAlign: "right" }}>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-section">
        <p className="mb-1 font-semibold">{t("doc.terms")}</p>
        <p className="whitespace-pre-line text-xs">{s.terms}</p>
        <p className="mt-2 text-xs text-neutral-500">{s.priceReference}</p>
        <p className="mt-1 text-xs font-medium text-red-700">⚠ {t("doc.salesDraft")}</p>
      </div>

      <Signatures boxes={[t("doc.signCustomer"), t("doc.signSales"), t("doc.signApprover")]} />
    </article>
  );
}
