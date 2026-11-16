import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { PlanSchema, diffPlans, roomLabel } from "@/lib/plan-core";
import { loadCatalog } from "@/lib/pricing/catalog";
import { estimate } from "@/lib/pricing/materials";
import { SitePlanSvg } from "@/components/SitePlanSvg";

export const dynamic = "force-dynamic";

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const project = await db.project.findUnique({ where: { id }, select: { code: true, title: true } });
  if (!project) notFound();
  const versions = await db.designVersion.findMany({ where: { projectId: id, number: { not: null } }, orderBy: { number: "asc" } });
  if (versions.length === 0) notFound();
  const vb = versions.find((v) => v.id === sp.b) ?? versions[versions.length - 1];
  const va = versions.find((v) => v.id === sp.a) ?? versions[Math.max(0, versions.indexOf(vb) - 1)];
  const pa = PlanSchema.safeParse(va.plan);
  const pb = PlanSchema.safeParse(vb.plan);
  if (!pa.success || !pb.success) notFound();
  const t = await getTranslations();
  const f = await getFormatter();
  const locale = (await getLocale()) as "th" | "en";
  const catalog = await loadCatalog();
  const ea = estimate(pa.data, catalog);
  const eb = estimate(pb.data, catalog);
  const d = diffPlans(pa.data, pb.data);
  const m = d.metrics;
  const num = (v: number, digits = 1) => f.number(v, { maximumFractionDigits: digits });
  const signed = (v: number, digits = 1) => (Math.abs(v) < 10 ** -digits ? "±0" : `${v > 0 ? "+" : "−"}${num(Math.abs(v), digits)}`);
  const baht = (v: number) => `฿${num(v, 0)}`;
  const matName = (code?: string) => {
    const mm = code && catalog.find((x) => x.code === code);
    return mm ? (locale === "th" ? mm.nameTh : mm.nameEn) : t("compare.packageDefault");
  };

  const rows: [string, number, number, number, (v: number) => string][] = [
    [t("compare.price"), ea.total, eb.total, 0, baht],
    [t("plan.totalArea"), m.before.totalAreaM2, m.after.totalAreaM2, 1, (v) => `${num(v)} ${t("units.sqm")}`],
    [t("plan.indoorArea"), m.before.indoorAreaM2, m.after.indoorAreaM2, 1, (v) => `${num(v)} ${t("units.sqm")}`],
    [t("brief.bedrooms"), m.before.bedrooms, m.after.bedrooms, 0, (v) => num(v, 0)],
    [t("brief.bathrooms"), m.before.bathrooms, m.after.bathrooms, 0, (v) => num(v, 0)],
    [t("brief.parking"), m.before.parkingSpaces, m.after.parkingSpaces, 0, (v) => num(v, 0)],
    [t("plan.far"), m.before.far, m.after.far, 2, (v) => num(v, 2)],
    [t("plan.osr"), m.before.osrPercent, m.after.osrPercent, 1, (v) => `${num(v)}%`],
  ];
  const changedIds = d.rooms.filter((r) => r.kind !== "removed").map((r) => r.room.id);
  const removedIds = d.rooms.filter((r) => r.kind === "removed").map((r) => r.room.id);
  const levelCount = Math.max(pa.data.levels.length, pb.data.levels.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href={`/projects/${id}?v=${vb.id}`} className="text-sm text-accent hover:underline">
          ← {project.code}
        </Link>
        <h1 className="text-lg font-bold">
          {t("compare.title")} — {project.title}
        </h1>
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
        <select name="a" defaultValue={va.id} className="input w-auto">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} {v.label ? `— ${v.label.slice(0, 40)}` : ""}
            </option>
          ))}
        </select>
        <span>⇄</span>
        <select name="b" defaultValue={vb.id} className="input w-auto">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} {v.label ? `— ${v.label.slice(0, 40)}` : ""}
            </option>
          ))}
        </select>
        <button className="btn-ghost">{t("compare.show")}</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_320px]">
        {[
          { v: va, p: pa.data, hl: removedIds },
          { v: vb, p: pb.data, hl: changedIds },
        ].map(({ v, p, hl }) => (
          <div key={v.id} className="space-y-2">
            <p className="font-semibold">
              v{v.number} <span className="font-normal text-muted">{v.label}</span>
            </p>
            {Array.from({ length: levelCount }, (_, i) =>
              p.levels[i] ? (
                <figure key={i} className="card p-2">
                  <figcaption className="text-xs text-muted">{p.levels[i].name[locale]}</figcaption>
                  <SitePlanSvg site={p.site} plan={p} levelIndex={i} locale={locale} highlight={hl} className="w-full" />
                </figure>
              ) : (
                <div key={i} className="card grid h-40 place-items-center text-sm text-muted">
                  {t("compare.noLevel")}
                </div>
              ),
            )}
          </div>
        ))}

        <aside className="space-y-3">
          <div className="card p-4">
            <table className="w-full text-sm" data-testid="compare-table">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="text-left font-normal"></th>
                  <th className="text-right font-normal">v{va.number}</th>
                  <th className="text-right font-normal">v{vb.number}</th>
                  <th className="text-right font-normal">±</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, a, b, digits, fmt]) => (
                  <tr key={label} className="border-t border-line">
                    <td className="py-1 text-muted">{label}</td>
                    <td className="text-right tabular-nums">{fmt(a)}</td>
                    <td className="text-right tabular-nums">{fmt(b)}</td>
                    <td className={`text-right tabular-nums ${b > a ? "text-warn" : b < a ? "text-ok" : "text-muted"}`}>{signed(b - a, digits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card space-y-1 p-4 text-sm">
            <p className="font-semibold">{t("compare.roomChanges", { n: d.rooms.length })}</p>
            {d.rooms.length === 0 && <p className="text-muted">{t("compare.noRoomChanges")}</p>}
            <ul className="space-y-1">
              {d.rooms.map((r) => (
                <li key={`${r.levelId}-${r.room.id}`}>
                  <span className="mr-1 rounded bg-bg px-1.5 text-xs">{t(`compare.kind_${r.kind}`)}</span>
                  {roomLabel(r.room, locale)}{" "}
                  <span className="text-muted">
                    {r.kind === "removed" ? `${num(r.areaBefore)}` : r.kind === "added" ? `${num(r.areaAfter)}` : `${num(r.areaBefore)} → ${num(r.areaAfter)}`} {t("units.sqm")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {(d.selections.length > 0 || d.packageBefore !== d.packageAfter) && (
            <div className="card space-y-1 p-4 text-sm">
              <p className="font-semibold">{t("compare.materialChanges")}</p>
              {d.packageBefore !== d.packageAfter && (
                <p>
                  {t("studio.package")}: {t(`studio.pkg_${d.packageBefore}`)} → {t(`studio.pkg_${d.packageAfter}`)}
                </p>
              )}
              {d.selections.map((s) => (
                <p key={s.slot}>
                  {t(`studio.slot_${s.slot}` as never)}: {matName(s.before)} → {matName(s.after)}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">* {t("ai.roughNote")}</p>
        </aside>
      </div>
    </div>
  );
}
