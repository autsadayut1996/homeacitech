import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const c = (await cookies()).get("locale")?.value;
  const locale: Locale = c === "en" ? "en" : "th";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
