"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { restoreVersion } from "@/app/projects/[id]/workflow-actions";

export function RestoreVersionButton({ projectId, versionId, number, locale }: { projectId: string; versionId: string; number: number; locale: "th" | "en" }) {
  const t = useTranslations("wf");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn-ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm(t("restoreConfirm", { n: number }))) return;
          start(async () => {
            const r = await restoreVersion(versionId);
            if (r.ok) router.push(`/projects/${projectId}?v=${r.versionId}`);
            else setError(r.error[locale]);
          });
        }}
      >
        ↺ {t("restore", { n: number })}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}
