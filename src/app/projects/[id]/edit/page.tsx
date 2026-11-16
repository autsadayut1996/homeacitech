import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { PlanSchema } from "@/lib/plan-core";
import { PlanEditor } from "@/components/editor/PlanEditor";
import { loadCatalog } from "@/lib/pricing/catalog";
import { loadRules } from "@/lib/compliance/server";
import { LandSchema, RequirementsSchema } from "@/lib/brief";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, title: true, jurisdictionId: true, brief: true } });
  if (!project) notFound();
  const version = v
    ? await db.designVersion.findFirst({ where: { id: v, projectId: id } })
    : await db.designVersion.findFirst({ where: { projectId: id, number: { not: null } }, orderBy: { number: "desc" } });
  if (!version) notFound();
  const plan = PlanSchema.safeParse(version.plan);
  if (!plan.success) notFound();
  const t = await getTranslations("editor");
  const locale = (await getLocale()) as "th" | "en";
  const loaded = await loadRules(project.jurisdictionId);
  const land = LandSchema.safeParse(project.brief?.land);
  const req = RequirementsSchema.safeParse(project.brief?.requirements);
  const complianceContext = { buildingType: req.success ? req.data.buildingType : undefined, zone: land.success ? (land.data.zone ?? null) : null };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <Link href={`/projects/${id}?v=${version.id}`} className="text-sm text-accent hover:underline">
          ← {project.code}
        </Link>
        <h1 className="text-lg font-bold">
          {t("title")} — {project.title}
        </h1>
      </div>
      <PlanEditor projectId={id} baseVersion={{ id: version.id, number: version.number }} initialPlan={plan.data}
        catalog={await loadCatalog()}
        rules={loaded.rules}
        complianceContext={complianceContext}
        jurisdiction={loaded.jurisdiction ? (locale === "th" ? loaded.jurisdiction.nameTh : loaded.jurisdiction.nameEn) : null}
        locale={locale}
      />
    </div>
  );
}
