import type { RuleResult } from "@/lib/compliance/rules";

const ICON = { pass: "✅", warn: "⚠️", fail: "❌" } as const;

/** Server- or client-renderable list of regulation results. Labels are passed in (works in both). */
export function CompliancePanel({
  results,
  locale,
  labels,
  jurisdiction,
  compact = false,
}: {
  results: RuleResult[];
  locale: "th" | "en";
  labels: { title: string; disclaimer: string; unverified: string; source: string; summary: string };
  jurisdiction?: string | null;
  compact?: boolean;
}) {
  const order = { fail: 0, warn: 1, pass: 2 };
  const sorted = [...results].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className={compact ? "space-y-2" : "card space-y-3"} data-testid="compliance">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {labels.title}
          {jurisdiction && <span className="ml-2 text-sm font-normal text-muted">({jurisdiction})</span>}
        </p>
        <p className="text-sm">{labels.summary}</p>
      </div>
      <p className="rounded bg-amber-50 p-2 text-xs text-warn">⚠️ {labels.disclaimer}</p>
      <ul className={compact ? "space-y-1 text-xs" : "space-y-2 text-sm"}>
        {sorted.map((r) => (
          <li key={r.code} className="border-b border-line pb-2 last:border-0">
            <details>
              <summary className="cursor-pointer list-none">
                <span className="mr-1">{ICON[r.status]}</span>
                <span className="font-medium">{r.title[locale]}</span>
                {!r.verified && <span className="ml-2 rounded bg-bg px-1.5 py-0.5 text-[10px] text-warn">{labels.unverified}</span>}
                <span className="block pl-6 text-muted">{r.message[locale]}</span>
              </summary>
              <div className="mt-1 space-y-1 pl-6 text-xs">
                {r.details.length > 0 && (
                  <ul className="list-disc pl-4">
                    {r.details.map((d, i) => (
                      <li key={i}>{d[locale]}</li>
                    ))}
                  </ul>
                )}
                <p className="text-muted">
                  {labels.source}: {r.sourceRef}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
