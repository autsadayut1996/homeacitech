import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LandSchema, RequirementsSchema, landAreaSqWa, siteFromLand } from "@/lib/brief";
import { loadRules } from "@/lib/compliance/server";
import { evaluateAll, overallStatus, type Mark, type RuleResult } from "@/lib/compliance/rules";
import { CompliancePanel } from "@/components/CompliancePanel";
import { WorkflowPanel, type ApprovalRow } from "@/components/WorkflowPanel";
import { RestoreVersionButton } from "@/components/RestoreVersionButton";
import { priceIsApproved, type Status } from "@/lib/workflow";
import { PlanSchema, area, buildableArea, formatRaiNganWa, validatePlan } from "@/lib/plan-core";
import { SitePlanSvg } from "@/components/SitePlanSvg";
import { PlanSummary } from "@/components/PlanSummary";
import { AiDesignPanel } from "@/components/AiDesignPanel";
import { EditDesignBox } from "@/components/EditDesignBox";
import { OptionCard } from "@/components/OptionCard";

export const dynamic = "force-dynamic";
// AI generation runs as server actions on this page; allow long model calls on Vercel.
export const maxDuration = 300;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v: selected } = await searchParams;
  const project = await db.project.findUnique({
    where: { id },
    include: { customer: true, brief: true, versions: { orderBy: [{ number: "desc" }, { createdAt: "desc" }] }, approvals: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) notFound();
  const t = await getTranslations();
  const f = await getFormatter();
  const locale = (await getLocale()) as "th" | "en";

  const land = project.brief ? LandSchema.safeParse(project.brief.land) : null;
  const req = project.brief ? RequirementsSchema.safeParse(project.brief.requirements) : null;
  const loaded = await loadRules(project.jurisdictionId);
  const site = land?.success
    ? siteFromLand(land.data, loaded.rules, req?.success ? { floors: req.data.floors, buildingType: req.data.buildingType } : {})
    : null;
  const jurisdictionName = loaded.jurisdiction ? (locale === "th" ? loaded.jurisdiction.nameTh : loaded.jurisdiction.nameEn) : null;
  const buildable = site ? buildableArea(site) : null;
  const options = project.versions.filter((v) => v.isOption);
  const versions = project.versions.filter((v) => !v.isOption && v.number !== null).sort((a, b) => a.number! - b.number!);
  const current = versions.find((v) => v.id === selected) ?? versions[versions.length - 1];
  const currentPlan = current ? PlanSchema.safeParse(current.plan) : null;
  const latest = versions[versions.length - 1];
  const settings = await db.companySettings.findUnique({ where: { id: "default" } });
  const versionNo = new Map(project.versions.map((v) => [v.id, v.number]));
  const approvalRows: ApprovalRow[] = project.approvals.map((a) => ({
    id: a.id,
    type: a.type,
    status: a.status,
    versionNumber: a.versionId ? (versionNo.get(a.versionId) ?? null) : null,
    isCurrentVersion: !!latest && a.versionId === latest.id,
    approver: a.approver,
    licenseNo: a.licenseNo,
    note: a.note,
    listPrice: a.listPrice === null ? null : Number(a.listPrice),
    discountAmount: a.discountAmount === null ? null : Number(a.discountAmount),
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
  }));
  const approvedPrice = project.approvals.findLast((a) => a.type === "PRICE" && a.status === "APPROVED" && a.versionId === current?.id);
  const priceFinal = !!approvedPrice && priceIsApproved(project.status as Status) && current?.id === latest?.id;
  const compliance: RuleResult[] | null = currentPlan?.success
    ? evaluateAll(loaded.rules, { plan: currentPlan.data, buildingType: req?.success ? req.data.buildingType : undefined, zone: land?.success ? land.data.zone : null })
    : null;
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
                {land.data.zone && <Row k={t("brief.zone")} v={land.data.zone} />}
                <p className="rounded bg-amber-50 p-2 text-xs text-warn">⚠️ {t("project.envelopeNote", { j: jurisdictionName ?? "—" })}</p>
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

      <WorkflowPanel
        projectId={project.id}
        status={project.status as Status}
        approvals={approvalRows}
        version={latest ? { id: latest.id, number: latest.number!, price: latest.totalPrice ? Number(latest.totalPrice) : null } : null}
        discountLimitPct={Number(settings?.salesDiscountLimitPct ?? 3)}
        locale={locale}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("project.designs")}</h2>
        {project.brief && <AiDesignPanel projectId={project.id} hasOptions={options.length > 0} />}

        {options.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">{t("ai.options")}</h3>
            <div className="grid gap-4 xl:grid-cols-3">
              {options.map((o) => (
                <OptionCard key={o.id} version={o} locale={locale} />
              ))}
            </div>
          </div>
        )}

        {versions.length === 0 && options.length === 0 && <div className="card text-sm text-muted">{t("project.noDesigns")}</div>}

        {current && currentPlan?.success && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t("ai.versions")}:</span>
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={`/projects/${project.id}?v=${v.id}`}
                  className={`rounded-full px-3 py-1 ring-1 ${v.id === current.id ? "bg-accent text-white ring-accent" : "bg-paper ring-line hover:bg-bg"}`}
                  title={v.label ?? undefined}
                >
                  v{v.number}
                </Link>
              ))}
              {versions.length > 1 && (
                <Link
                  href={`/projects/${project.id}/compare?a=${(current.id === versions[0].id ? versions[1] : versions[versions.indexOf(current) - 1] ?? versions[0]).id}&b=${current.id}`}
                  className="ml-2 text-accent hover:underline"
                >
                  ⇄ {t("wf.compare")}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {t("project.version", { n: current.number ?? 0 })}
                {current.label && <span className="font-normal text-muted"> — {current.label}</span>}
              </p>
              <Link href={`/projects/${project.id}/edit?v=${current.id}`} className="btn-ghost">
                ✏️ {t("editor.open")}
              </Link>
              <Link href={`/projects/${project.id}/design?v=${current.id}`} className="btn-ghost">
                🧊 {t("studio.open")}
              </Link>
              {current.id !== latest?.id && <RestoreVersionButton projectId={project.id} versionId={current.id} number={current.number ?? 0} locale={locale} />}
              {current.totalPrice && (
                <p className="text-sm" title={t("ai.roughNote")} data-testid="price">
                  {!priceFinal && <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-warn">{t("wf.draftBadge")}</span>}
                  <span className="text-muted">{t("ai.roughPrice")}: </span>
                  <span className="font-semibold">{baht(Number(current.totalPrice))}</span>
                  {priceFinal && approvedPrice?.discountAmount && Number(approvedPrice.discountAmount) > 0 && (
                    <span className="ml-1">
                      − {baht(Number(approvedPrice.discountAmount))} = <span className="font-semibold text-ok">{baht(Number(current.totalPrice) - Number(approvedPrice.discountAmount))}</span>
                    </span>
                  )}
                  <span className="text-muted"> *</span>
                </p>
              )}
            </div>
            <PlanViews plan={currentPlan.data} locale={locale} marks={compliance?.flatMap((r) => r.marks) ?? []} />
            <EditDesignBox versionId={current.id} projectId={project.id} />
            <PlanSummary plan={currentPlan.data} result={validatePlan(currentPlan.data)} />
            {compliance && (
              <CompliancePanel
                results={compliance}
                locale={locale}
                jurisdiction={jurisdictionName}
                labels={{
                  title: t("compliance.title"),
                  disclaimer: t("compliance.disclaimer"),
                  unverified: t("compliance.unverified"),
                  source: t("compliance.source"),
                  summary: t(`compliance.overall_${overallStatus(compliance)}`),
                }}
              />
            )}
            {current.totalPrice && <p className="text-xs text-muted">* {t("ai.roughNote")}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function PlanViews({ plan, locale, marks = [] }: { plan: import("@/lib/plan-core").Plan; locale: "th" | "en"; marks?: Mark[] }) {
  const result = validatePlan(plan);
  const bad = result.errors.flatMap((e) => e.roomIds ?? []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plan.levels.map((l, i) => (
        <figure key={l.id} className="card p-3">
          <figcaption className="mb-2 text-sm font-medium">
            {l.name[locale]} <span className="text-muted">({l.rooms.length} {locale === "th" ? "ห้อง" : "rooms"})</span>
          </figcaption>
          <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale={locale} highlight={bad} marks={marks} className="w-full" />
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
