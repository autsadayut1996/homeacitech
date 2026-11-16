import type { DesignVersion } from "@prisma/client";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlanSchema, computeMetrics, validatePlan } from "@/lib/plan-core";
import type { AiSummary } from "@/app/projects/[id]/ai-actions";
import { SitePlanSvg } from "./SitePlanSvg";
import { OptionActions } from "./OptionActions";

export async function OptionCard({ version, locale }: { version: DesignVersion; locale: "th" | "en" }) {
  const t = await getTranslations();
  const f = await getFormatter();
  const parsed = PlanSchema.safeParse(version.plan);
  if (!parsed.success) return null;
  const plan = parsed.data;
  const s = (version.aiSummary ?? {}) as Partial<AiSummary>;
  const m = computeMetrics(plan);
  const v = validatePlan(plan);
  const bad = v.errors.flatMap((e) => e.roomIds ?? []);
  const title = (locale === "th" ? s.title_th : s.title_en) || version.label;
  const pros = (locale === "th" ? s.pros_th : s.pros_en) ?? [];
  const cons = (locale === "th" ? s.cons_th : s.cons_en) ?? [];

  return (
    <article className="card flex flex-col gap-3">
      <header>
        {s.variant && <p className="text-xs font-medium text-accent">{t(`ai.variant_${s.variant}`)}</p>}
        <h4 className="text-lg font-semibold">{title}</h4>
        <p className="text-sm text-muted">{locale === "th" ? s.concept_th : s.concept_en}</p>
      </header>
      <div className={`grid gap-2 ${plan.levels.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {plan.levels.map((l, i) => (
          <figure key={l.id}>
            <figcaption className="text-xs text-muted">{l.name[locale]}</figcaption>
            <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale={locale} highlight={bad} className="w-full rounded border border-line" />
          </figure>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">{t("plan.totalArea")}</dt>
        <dd className="text-right font-medium tabular-nums">
          {f.number(m.totalAreaM2, { maximumFractionDigits: 0 })} {t("units.sqm")}
        </dd>
        <dt className="text-muted">{t("plan.rooms", { bed: m.bedrooms, bath: m.bathrooms, park: m.parkingSpaces })}</dt>
        <dd />
        <dt className="text-muted">{t("ai.roughPrice")} *</dt>
        <dd className="text-right font-semibold tabular-nums">
          {version.totalPrice ? f.number(Number(version.totalPrice), { style: "currency", currency: "THB", maximumFractionDigits: 0 }) : "—"}
        </dd>
      </dl>
      <p className="text-sm">
        {v.errors.length ? t("ai.checkErr", { n: v.errors.length }) : v.warnings.length ? t("ai.checkWarn", { n: v.warnings.length }) : t("ai.checkOk")}
        {s.attempts && s.attempts > 1 ? <span className="text-muted"> · {t("ai.attempts", { n: s.attempts - 1 })}</span> : null}
      </p>
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="font-medium text-ok">{t("ai.pros")}</p>
            <ul className="list-disc pl-4">{pros.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div>
            <p className="font-medium text-warn">{t("ai.cons")}</p>
            <ul className="list-disc pl-4">{cons.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        </div>
      )}
      <div className="mt-auto">
        <OptionActions versionId={version.id} />
      </div>
    </article>
  );
}
