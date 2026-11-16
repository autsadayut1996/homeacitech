import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { PlanSchema } from "@/lib/plan-core";
import { latestVersion } from "@/lib/versions";
import { ReviewBoard, type DesignApprovalRow } from "@/components/ReviewBoard";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, title: true, status: true } });
  if (!project) notFound();
  const version = await latestVersion(id);
  const t = await getTranslations();
  const locale = (await getLocale()) as "th" | "en";
  if (!version) return <p className="card text-muted">{t("project.noDesigns")}</p>;
  const plan = PlanSchema.safeParse(version.plan);
  if (!plan.success) notFound();
  const comments = await db.reviewComment.findMany({ where: { versionId: version.id }, orderBy: { createdAt: "asc" } });
  const approvals = await db.approval.findMany({ where: { projectId: id, versionId: version.id, type: { not: "PRICE" } }, orderBy: { createdAt: "desc" } });
  // newest decision per discipline
  const byType = new Map<string, (typeof approvals)[number]>();
  for (const a of approvals) if (!byType.has(a.type)) byType.set(a.type, a);
  const rows: DesignApprovalRow[] = [...byType.values()]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((a) => ({ id: a.id, type: a.type as DesignApprovalRow["type"], status: a.status, approver: a.approver, licenseNo: a.licenseNo, note: a.note }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href={`/projects/${id}`} className="text-sm text-accent hover:underline">
          ← {project.code}
        </Link>
        <h1 className="text-lg font-bold">
          {t("review.title")} — {project.title} <span className="font-normal text-muted">v{version.number}</span>
        </h1>
        <span className="rounded-full bg-paper px-3 py-1 text-sm ring-1 ring-line">{t(`status.${project.status}`)}</span>
      </div>
      <p className="rounded bg-amber-50 p-2 text-xs text-warn">⚠️ {t("review.disclaimer")}</p>
      <ReviewBoard
        versionId={version.id}
        plan={plan.data}
        comments={comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
        approvals={rows}
        canDecide={project.status === "DESIGN_REVIEW"}
        locale={locale}
      />
    </div>
  );
}
