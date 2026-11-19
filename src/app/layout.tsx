import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import "./globals.css";

const thai = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "700"], variable: "--font-thai" });

export const metadata: Metadata = { title: "House Design" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("app");
  const tn = await getTranslations("nav");
  return (
    <html lang={locale} className={thai.variable}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <header className="no-print border-b border-line bg-paper">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
              <Link href="/" className="font-bold text-accent">
                {t("name")}
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link href="/" className="hover:text-accent">
                  {t("projects")}
                </Link>
                <Link href="/settings/rules" className="hover:text-accent">
                  {tn("rules")}
                </Link>
                <Link href="/settings/company" className="hover:text-accent">
                  {tn("company")}
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <Link href="/projects/new" className="btn-primary">
                  + {t("newProject")}
                </Link>
                <LanguageToggle locale={locale as "th" | "en"} label={t("language")} />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-6 print:max-w-none print:p-0">{children}</main>
          <footer className="no-print mx-auto max-w-7xl px-6 pb-8 text-xs text-muted">⚠️ {t("disclaimer")}</footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
