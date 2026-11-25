import { getTranslations } from "next-intl/server";
import { getCompany } from "@/lib/documents/company";
import { CompanyForm } from "@/components/settings/CompanyForm";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const t = await getTranslations("companyAdmin");
  const c = await getCompany();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      <CompanyForm
        usesDefaults={c.usesDefaults}
        initial={{
          nameTh: c.nameTh,
          nameEn: c.nameEn,
          address: c.address ?? "",
          taxId: c.taxId ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          website: c.website ?? "",
          logo: c.logo,
          vatPct: c.vatPct,
          quoteValidityDays: c.quoteValidityDays,
          salesDiscountLimitPct: c.salesDiscountLimitPct,
          paymentTerms: c.paymentTerms,
          quoteTermsTh: c.quoteTermsTh,
          quoteTermsEn: c.quoteTermsEn,
          contractTemplateTh: c.contractTemplateTh,
          contractTemplateEn: c.contractTemplateEn,
          quoteFormCode: c.quoteFormCode ?? "",
          priceIncludesVat: c.priceIncludesVat,
          quoteIntroTh: c.quoteIntroTh,
          quoteIntroEn: c.quoteIntroEn,
          quoteClosingTh: c.quoteClosingTh,
          quoteClosingEn: c.quoteClosingEn,
          specTemplate: c.specTemplate,
        }}
      />
    </div>
  );
}
