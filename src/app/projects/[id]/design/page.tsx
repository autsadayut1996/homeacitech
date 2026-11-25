import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { PlanSchema } from "@/lib/plan-core";
import { loadCatalog } from "@/lib/pricing/catalog";
import { estimate } from "@/lib/pricing/materials";
import { MaterialsStudio } from "@/components/MaterialsStudio";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const project = await db.project.findUnique({ where: { id }, select: { code: true, title: true } });
  if (!project) notFound();
  const version = v
    ? await db.designVersion.findFirst({ where: { id: v, projectId: id } })
    : await db.designVersion.findFirst({ where: { projectId: id, number: { not: null } }, orderBy: { number: "desc" } });
  if (!version) notFound();
  const plan = PlanSchema.safeParse(version.plan);
  if (!plan.success) notFound();
  const catalog = await loadCatalog();
  const t = await getTranslations("studio");
  const locale = (await getLocale()) as "th" | "en";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <Link href={`/projects/${id}?v=${version.id}`} className="text-sm text-accent hover:underline">
          ← {project.code}
        </Link>
        <h1 className="text-lg font-bold">
          {t("title")} — {project.title} <span className="font-normal text-muted">v{version.number}</span>
        </h1>
      </div>
      <MaterialsStudio
        projectId={id}
        baseVersion={{ id: version.id, number: version.number }}
        initialPlan={plan.data}
        catalog={catalog}
        savedTotal={estimate(plan.data, catalog).total}
        locale={locale}
      />
    </div>
  );
}
