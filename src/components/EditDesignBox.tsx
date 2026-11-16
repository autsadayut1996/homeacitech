"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { editDesign } from "@/app/projects/[id]/ai-actions";

export function EditDesignBox({ versionId, projectId }: { versionId: string; projectId: string }) {
  const t = useTranslations("ai");
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await editDesign(versionId, text);
      if (res.ok) {
        setText("");
        router.push(`/projects/${projectId}?v=${res.versionId}`);
        router.refresh();
      } else setError(res.code === "missing_key" ? t("missingKey") : res.error);
    });

  return (
    <div className="card space-y-2">
      <label className="label" htmlFor="ai-edit">
        {t("edit")}
      </label>
      <div className="flex gap-2">
        <input
          id="ai-edit"
          className="input"
          value={text}
          placeholder={t("editPlaceholder")}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && submit()}
        />
        <button className="btn-primary shrink-0" disabled={pending || !text.trim()} onClick={submit}>
          {pending ? t("editing") : t("editSubmit")}
        </button>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
