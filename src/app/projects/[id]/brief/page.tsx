import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BriefForm } from "@/components/BriefForm";
import { db } from "@/lib/db";
import { briefToForm } from "@/lib/brief-form";

export default async function EditBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, include: { customer: true, brief: true } });
  if (!project) notFound();
  const t = await getTranslations("brief");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {t("editTitle")} <span className="font-mono text-base text-muted">{project.code}</span>
      </h1>
      <BriefForm initial={briefToForm(project)} projectId={project.id} />
    </div>
  );
}
