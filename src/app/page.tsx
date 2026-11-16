import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LandSchema, landAreaSqWa } from "@/lib/brief";

export const dynamic = "force-dynamic";

export default async function Home() {
  const t = await getTranslations();
  const f = await getFormatter();
  const projects = await db.project.findMany({ include: { customer: true, brief: true }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("app.projects")}</h1>
      {projects.length === 0 ? (
        <div className="card text-muted">{t("list.empty")}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("list.code")}</th>
                <th className="px-4 py-2">{t("list.title")}</th>
                <th className="px-4 py-2">{t("list.customer")}</th>
                <th className="px-4 py-2">{t("list.land")}</th>
                <th className="px-4 py-2">{t("list.status")}</th>
                <th className="px-4 py-2">{t("list.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const land = p.brief ? LandSchema.safeParse(p.brief.land) : null;
                return (
                  <tr key={p.id} className="border-t border-line hover:bg-bg">
                    <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-2">
                      <Link href={`/projects/${p.id}`} className="font-medium text-accent hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.customer.name}</td>
                    <td className="px-4 py-2">
                      {land?.success ? `${f.number(landAreaSqWa(land.data).sqwa, { maximumFractionDigits: 1 })} ${t("units.sqwa")} · ${land.data.province}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-bg px-2 py-0.5 text-xs">{t(`status.${p.status}`)}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">{f.dateTime(p.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
