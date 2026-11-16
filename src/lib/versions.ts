import { db } from "./db";
import { onNewVersion, type Status } from "./workflow";

export async function nextVersionNumber(projectId: string): Promise<number> {
  const last = await db.designVersion.findFirst({ where: { projectId, number: { not: null } }, orderBy: { number: "desc" } });
  return (last?.number ?? 0) + 1;
}

export async function latestVersion(projectId: string) {
  return db.designVersion.findFirst({ where: { projectId, number: { not: null } }, orderBy: { number: "desc" } });
}

/** Call before creating a numbered version. Returns an error message when the design is locked. */
export async function checkCanAddVersion(projectId: string): Promise<{ th: string; en: string } | null> {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  return onNewVersion(p.status as Status).allowed
    ? null
    : { th: "เซ็นสัญญาแล้ว แก้แบบไม่ได้ — ต้องทำใบเปลี่ยนแปลงงานแยก", en: "The contract is signed; the design is locked (needs a separate change order)" };
}

/** Call after creating a numbered version: a changed design voids approvals in progress. */
export async function afterVersionAdded(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const r = onNewVersion(p.status as Status);
  if (r.resetTo) {
    await db.$transaction([
      db.project.update({ where: { id: projectId }, data: { status: r.resetTo } }),
      db.approval.updateMany({ where: { projectId, status: "PENDING" }, data: { status: "CHANGES_REQUESTED", note: "แบบถูกแก้ไขหลังส่งอนุมัติ / design changed after submission", decidedAt: new Date() } }),
    ]);
  }
}
