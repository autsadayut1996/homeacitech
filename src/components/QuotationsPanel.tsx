"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createQuotation } from "@/app/projects/[id]/quote-actions";

export interface QuoteRow {
  id: string;
  number: string;
  createdAt: string;
  isDraft: boolean;
  locale: string;
  total: number;
  versionNumber: number | null;
}

export function QuotationsPanel({ projectId, quotes, hasVersion, priceFinal, locale }: { projectId: string; quotes: QuoteRow[]; hasVersion: boolean; priceFinal: boolean; locale: "th" | "en" }) {
  const t = useTranslations("quotes");
  const router = useRouter();
  const [lang, setLang] = useState<"th" | "en">(locale);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const baht = (n: number) => `฿${n.toLocaleString(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 })}`;
  return (
    <div className="card space-y-3" data-testid="quotations">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-semibold">{t("title")}</p>
        <select className="input w-auto py-1.5" value={lang} onChange={(e) => setLang(e.target.value as "th" | "en")}>
          <option value="th">ภาษาไทย</option>
          <option value="en">English</option>
        </select>
        <button
          className="btn-primary"
          disabled={pending || !hasVersion}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createQuotation(projectId, lang);
              if (r.ok) router.push(`/quotations/${r.quotationId}`);
              else setError(r.error[locale]);
            })
          }
        >
          📄 {t("issue")}
        </button>
      </div>
      <p className="text-xs text-muted">{priceFinal ? t("hintFinal") : t("hintDraft")}</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {quotes.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-line">
                <td className="py-1.5 font-mono text-xs">{q.number}</td>
                <td className="text-muted">v{q.versionNumber ?? "?"} · {q.locale.toUpperCase()}</td>
                <td>{q.isDraft ? <span className="rounded bg-amber-100 px-1.5 text-xs text-warn">DRAFT</span> : <span className="rounded bg-green-50 px-1.5 text-xs text-ok">{t("final")}</span>}</td>
                <td className="text-right tabular-nums">{baht(q.total)}</td>
                <td className="text-muted">{new Date(q.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-GB")}</td>
                <td className="text-right">
                  <Link href={`/quotations/${q.id}`} className="text-accent hover:underline">
                    {t("open")}
                  </Link>
                  {" · "}
                  <Link href={`/quotations/${q.id}/contract`} className="text-accent hover:underline">
                    {t("contract")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
