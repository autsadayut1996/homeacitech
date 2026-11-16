import { getTranslations } from "next-intl/server";
import { BriefForm, EMPTY_BRIEF } from "@/components/BriefForm";

export default async function NewProject() {
  const t = await getTranslations("brief");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <BriefForm initial={EMPTY_BRIEF} />
    </div>
  );
}
