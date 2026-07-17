// @vitest-environment jsdom

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { I18N_LANGUAGE_STORAGE_KEY, i18n, resources, setAppLanguage } from "./i18n";

const localeModulePaths = import.meta.glob("./locales/*/*.json");
const LANGUAGE_CODES = Object.keys(resources) as Array<keyof typeof resources>;
const EXPECTED_NAMESPACES = Object.keys(resources.en);
const EXPECTED_FALLBACK_NAMESPACES = EXPECTED_NAMESPACES.filter((namespace) => namespace !== "common");

function resolveNamespacesForLanguage(languageCode: keyof typeof resources): string[] {
  const localePathPrefix = `./locales/${languageCode}/`;
  return Object.keys(localeModulePaths)
    .filter((path) => path.startsWith(localePathPrefix))
    .map((path) => path.slice(localePathPrefix.length, -".json".length))
    .sort();
}

describe("i18n", () => {
  beforeEach(async () => {
    window.localStorage.removeItem(I18N_LANGUAGE_STORAGE_KEY);
    await i18n.changeLanguage("en");
  });

  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("registers every locale file as its own namespace for both languages", () => {
    expect(i18n.options.ns).toEqual(EXPECTED_NAMESPACES);
    expect(i18n.options.fallbackNS).toEqual(EXPECTED_FALLBACK_NAMESPACES);

    for (const languageCode of LANGUAGE_CODES) {
      expect([...EXPECTED_NAMESPACES].sort()).toEqual(resolveNamespacesForLanguage(languageCode));

      for (const namespace of EXPECTED_NAMESPACES) {
        expect(i18n.hasResourceBundle(languageCode, namespace)).toBe(true);

        const resourceBundle = i18n.getResourceBundle(languageCode, namespace) as Record<string, unknown>;
        expect(resourceBundle).toHaveProperty(namespace);
      }
    }
  });

  it("resolves common and domain-prefixed keys in English without call-site changes", async () => {
    await i18n.changeLanguage("en");

    expect(i18n.t("common.actions.cancel")).toBe(resources.en.common.common.actions.cancel);
    expect(i18n.t("settings.title")).toBe(resources.en.settings.settings.title);
    expect(i18n.t("workspace.actions.create")).toBe(resources.en.workspace.workspace.actions.create);
  });

  it("resolves common and domain-prefixed keys in Chinese without call-site changes", async () => {
    await setAppLanguage("zh");

    expect(i18n.t("common.actions.cancel")).toBe(resources.zh.common.common.actions.cancel);
    expect(i18n.t("settings.title")).toBe(resources.zh.settings.settings.title);
    expect(i18n.t("workspace.actions.create")).toBe(resources.zh.workspace.workspace.actions.create);
    expect(window.localStorage.getItem(I18N_LANGUAGE_STORAGE_KEY)).toBe("zh");
  });
});
