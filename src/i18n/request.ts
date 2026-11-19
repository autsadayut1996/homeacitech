import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async ({ locale: explicit }) => {
  // An explicit locale (e.g. getTranslations({ locale }) for a document printed in another
  // language) wins; otherwise use the UI language cookie.
  const requested = explicit ?? (await cookies()).get("locale")?.value;
  const locale: Locale = requested === "en" ? "en" : "th";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
