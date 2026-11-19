import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { QuoteSnapshot } from "@/lib/documents/snapshot";
import { QuotationDocument } from "@/components/documents/QuotationDocument";
import { DocToolbar } from "@/components/documents/DocToolbar";

export const dynamic = "force-dynamic";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await db.quotation.findUnique({ where: { id } });
  if (!q?.snapshot) notFound();
  const t = await getTranslations("doc");
  return (
    <div>
      <DocToolbar
        backHref={`/projects/${q.projectId}`}
        links={[
          { href: `/quotations/${id}`, label: t("quotation"), active: true },
          { href: `/quotations/${id}/contract`, label: t("contract") },
        ]}
      />
      <QuotationDocument s={q.snapshot as unknown as QuoteSnapshot} />
    </div>
  );
}
