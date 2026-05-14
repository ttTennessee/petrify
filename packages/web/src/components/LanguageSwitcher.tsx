import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, type SupportedLang } from "../i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
    <Select
      value={current}
      onValueChange={(v) => {
        void i18n.changeLanguage(v);
      }}
    >
      <SelectTrigger
        className="h-8 w-auto gap-2 px-2.5 text-xs"
        aria-label="Language"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_LANGS.map((lng) => (
          <SelectItem key={lng} value={lng} className="text-xs">
            {LABELS[lng]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
