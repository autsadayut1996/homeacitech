import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LandSchema, PROVISIONAL_SETBACK_M, RequirementsSchema, landAreaSqWa, siteFromLand } from "@/lib/brief";
import { PlanSchema, area, buildableArea, formatRaiNganWa, validatePlan } from "@/lib/plan-core";
import { SitePlanSvg } from "@/components/SitePlanSvg";
import { PlanSummary } from "@/components/PlanSummary";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: { customer: true, brief: true, versions: { orderBy: { number: "desc" } } },
  });
  if (!project) notFound();
  const t = await getTranslations();
  const f = await getFormatter();
  const locale = (await getLocale()) as "th" | "en";

  const land = project.brief ? LandSchema.safeParse(project.brief.land) : null;
  const req = project.brief ? RequirementsSchema.safeParse(project.brief.requirements) : null;
  const site = land?.success ? siteFromLand(land.data) : null;
  const buildable = site ? buildableArea(site) : null;
  const latest = project.versions[0];
  const latestPlan = latest ? PlanSchema.safeParse(latest.plan) : null;
  const baht = (n: number | null | undefined) => (n ? f.number(n, { style: "currency", currency: "THB", maximumFractionDigits: 0 }) : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-muted">{project.code}</p>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted">
            {project.customer.name}
            {project.customer.phone && ` · ${project.customer.phone}`}
            {project.customer.email && ` · ${project.customer.email}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-paper px-3 py-1 text-sm ring-1 ring-line">{t(`status.${project.status}`)}</span>
          <Link href={`/projects/${project.id}/brief`} className="btn-ghost">
            {t("project.editBrief")}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t("project.landSummary")}</h2>
          {land?.success && site && buildable ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SitePlanSvg site={site} locale={locale} className="max-h-80 w-full rounded border border-line" />
              <div className="space-y-2 text-sm">
                <Row k={t("project.landArea")} v={`${f.number(landAreaSqWa(land.data).fromShape, { maximumFractionDigits: 1 })} ${t("units.sqwa")} (${formatRaiNganWa(landAreaSqWa(land.data).fromShape)})`} />
                {land.data.areaSqWa && <Row k={t("project.deedArea")} v={`${f.number(land.data.areaSqWa)} ${t("units.sqwa")}`} />}
                <Row k={t("brief.frontFacing")} v={t(`facing.${land.data.frontFacing}`)} />
                <Row
                  k={t("project.roads")}
                  v={land.data.roads
                    .map((r) => `${typeof r.side === "number" ? t("brief.edge", { n: r.side + 1 }) : t(`brief.side_${r.side}`)} ${r.widthM} ${t("units.m")}`)
                    .join(", ")}
                />
                <Row k={t("brief.province")} v={[land.data.district, land.data.province].filter(Boolean).join(", ")} />
                <Row k={t("project.buildable")} v={`${f.number(area(buildable.polygon), { maximumFractionDigits: 1 })} ${t("units.sqm")}`} />
                <p className="rounded bg-amber-50 p-2 text-xs text-warn">⚠️ {t("project.provisionalSetback", { m: PROVISIONAL_SETBACK_M })}</p>
                {buildable.approximate && <p className="text-xs text-warn">⚠️ {t("project.approxSetback")}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="mb-1 font-semibold">{t("project.requirements")}</h2>
          {req?.success ? (
            <>
              <p className="font-medium">
                {t(`buildingType.${req.data.buildingType}`)} · {t(`style.${req.data.style}`)} · {t("project.floors", { n: req.data.floors })}
              </p>
              <p>{t("project.rooms", { bed: req.data.bedrooms, bath: req.data.bathrooms, park: req.data.parking })}</p>
              {req.data.targetAreaM2 && <p>{t("project.target", { m: req.data.targetAreaM2 })}</p>}
              {req.data.specialRooms.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {req.data.specialRooms.map((r) => (
                    <span key={r} className="rounded-full bg-bg px-2 py-0.5 text-xs">
                      {t(`special.${r}`)}
                    </span>
                  ))}
                </div>
              )}
              <p>
                <span className="text-muted">{t("project.budget")}: </span>
                {project.brief?.budgetMin || project.brief?.budgetMax ? `${baht(project.brief?.budgetMin)} – ${baht(project.brief?.budgetMax)}` : t("project.notSpecified")}
              </p>
              {project.brief?.freeText && (
                <blockquote className="border-l-2 border-accent pl-3 text-muted">
                  <span className="block text-xs">{t("project.customerSaid")}</span>“{project.brief.freeText}”
                </blockquote>
              )}
            </>
          ) : (
            <p className="text-muted">—</p>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("project.designs")}</h2>
        {!latest && <div className="card text-sm text-muted">{t("project.noDesigns")}</div>}
        {latest && latestPlan?.success && (
          <>
            <p className="text-sm text-muted">
              {t("project.version", { n: latest.number })}
              {latest.label && ` — ${latest.label}`}
            </p>
            <PlanViews plan={latestPlan.data} locale={locale} />
            <PlanSummary plan={latestPlan.data} result={validatePlan(latestPlan.data)} />
          </>
        )}
      </section>
    </div>
  );
}

function PlanViews({ plan, locale }: { plan: import("@/lib/plan-core").Plan; locale: "th" | "en" }) {
  const result = validatePlan(plan);
  const bad = result.errors.flatMap((e) => e.roomIds ?? []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plan.levels.map((l, i) => (
        <figure key={l.id} className="card p-3">
          <figcaption className="mb-2 text-sm font-medium">
            {l.name[locale]} <span className="text-muted">({l.rooms.length} {locale === "th" ? "ห้อง" : "rooms"})</span>
          </figcaption>
          <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale={locale} highlight={bad} className="w-full" />
        </figure>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
