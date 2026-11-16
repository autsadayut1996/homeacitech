"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { generateOption } from "@/app/projects/[id]/ai-actions";
import type { Variant } from "@/lib/ai/prompt";

const VARIANTS: Variant[] = ["compact", "balanced", "spacious"];
type State = { status: "idle" | "running" | "done" | "failed"; startedAt?: number; endedAt?: number; error?: string };

export function AiDesignPanel({ projectId, hasOptions }: { projectId: string; hasOptions: boolean }) {
  const t = useTranslations("ai");
  const router = useRouter();
  const [states, setStates] = useState<Record<Variant, State>>({ compact: { status: "idle" }, balanced: { status: "idle" }, spacious: { status: "idle" } });
  const [, tick] = useState(0);
  const running = Object.values(states).some((s) => s.status === "running");

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    const now = Date.now();
    setStates({ compact: { status: "running", startedAt: now }, balanced: { status: "running", startedAt: now }, spacious: { status: "running", startedAt: now } });
    for (const v of VARIANTS) {
      generateOption(projectId, v)
        .then((res) => {
          setStates((s) => ({
            ...s,
            [v]: { ...s[v], status: res.ok ? "done" : "failed", endedAt: Date.now(), error: res.ok ? undefined : res.code === "missing_key" ? t("missingKey") : res.error },
          }));
          if (res.ok) router.refresh();
        })
        .catch((e) => setStates((s) => ({ ...s, [v]: { ...s[v], status: "failed", endedAt: Date.now(), error: String(e) } })));
    }
  };

  const secs = (s: State) => Math.round(((s.endedAt ?? Date.now()) - (s.startedAt ?? Date.now())) / 1000);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-4">
        <button className="btn-primary" disabled={running} onClick={start}>
          ✨ {running ? t("generating") : hasOptions ? t("regenerate") : t("generate")}
        </button>
        <p className="text-sm text-muted">{t("hint")}</p>
      </div>
      {Object.values(states).some((s) => s.status !== "idle") && (
        <ul className="grid gap-2 text-sm md:grid-cols-3">
          {VARIANTS.map((v) => {
            const s = states[v];
            return (
              <li key={v} className="rounded-md border border-line px-3 py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{t(`variant_${v}`)}</span>
                  <span className={s.status === "failed" ? "text-bad" : s.status === "done" ? "text-ok" : "text-muted"}>
                    {s.status === "running" && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
                    {s.status === "running" ? t("generating") : s.status === "done" ? t("done") : s.status === "failed" ? t("failed") : ""}{" "}
                    {s.startedAt && t("elapsed", { s: secs(s) })}
                  </span>
                </div>
                {s.error && <p className="mt-1 text-xs text-bad">{s.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
