"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { STATUSES, type Status } from "@/lib/workflow";
import { decidePrice, proposeToCustomer, requestPriceApproval, signContract, startPermitPrep, type WfResult } from "@/app/projects/[id]/workflow-actions";

export interface ApprovalRow {
  id: string;
  type: "PRICE" | "ARCHITECTURE" | "ENGINEERING";
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  versionNumber: number | null;
  isCurrentVersion: boolean;
  approver: string | null;
  licenseNo: string | null;
  note: string | null;
  listPrice: number | null;
  discountAmount: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export function WorkflowPanel({
  projectId,
  status,
  approvals,
  version,
  discountLimitPct,
  locale,
}: {
  projectId: string;
  status: Status;
  approvals: ApprovalRow[];
  version: { id: string; number: number; price: number | null } | null;
  discountLimitPct: number;
  locale: "th" | "en";
}) {
  const t = useTranslations("wf");
  const ts = useTranslations("status");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [approver, setApprover] = useState("");

  const run = (fn: () => Promise<WfResult>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        setNote("");
        router.refresh();
      } else setError(r.error[locale]);
    });

  const idx = STATUSES.indexOf(status);
  const baht = (n: number) => `฿${n.toLocaleString(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 })}`;
  const pendingPrice = approvals.find((a) => a.type === "PRICE" && a.status === "PENDING");
  const design = approvals.filter((a) => a.type !== "PRICE" && a.isCurrentVersion);
  const discountNum = Number(discount || 0);
  const discountPct = version?.price ? (discountNum / version.price) * 100 : 0;

  return (
    <div className="card space-y-4" data-testid="workflow">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{t("title")}</p>
        {version && <p className="text-xs text-muted">{t("forVersion", { n: version.number })}</p>}
      </div>

      {/* stepper */}
      <ol className="flex flex-wrap gap-1 text-xs">
        {STATUSES.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-2.5 py-1 ${i < idx ? "bg-accent/15 text-accent" : i === idx ? "bg-accent font-medium text-white" : "bg-bg text-muted"}`}
          >
            {i + 1}. {ts(s)}
          </li>
        ))}
      </ol>

      {/* current step */}
      <div className="rounded-md border border-line p-3 text-sm">
        {status === "DRAFT" && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-muted">{version ? t("draftHint") : t("needVersion")}</p>
            <button className="btn-primary" disabled={pending || !version} onClick={() => run(() => proposeToCustomer(projectId))}>
              {t("propose")}
            </button>
          </div>
        )}

        {status === "PROPOSED" && version && (
          <div className="space-y-2">
            <p className="text-muted">{t("proposedHint", { limit: discountLimitPct })}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label>
                <span className="label">{t("listPrice")}</span>
                <span className="block py-2 font-semibold tabular-nums">{version.price ? baht(version.price) : "—"}</span>
              </label>
              <label>
                <span className="label">{t("discount")}</span>
                <input className="input w-40" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              </label>
              <span className="pb-2 text-xs text-muted">
                {discountPct.toFixed(2)}% · {t("net")} {version.price ? baht(version.price - discountNum) : "—"}
              </span>
              <input className="input min-w-48 flex-1" placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary" disabled={pending} onClick={() => run(() => requestPriceApproval(projectId, discountNum, note))}>
                {discountPct <= discountLimitPct ? t("confirmPrice") : t("requestPrice")}
              </button>
            </div>
          </div>
        )}

        {status === "PRICE_APPROVAL" && pendingPrice && (
          <div className="space-y-2">
            <p>
              {t("pricePending", {
                list: baht(pendingPrice.listPrice ?? 0),
                discount: baht(pendingPrice.discountAmount ?? 0),
                pct: (((pendingPrice.discountAmount ?? 0) / (pendingPrice.listPrice || 1)) * 100).toFixed(2),
                net: baht((pendingPrice.listPrice ?? 0) - (pendingPrice.discountAmount ?? 0)),
              })}
            </p>
            {pendingPrice.note && <p className="text-muted">“{pendingPrice.note}”</p>}
            <div className="flex flex-wrap gap-2">
              <input className="input w-56" placeholder={t("managerName")} value={approver} onChange={(e) => setApprover(e.target.value)} />
              <input className="input min-w-48 flex-1" placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary" disabled={pending} onClick={() => run(() => decidePrice(pendingPrice.id, { approver, approve: true, note }))}>
                {t("approve")}
              </button>
              <button className="btn-ghost" disabled={pending} onClick={() => run(() => decidePrice(pendingPrice.id, { approver, approve: false, note }))}>
                {t("reject")}
              </button>
            </div>
          </div>
        )}

        {status === "DESIGN_REVIEW" && (
          <div className="flex flex-wrap items-center gap-3">
            <ul className="flex-1 space-y-1">
              {design.map((a) => (
                <li key={a.id}>
                  {a.status === "APPROVED" ? "✅" : a.status === "PENDING" ? "⏳" : "↩️"} {t(`type_${a.type}`)}
                  {a.approver && <span className="text-muted"> — {a.approver}{a.licenseNo ? ` (${a.licenseNo})` : ""}</span>}
                </li>
              ))}
            </ul>
            <Link href={`/projects/${projectId}/review`} className="btn-primary">
              {t("goReview")}
            </Link>
          </div>
        )}

        {status === "APPROVED" && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-muted">{t("approvedHint")}</p>
            <button className="btn-primary" disabled={pending} onClick={() => run(() => signContract(projectId))}>
              {t("signContract")}
            </button>
          </div>
        )}

        {status === "CONTRACT_SIGNED" && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-muted">{t("signedHint")}</p>
            <button className="btn-primary" disabled={pending} onClick={() => run(() => startPermitPrep(projectId))}>
              {t("permitPrep")}
            </button>
          </div>
        )}

        {status === "PERMIT_PREP" && <p className="text-ok">{t("permitHint")}</p>}
        {error && <p className="mt-2 text-sm text-bad" data-testid="wf-error">{error}</p>}
      </div>

      {approvals.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">{t("history", { n: approvals.length })}</summary>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {[...approvals].reverse().map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-1 pr-2">{a.status === "APPROVED" ? "✅" : a.status === "PENDING" ? "⏳" : "↩️"}</td>
                  <td className="pr-2">{t(`type_${a.type}`)}</td>
                  <td className="pr-2 text-muted">v{a.versionNumber ?? "?"}</td>
                  <td className="pr-2">
                    {a.approver ?? "—"}
                    {a.licenseNo ? ` (${a.licenseNo})` : ""}
                  </td>
                  <td className="pr-2 text-muted">
                    {a.type === "PRICE" && a.listPrice !== null ? `${baht(a.listPrice)} − ${baht(a.discountAmount ?? 0)}` : ""} {a.note ?? ""}
                  </td>
                  <td className="whitespace-nowrap text-muted">{new Date(a.decidedAt ?? a.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
