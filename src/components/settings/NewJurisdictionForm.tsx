"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createJurisdiction } from "@/app/settings/rules/actions";

export function NewJurisdictionForm({ sources }: { sources: { code: string; name: string }[] }) {
  const t = useTranslations("rulesAdmin");
  const [v, setV] = useState({ code: "", nameTh: "", nameEn: "", copyFrom: sources[0]?.code ?? "TH-DEFAULT" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3">
      <p className="font-semibold">{t("newArea")}</p>
      <p className="text-xs text-muted">{t("newAreaHint")}</p>
      <div className="grid gap-3 md:grid-cols-4">
        <input className="input" placeholder="TH-CNX" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
        <input className="input" placeholder={t("nameTh")} value={v.nameTh} onChange={(e) => setV({ ...v, nameTh: e.target.value })} />
        <input className="input" placeholder={t("nameEn")} value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} />
        <select className="input" value={v.copyFrom} onChange={(e) => setV({ ...v, copyFrom: e.target.value })}>
          {sources.map((s) => (
            <option key={s.code} value={s.code}>
              {t("copyFrom", { name: s.name })}
            </option>
          ))}
        </select>
      </div>
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await createJurisdiction(v);
            setMsg(res.ok ? { ok: true, text: t("created") } : { ok: false, text: res.error });
            if (res.ok) setV({ code: "", nameTh: "", nameEn: "", copyFrom: v.copyFrom });
          })
        }
      >
        {t("create")}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
