import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { computeMetrics, describeIssue, roomLabel, type Plan, type ValidationResult } from "@/lib/plan-core";

export async function PlanSummary({ plan, result }: { plan: Plan; result: ValidationResult }) {
  const t = await getTranslations("plan");
  const f = await getFormatter();
  const locale = (await getLocale()) as "th" | "en";
  const m = computeMetrics(plan);
  const sqm = (v: number) => `${f.number(v, { maximumFractionDigits: 1 })} ${t("sqm")}`;
  const roomName = (id: string) => {
    for (const l of plan.levels) {
      const r = l.rooms.find((x) => x.id === id);
      if (r) return roomLabel(r, locale);
    }
    return id;
  };

  const rows: [string, string][] = [
    [t("totalArea"), sqm(m.totalAreaM2)],
    [t("indoorArea"), sqm(m.indoorAreaM2)],
    [t("footprint"), sqm(m.footprintM2)],
    [t("openSpace"), sqm(m.openSpaceM2)],
    [t("far"), f.number(m.far, { maximumFractionDigits: 2 })],
    [t("osr"), `${f.number(m.osrPercent, { maximumFractionDigits: 1 })}%`],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 font-semibold">{t("metrics")}</h3>
        <p className="mb-3 text-sm text-muted">{t("rooms", { bed: m.bedrooms, bath: m.bathrooms, park: m.parkingSpaces })}</p>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card">
        <h3 className="mb-3 font-semibold">{t("check")}</h3>
        {result.errors.length === 0 && result.warnings.length === 0 && <p className="text-sm text-ok">✅ {t("allGood")}</p>}
        {[
          { list: result.errors, icon: "❌", label: t("errors"), color: "text-bad" },
          { list: result.warnings, icon: "⚠️", label: t("warnings"), color: "text-warn" },
        ].map(
          (g) =>
            g.list.length > 0 && (
              <div key={g.label} className="mb-3">
                <p className={`mb-1 text-sm font-medium ${g.color}`}>
                  {g.icon} {g.label} ({g.list.length})
                </p>
                <ul className="space-y-1 text-sm">
                  {g.list.map((i, k) => (
                    <li key={k}>
                      {i.roomIds?.length ? <span className="font-medium">{i.roomIds.map(roomName).join(" / ")}: </span> : null}
                      {describeIssue(i, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
