import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { RuleEditor } from "@/components/settings/RuleEditor";
import { NewJurisdictionForm } from "@/components/settings/NewJurisdictionForm";

export const dynamic = "force-dynamic";

export default async function RulesSettings() {
  const t = await getTranslations("rulesAdmin");
  const locale = await getLocale();
  const jurisdictions = await db.jurisdiction.findMany({
    orderBy: { code: "asc" },
    include: { ruleSets: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1, include: { rules: { orderBy: { code: "asc" } } } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      {jurisdictions.map((j) => {
        const set = j.ruleSets[0];
        const unverified = set?.rules.filter((r) => !r.verified).length ?? 0;
        return (
          <section key={j.id} className="space-y-2">
            <h2 className="text-lg font-semibold">
              {locale === "th" ? j.nameTh : j.nameEn} <span className="font-mono text-sm text-muted">{j.code}</span>
              {set && <span className="ml-2 text-sm font-normal text-muted">{t("setInfo", { v: set.version, n: set.rules.length, u: unverified })}</span>}
            </h2>
            {set?.rules.map((r) => (
              <RuleEditor
                key={r.id}
                rule={{ ...r, params: r.params, verifiedAt: r.verifiedAt?.toISOString() ?? null }}
              />
            ))}
          </section>
        );
      })}
      <NewJurisdictionForm sources={jurisdictions.map((j) => ({ code: j.code, name: locale === "th" ? j.nameTh : j.nameEn }))} />
    </div>
  );
}
