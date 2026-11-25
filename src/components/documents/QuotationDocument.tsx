/**
 * Quotation in the standard Thai home-builder format, bilingual (Thai/English) throughout:
 *   1. cover letter (price summary, signatures)
 *   2. notes, price breakdown, payment schedule
 *   3. floor plans + area table, elevations
 *   4. building specification by category
 * The issuing language comes first on every line, the other one underneath.
 */
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { QuoteSnapshot } from "@/lib/documents/snapshot";
import { bahtText, bahtTextEn } from "@/lib/documents/bahttext";
import { SitePlanSvg } from "@/components/SitePlanSvg";
import { ElevationSvg } from "@/components/ElevationSvg";
import { elevations } from "@/lib/plan-core";
import { Watermark } from "./DocHeader";
import { QuotationLegacy } from "./QuotationLegacy";

type L = { th: string; en: string };
const L = (th: string, en: string): L => ({ th, en });

const TXT = {
  title: L("ใบเสนอราคา", "QUOTATION"),
  date: L("วันที่", "Date"),
  number: L("เลขที่", "QT No."),
  client: L("เรียน", "Client"),
  subject: L("เรื่อง", "Subject"),
  subjectText: L("เสนอราคาค่าก่อสร้างบ้านพักอาศัย", "Quotation for house construction"),
  enclosures: L("สิ่งที่ส่งมาด้วย", "Enclosures"),
  enc: [L("หมายเหตุและงวดการชำระเงิน", "Notes and payment schedule"), L("แบบแปลนและรูปด้าน", "Floor plans and elevations"), L("รายการวัสดุประกอบอาคาร", "Building specification")],
  model: L("แบบบ้าน", "Model"),
  usable: L("พื้นที่ใช้สอย", "Usable area"),
  location: L("สถานที่ก่อสร้าง", "Location"),
  land: L("ขนาดที่ดิน", "Land area"),
  price: L("ราคา", "Price"),
  discount: L("ส่วนลด", "Discount"),
  net: L("ราคาสุทธิ", "Total"),
  vatIncl: L("ราคารวมภาษีมูลค่าเพิ่ม {pct}% แล้ว (ภาษี {vat} บาท)", "Including VAT {pct}% (VAT {vat} THB)"),
  vat: L("ภาษีมูลค่าเพิ่ม {pct}%", "VAT {pct}%"),
  valid: L("ยืนราคาถึง", "Valid until"),
  sincerely: L("ขอแสดงความนับถือ", "Yours sincerely"),
  quotedBy: L("ผู้เสนอราคา", "Quoted by"),
  approvedBy: L("ผู้อนุมัติ", "Approved by"),
  accepted: L("ผู้ว่าจ้างยืนยันการสั่งจ้าง", "Accepted by the client"),
  notes: L("หมายเหตุ", "NOTE"),
  breakdown: L("รายละเอียดราคา", "Price breakdown"),
  item: L("รายการ", "Description"),
  amount: L("จำนวนเงิน (บาท)", "Amount (THB)"),
  payment: L("งวดการชำระเงิน", "Payment schedule"),
  plans: L("แบบแปลนพื้น", "Floor plans"),
  areaTable: L("ตารางพื้นที่", "Area schedule"),
  floor: L("ชั้น", "Floor"),
  indoor: L("พื้นที่ภายใน", "Indoor"),
  outdoor: L("ระเบียง / ที่จอดรถ / ชานภายนอก", "Balconies / carport / terraces"),
  total: L("รวม", "Total"),
  sumAll: L("พื้นที่ใช้สอยรวม", "Total usable area"),
  elevations: L("รูปด้าน", "Elevations"),
  specTitle: L("รายการวัสดุประกอบอาคาร", "Building specification"),
  specItem: L("รายการ", "Item"),
  specDetail: L("รายละเอียดวัสดุก่อสร้าง", "Material specification"),
  draft: L("ร่าง / DRAFT", "DRAFT"),
  sqm: L("ตร.ม.", "m²"),
  sqwa: L("ตร.วา", "sq.wa"),
  baht: L("บาท", "THB"),
  page: L("หน้า", "Page"),
  salesDraft: L(
    "แบบในใบเสนอราคานี้เป็นแบบร่างเพื่อการขาย ไม่ใช่แบบก่อสร้าง ต้องผ่านการตรวจและลงนามโดยสถาปนิก/วิศวกรผู้มีใบอนุญาตก่อนก่อสร้าง",
    "The drawings in this quotation are sales drafts, not construction drawings; they must be checked and signed by licensed architects/engineers before construction.",
  ),
} as const;

