"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { chooseOption, discardOption } from "@/app/projects/[id]/ai-actions";

export function OptionActions({ versionId }: { versionId: string }) {
  const t = useTranslations("ai");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await chooseOption(versionId);
            router.refresh();
          })
        }
      >
        {t("choose")}
      </button>
      <button
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await discardOption(versionId);
            router.refresh();
          })
        }
      >
        {t("discard")}
      </button>
    </div>
  );
}
