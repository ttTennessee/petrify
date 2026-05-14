// Type augmentation for react-i18next. Once the locale JSONs are filled with
// real keys, `t()` calls will get autocomplete and compile-time checks.
//
// Resources currently point at en.json — keep en as the source of truth and
// other locales follow its shape.
import "react-i18next";
import type en from "./locales/en.json";

declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof en;
  }
}
