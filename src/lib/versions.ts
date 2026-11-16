import { db } from "./db";

export async function nextVersionNumber(projectId: string): Promise<number> {
  const last = await db.designVersion.findFirst({ where: { projectId, number: { not: null } }, orderBy: { number: "desc" } });
  return (last?.number ?? 0) + 1;
}
