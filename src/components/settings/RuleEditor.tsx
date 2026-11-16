"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateRule } from "@/app/settings/rules/actions";

export interface RuleRow {
  id: string;
  code: string;
  type: string;
  titleTh: string;
  titleEn: string;
  params: unknown;
  sourceRef: string;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export function RuleEditor({ rule }: { rule: RuleRow }) {
  const t = useTranslations("rulesAdmin");
  const [titleTh, setTitleTh] = useState(rule.titleTh);
  const [titleEn, setTitleEn] = useState(rule.titleEn);
  const [paramsJson, setParams] = useState(JSON.stringify(rule.params, null, 2));
  const [sourceRef, setSource] = useState(rule.sourceRef);
  const [verified, setVerified] = useState(rule.verified);
  const [verifiedBy, setVerifiedBy] = useState(rule.verifiedBy ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await updateRule(rule.id, { titleTh, titleEn, paramsJson, sourceRef, verified, verifiedBy });
      setMsg(res.ok ? { ok: true, text: t("saved") } : { ok: false, text: res.error });
    });

  return (
    <details className="card p-4" data-testid={`rule-${rule.code}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${rule.verified ? "bg-green-50 text-ok" : "bg-amber-50 text-warn"}`}>
          {rule.verified ? t("verifiedBadge") : t("unverifiedBadge")}
        </span>
        <span className="font-medium">{rule.titleTh}</span>
        <span className="ml-auto font-mono text-xs text-muted">
          {rule.code} · {rule.type}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label>
          <span className="label">{t("titleTh")}</span>
          <input className="input" value={titleTh} onChange={(e) => setTitleTh(e.target.value)} />
        </label>
        <label>
          <span className="label">{t("titleEn")}</span>
          <input className="input" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        </label>
        <label>
          <span className="label">{t("params")}</span>
          <textarea className="input h-40 font-mono text-xs" value={paramsJson} onChange={(e) => setParams(e.target.value)} spellCheck={false} />
          <span className="mt-1 block text-xs text-muted">{t(`help_${rule.type}` as never)}</span>
        </label>
        <label>
          <span className="label">{t("source")}</span>
          <textarea className="input h-40 text-xs" value={sourceRef} onChange={(e) => setSource(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            {t("verifiedLabel")}
          </label>
          <input className="input w-72" placeholder={t("verifiedBy")} value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} />
          {rule.verifiedAt && rule.verified && <span className="text-xs text-muted">{t("verifiedAt", { by: rule.verifiedBy ?? "", at: new Date(rule.verifiedAt).toLocaleDateString() })}</span>}
          <button className="btn-primary ml-auto" disabled={pending} onClick={save}>
            {t("save")}
          </button>
        </div>
        {msg && <p className={`text-sm md:col-span-2 ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </div>
    </details>
  );
}
