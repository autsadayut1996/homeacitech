"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions";

export function LanguageToggle({ locale, label }: { locale: "th" | "en"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost" disabled={pending} onClick={() => start(() => setLocale(locale === "th" ? "en" : "th"))}>
      {label}
    </button>
  );
}