export async function QuotationDocument({ s }: { s: QuoteSnapshot }) {
  if (!s.letter) return <QuotationLegacy s={s} />;
  const t = await getTranslations({ locale: s.locale });
  const th = s.locale === "th";
  const p = (x: L) => (th ? x.th : x.en);
  const o = (x: L) => (th ? x.en : x.th);
  const nf = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const date = (iso: string) => new Date(iso).toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const c = s.company;
  const lt = s.letter;
  const fill = (x: L, vars: Record<string, string>) => ({ th: x.th.replace(/\{(\w+)\}/g, (_, k) => vars[k]), en: x.en.replace(/\{(\w+)\}/g, (_, k) => vars[k]) });
  const totalText = L(bahtText(s.money.total), bahtTextEn(s.money.total));
  const pages = ["letter", "notes", "plans", "spec"] as const;

  /** Bilingual label: issuing language, other language in small type beneath. */
  const Bi = ({ x, inline = false, className = "" }: { x: L; inline?: boolean; className?: string }) =>
    inline ? (
      <span className={className}>
        {p(x)} {o(x) !== p(x) && <span className="text-neutral-500">{o(x)}</span>}
      </span>
    ) : (
      <span className={`block ${className}`}>
        {p(x)}
        {o(x) !== p(x) && <span className="block text-[0.85em] font-normal text-neutral-500">{o(x)}</span>}
      </span>
    );

  const Page = ({ k, children }: { k: (typeof pages)[number]; children: ReactNode }) => (
    <article className="doc-paper doc-page" data-testid={`quote-${k}`}>
      <Watermark show={s.isDraft} text={p(TXT.draft)} />
      <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-2">
        <div className="flex items-start gap-3">
          {c.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logo} alt="" className="h-14 w-auto max-w-[130px] object-contain" />
          )}
          <div>
            <p className="text-[15px] font-bold leading-tight">{c.nameTh}</p>
            {c.nameEn && c.nameEn !== c.nameTh && <p className="text-xs font-semibold">{c.nameEn}</p>}
            {c.address && <p className="text-[11px] whitespace-pre-line">{c.address}</p>}
            <p className="text-[11px]">{[c.taxId && `${th ? "เลขประจำตัวผู้เสียภาษี" : "Tax ID"} ${c.taxId}`, c.phone && `${th ? "โทร." : "Tel."} ${c.phone}`, c.email, c.website].filter(Boolean).join("  ·  ")}</p>
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px]">
          {lt.formCode && <p className="font-mono">{lt.formCode}</p>}
          <p className="font-mono">{s.number}</p>
        </div>
      </header>
      {children}
      <footer className="doc-footer">
        <span>
          {s.number} · {s.project.code}
        </span>
        <span>
          {p(TXT.page)} {pages.indexOf(k) + 1}/{pages.length}
        </span>
      </footer>
    </article>
  );

  const row = (label: L, value: ReactNode) => (
    <tr>
      <td className="w-[34%] !border-0 !py-0.5 !pl-0">
        <Bi x={label} inline className="font-medium" />
      </td>
      <td className="!border-0 !py-0.5">{value}</td>
    </tr>
  );
  const sigBox = (role: L, name: string | null) => (
    <div className="text-center text-xs">
      <div className="mx-auto mb-1 h-12 w-4/5 border-b border-neutral-500" />
      <p>( {name || "........................................"} )</p>
      <Bi x={role} className="font-medium" />
      <p className="text-neutral-500">....... / ....... / .......</p>
    </div>
  );

  return (
    <div className="doc-stack" data-testid="quotation">
      {/* 1 — cover letter */}
      <Page k="letter">
        <h1 className="mt-4 text-center text-xl font-bold tracking-wide">
          {p(TXT.title)} <span className="text-base font-semibold text-neutral-500">/ {o(TXT.title)}</span>
        </h1>
        <table className="doc-plain mt-3">
          <tbody>
            {row(TXT.date, date(s.issuedAt))}
            {row(TXT.number, <span className="font-mono">{s.number}</span>)}
            {row(TXT.client, <span className="font-semibold">{s.customer.name}</span>)}
            {row(TXT.subject, <Bi x={TXT.subjectText} inline />)}
            {row(
              TXT.enclosures,
              <ol className="list-decimal pl-5">
                {TXT.enc.map((e) => (
                  <li key={e.en}>
                    <Bi x={e} inline />
                  </li>
                ))}
              </ol>,
            )}
          </tbody>
        </table>

        <div className="doc-section space-y-1.5 text-justify">
          <p className="indent-8">{th ? lt.introTh : lt.introEn}</p>
          <p className="indent-8 text-[11.5px] text-neutral-600">{th ? lt.introEn : lt.introTh}</p>
        </div>

        <div className="doc-section mx-auto w-[88%] rounded border border-neutral-400 px-4 py-2">
          <table className="doc-plain">
            <tbody>
              {row(TXT.model, `${s.project.code} — ${s.project.title}${s.version.number ? ` (v${s.version.number})` : ""}`)}
              {row(TXT.usable, `${nf(s.areas.total)} ${p(TXT.sqm)}`)}
              {row(TXT.location, s.project.location)}
              {row(TXT.land, `${nf(s.areas.landSqWa, 1)} ${p(TXT.sqwa)}`)}
            </tbody>
          </table>
          <table className="doc-plain mt-2 border-t border-neutral-300 pt-1" data-testid="price-table">
            <tbody>
              {row(TXT.price, <span className="tabular-nums">{nf(s.money.subtotal)} {p(TXT.baht)}</span>)}
              {row(TXT.discount, <span className="tabular-nums">{s.money.discount > 0 ? nf(s.money.discount) : "-"} {p(TXT.baht)}</span>)}
              {!s.money.vatIncluded && row(fill(TXT.vat, { pct: String(s.money.vatPct) }), <span className="tabular-nums">{nf(s.money.vat)} {p(TXT.baht)}</span>)}
              {row(
                TXT.net,
                <span className="text-[15px] font-bold tabular-nums" data-testid="grand-total">
                  {nf(s.money.total)} {p(TXT.baht)}
                </span>,
              )}
            </tbody>
          </table>
          <p className="mt-1 text-center font-medium">( {p(totalText)} )</p>
          {s.money.vatIncluded && <p className="text-center text-[11px] text-neutral-600">{p(fill(TXT.vatIncl, { pct: String(s.money.vatPct), vat: nf(s.money.vat) }))}</p>}
          <p className="text-center text-[11px] text-neutral-600">
            {p(TXT.valid)} {date(s.validUntil)}
          </p>
        </div>

        <div className="doc-section space-y-1.5 text-justify">
          <p className="indent-8">{th ? lt.closingTh : lt.closingEn}</p>
          <p className="indent-8 text-[11.5px] text-neutral-600">{th ? lt.closingEn : lt.closingTh}</p>
        </div>

        <p className="doc-section text-center">
          <Bi x={TXT.sincerely} />
        </p>
        <div className="doc-section grid grid-cols-2 gap-8 pt-2">
          {sigBox(TXT.quotedBy, lt.salesperson)}
          {sigBox(TXT.approvedBy, null)}
        </div>
      </Page>

      {/* 2 — notes, breakdown, payment */}
      <Page k="notes">
        <h2 className="doc-h2">
          <Bi x={TXT.notes} inline />
        </h2>
        <ol className="list-decimal space-y-1 pl-6">
          {(th ? lt.notesTh : lt.notesEn).map((n, i) => {
            const other = (th ? lt.notesEn : lt.notesTh)[i];
            return (
              <li key={i}>
                {n}
                {other && other !== n && <span className="block text-[11.5px] text-neutral-500">{other}</span>}
              </li>
            );
          })}
        </ol>

        <div className="doc-section">
          <h2 className="doc-h2">
            <Bi x={TXT.breakdown} inline />
          </h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th>
                  <Bi x={TXT.item} />
                </th>
                <th style={{ width: "24%", textAlign: "right" }}>
                  <Bi x={TXT.amount} />
                </th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <Bi x={L(l.labelTh, l.labelEn)} />
                  </td>
                  <td className="text-right tabular-nums">{nf(l.amount)}</td>
                </tr>
              ))}
              {[
                [TXT.price, s.money.subtotal],
                ...(s.money.discount > 0 ? ([[TXT.discount, -s.money.discount]] as [L, number][]) : []),
                [fill(s.money.vatIncluded ? TXT.vatIncl : TXT.vat, { pct: String(s.money.vatPct), vat: nf(s.money.vat) }), s.money.vatIncluded ? null : s.money.vat],
                [TXT.net, s.money.total],
              ].map(([k, v], i) => (
                <tr key={i} className={k === TXT.net ? "font-bold" : ""}>
                  <td colSpan={2} className="text-right">
                    <Bi x={k as L} inline />
                  </td>
                  <td className="text-right tabular-nums">{v === null ? "" : nf(v as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-neutral-500">{s.priceReference}</p>
        </div>

        <div className="doc-section">
          <h2 className="doc-h2">
            <Bi x={TXT.payment} inline />
          </h2>
          <table>
            <tbody>
              {s.installments.map((x, i) => (
                <tr key={i}>
                  <td>
                    <Bi x={L(x.labelTh, x.labelEn)} />
                  </td>
                  <td className="w-[10%] text-right">{x.pct}%</td>
                  <td className="w-[24%] text-right tabular-nums">{nf(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="doc-section text-xs font-medium text-red-700">⚠ {p(TXT.salesDraft)}</p>
        <div className="doc-section ml-auto w-1/2 pt-4">{sigBox(TXT.accepted, s.customer.name)}</div>
      </Page>

      {/* 3 — plans, areas, elevations */}
      <Page k="plans">
        <h2 className="doc-h2">
          <Bi x={TXT.plans} inline />
        </h2>
        <div className={`grid gap-2 ${s.plan.levels.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {s.plan.levels.map((l, i) => (
            <figure key={l.id} className="border border-neutral-300 p-1">
              <SitePlanSvg site={s.plan.site} plan={s.plan} levelIndex={i} locale={s.locale} className="w-full" />
              <figcaption className="text-center text-xs font-semibold">
                {p(L(l.name.th, l.name.en))} <span className="font-normal text-neutral-500">{o(L(l.name.th, l.name.en))}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        {s.levelAreas && (
          <div className="doc-section" data-testid="area-table">
            <h2 className="doc-h2">
              <Bi x={TXT.areaTable} inline />
            </h2>
            <table>
              <thead>
                <tr>
                  <th>
                    <Bi x={TXT.floor} />
                  </th>
                  <th className="text-right">
                    <Bi x={TXT.indoor} /> ({p(TXT.sqm)})
                  </th>
                  <th className="text-right">
                    <Bi x={TXT.outdoor} /> ({p(TXT.sqm)})
                  </th>
                  <th className="text-right">
                    <Bi x={TXT.total} /> ({p(TXT.sqm)})
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.levelAreas.map((a, i) => (
                  <tr key={i}>
                    <td>{p(L(a.nameTh, a.nameEn))}</td>
                    <td className="text-right tabular-nums">{nf(a.indoor)}</td>
                    <td className="text-right tabular-nums">{nf(a.outdoor)}</td>
                    <td className="text-right tabular-nums">{nf(a.total)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td>
                    <Bi x={TXT.sumAll} inline />
                  </td>
                  <td className="text-right tabular-nums">{nf(s.levelAreas.reduce((x, a) => x + a.indoor, 0))}</td>
                  <td className="text-right tabular-nums">{nf(s.levelAreas.reduce((x, a) => x + a.outdoor, 0))}</td>
                  <td className="text-right tabular-nums">{nf(s.areas.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="doc-section" data-testid="doc-elevations">
          <h2 className="doc-h2">
            <Bi x={TXT.elevations} inline />
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {elevations(s.plan).map((e) => (
              <figure key={e.side} className="border border-neutral-300 p-1">
                <ElevationSvg e={e} title={t("elev.name", { side: t(`elev.${e.side}` as never), dir: t(`facing.${e.facing}` as never) })} className="w-full" />
              </figure>
            ))}
          </div>
        </div>
      </Page>

      {/* 4 — specification */}
      <Page k="spec">
        <h2 className="doc-h2 text-center">
          <Bi x={TXT.specTitle} inline />
        </h2>
        <table className="doc-spec" data-testid="spec-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>
                <Bi x={TXT.specItem} />
              </th>
              <th>
                <Bi x={TXT.specDetail} />
              </th>
            </tr>
          </thead>
          <tbody>
            {(s.specSections ?? []).map((sec, i) => [
              <tr key={`h${i}`} className="doc-spec-head">
                <td colSpan={2}>
                  <Bi x={L(sec.titleTh, sec.titleEn || sec.titleTh)} inline className="font-bold" />
                </td>
              </tr>,
              ...sec.items.map((it, k) => (
                <tr key={`${i}-${k}`}>
                  <td>
                    <Bi x={L(it.th, it.en || it.th)} />
                  </td>
                  <td>
                    {(th ? it.specTh : it.specEn) || "-"}
                    {(th ? it.specEn : it.specTh) && <span className="block text-[0.85em] text-neutral-500">{th ? it.specEn : it.specTh}</span>}
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </Page>
    </div>
  );
}
