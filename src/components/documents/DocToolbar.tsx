"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function DocToolbar({ backHref, links }: { backHref: string; links: { href: string; label: string; active?: boolean }[] }) {
  const t = useTranslations("doc");
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
      <Link href={backHref} className="text-sm text-accent hover:underline">
        ← {t("back")}
      </Link>
      <div className="ml-auto flex gap-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={l.active ? "btn-primary" : "btn-ghost"}>
            {l.label}
          </Link>
        ))}
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 {t("print")}
        </button>
      </div>
      <p className="w-full text-xs text-muted">{t("printHint")}</p>
    </div>
  );
}
