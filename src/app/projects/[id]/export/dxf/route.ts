import { db } from "@/lib/db";
import { PlanSchema } from "@/lib/plan-core";
import { encodeDxf, planToDxf } from "@/lib/export/dxf";

export const dynamic = "force-dynamic";

/** GET /projects/:id/export/dxf?v=<versionId>&units=mm|m&lang=th|en → AutoCAD DXF (R12, cp874). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const v = url.searchParams.get("v");
  const units = url.searchParams.get("units") === "m" ? "m" : "mm";
  const locale = url.searchParams.get("lang") === "en" ? "en" : "th";
  const project = await db.project.findUnique({ where: { id }, select: { code: true, title: true, status: true } });
  if (!project) return new Response("Not found", { status: 404 });
  const version = v
    ? await db.designVersion.findFirst({ where: { id: v, projectId: id } })
    : await db.designVersion.findFirst({ where: { projectId: id, number: { not: null } }, orderBy: { number: "desc" } });
  const plan = version && PlanSchema.safeParse(version.plan);
  if (!version || !plan || !plan.success) return new Response("No design", { status: 404 });

  const date = new Date().toLocaleDateString(locale === "th" ? "th-TH" : "en-GB");
  const dxf = planToDxf(plan.data, {
    units,
    locale,
    title: `${project.code} ${project.title}`,
    subtitle: `${locale === "th" ? "แบบเวอร์ชัน" : "Design version"} ${version.number ?? "-"} - ${date}`,
  });
  const filename = `${project.code}-v${version.number ?? "option"}.dxf`;
  return new Response(Buffer.from(encodeDxf(dxf)), {
    headers: {
      "Content-Type": "application/dxf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
