import type { QuoteSnapshot } from "@/lib/documents/snapshot";

export function DocHeader({ s, title, lines }: { s: QuoteSnapshot; title: string; lines: [string, string][] }) {
  const th = s.locale === "th";
  const c = s.company;
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-3">
      <div className="flex items-start gap-3">
        {c.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo} alt="" className="h-16 w-auto max-w-[140px] object-contain" />
        )}
        <div>
          <p className="text-base font-bold">{th ? c.nameTh : c.nameEn}</p>
          {th && c.nameEn && <p className="text-xs">{c.nameEn}</p>}
          {c.address && <p className="text-xs whitespace-pre-line">{c.address}</p>}
          <p className="text-xs">{[c.taxId && `${th ? "เลขประจำตัวผู้เสียภาษี" : "Tax ID"} ${c.taxId}`, c.phone, c.email, c.website].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold">{title}</p>
        <table className="mt-1 text-xs" style={{ width: "auto", marginLeft: "auto" }}>
          <tbody>
            {lines.map(([k, v]) => (
              <tr key={k}>
                <td style={{ border: 0, padding: "0 6px 0 0" }} className="text-neutral-500">
                  {k}
                </td>
                <td style={{ border: 0, padding: 0 }} className="font-medium">
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Watermark({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return (
    <div className="doc-watermark" aria-hidden>
      <span>{text}</span>
    </div>
  );
}

export function Signatures({ boxes }: { boxes: string[] }) {
  return (
    <div className="doc-section grid gap-6 pt-6" style={{ gridTemplateColumns: `repeat(${boxes.length}, 1fr)` }}>
      {boxes.map((b) => (
        <div key={b} className="text-center text-xs">
          <div className="mx-auto mb-1 h-12 w-4/5 border-b border-neutral-500" />
          <p>( ........................................ )</p>
          <p className="font-medium">{b}</p>
          <p className="text-neutral-500">....... / ....... / .......</p>
        </div>
      ))}
    </div>
  );
}
