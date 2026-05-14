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
        className="h-7 w-auto gap-1.5 border-0 bg-transparent px-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground shadow-none hover:text-foreground focus:ring-0"
        aria-label={i18n.t("common:language")}
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
