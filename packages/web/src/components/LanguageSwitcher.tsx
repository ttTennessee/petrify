import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, type SupportedLang } from "../i18n";

// Plain-text labels live here on purpose — the switcher itself shouldn't
// depend on translation files being populated.
const LABELS: Record<SupportedLang, string> = {
  en: "English",
  "zh-CN": "中文",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (SUPPORTED_LANGS as readonly string[]).includes(
    i18n.resolvedLanguage ?? "",
  )
    ? (i18n.resolvedLanguage as SupportedLang)
    : "en";

  return (
    <select
      value={current}
      onChange={(e) => {
        void i18n.changeLanguage(e.target.value);
      }}
      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:border-slate-300"
      aria-label="Language"
    >
      {SUPPORTED_LANGS.map((lng) => (
        <option key={lng} value={lng}>
          {LABELS[lng]}
        </option>
      ))}
    </select>
  );
}
