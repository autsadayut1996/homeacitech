import { getTranslations } from "next-intl/server";
import { contractVars, renderTemplate, type QuoteSnapshot } from "@/lib/documents/snapshot";
import { DocHeader, Signatures, Watermark } from "./DocHeader";

export async function ContractDocument({ s }: { s: QuoteSnapshot }) {
  const t = await getTranslations({ locale: s.locale });
  const body = renderTemplate(s.contractTemplate, contractVars(s));
  return (
    <article className="doc-paper" data-testid="contract">
      <Watermark show={s.isDraft} text={t("doc.draft")} />
      <DocHeader s={s} title={t("doc.contract")} lines={[[t("doc.refQuotation"), s.number]]} />
      <div className="doc-section whitespace-pre-line" data-testid="contract-body">
        {body}
      </div>
      <Signatures boxes={[t("doc.signOwner"), t("doc.signContractor"), t("doc.signWitness"), t("doc.signWitness")]} />
    </article>
  );
}
