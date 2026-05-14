import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

// Single shared namespace list — keep in sync with the JSON locale files.
// Splitting by domain keeps `t()` calls readable and lets us lazy-load later.
export const NAMESPACES = [
  "common",
  "nav",
  "adapters",
  "workflow",
  "projects",
  "templates",
  "errors",
] as const;

export const SUPPORTED_LANGS = ["en", "zh-CN"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en,
      "zh-CN": zhCN,
    },
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGS],
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "petrify.lang",
    },
  });

export default i18n;
