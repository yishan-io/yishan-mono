import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enAgentChat from "./locales/en/agentChat.json";
import enApp from "./locales/en/app.json";
import enAuth from "./locales/en/auth.json";
import enChat from "./locales/en/chat.json";
import enCommon from "./locales/en/common.json";
import enComposer from "./locales/en/composer.json";
import enDaemon from "./locales/en/daemon.json";
import enFiles from "./locales/en/files.json";
import enKeybindings from "./locales/en/keybindings.json";
import enLaunch from "./locales/en/launch.json";
import enLayout from "./locales/en/layout.json";
import enNativeMenu from "./locales/en/nativeMenu.json";
import enOnboarding from "./locales/en/onboarding.json";
import enOrg from "./locales/en/org.json";
import enOverview from "./locales/en/overview.json";
import enProject from "./locales/en/project.json";
import enRepo from "./locales/en/repo.json";
import enRouting from "./locales/en/routing.json";
import enScheduledJob from "./locales/en/scheduledJob.json";
import enSettings from "./locales/en/settings.json";
import enTabs from "./locales/en/tabs.json";
import enTerminal from "./locales/en/terminal.json";
import enWorkspace from "./locales/en/workspace.json";
import zhAgentChat from "./locales/zh/agentChat.json";
import zhApp from "./locales/zh/app.json";
import zhAuth from "./locales/zh/auth.json";
import zhChat from "./locales/zh/chat.json";
import zhCommon from "./locales/zh/common.json";
import zhComposer from "./locales/zh/composer.json";
import zhDaemon from "./locales/zh/daemon.json";
import zhFiles from "./locales/zh/files.json";
import zhKeybindings from "./locales/zh/keybindings.json";
import zhLaunch from "./locales/zh/launch.json";
import zhLayout from "./locales/zh/layout.json";
import zhNativeMenu from "./locales/zh/nativeMenu.json";
import zhOnboarding from "./locales/zh/onboarding.json";
import zhOrg from "./locales/zh/org.json";
import zhOverview from "./locales/zh/overview.json";
import zhProject from "./locales/zh/project.json";
import zhRepo from "./locales/zh/repo.json";
import zhRouting from "./locales/zh/routing.json";
import zhScheduledJob from "./locales/zh/scheduledJob.json";
import zhSettings from "./locales/zh/settings.json";
import zhTabs from "./locales/zh/tabs.json";
import zhTerminal from "./locales/zh/terminal.json";
import zhWorkspace from "./locales/zh/workspace.json";

export const SUPPORTED_LANGUAGE_CODES = ["en", "zh"] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];
export const I18N_LANGUAGE_STORAGE_KEY = "yishan-language";

function resolveStoredLanguage(): SupportedLanguageCode {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(I18N_LANGUAGE_STORAGE_KEY)?.trim().toLowerCase();
  if (!stored) {
    return "en";
  }

  if (stored.startsWith("zh")) {
    return "zh";
  }
  const base = stored.split(/[-_]/)[0];
  return SUPPORTED_LANGUAGE_CODES.includes(base as SupportedLanguageCode) ? (base as SupportedLanguageCode) : "en";
}

const I18N_NAMESPACES = [
  "agentChat",
  "app",
  "auth",
  "chat",
  "common",
  "composer",
  "daemon",
  "files",
  "keybindings",
  "launch",
  "layout",
  "nativeMenu",
  "onboarding",
  "org",
  "overview",
  "project",
  "repo",
  "routing",
  "scheduledJob",
  "settings",
  "tabs",
  "terminal",
  "workspace",
] as const;

const I18N_FALLBACK_NAMESPACES = I18N_NAMESPACES.filter((namespace) => namespace !== "common");

export const resources = {
  en: {
    agentChat: enAgentChat,
    app: enApp,
    auth: enAuth,
    chat: enChat,
    common: enCommon,
    composer: enComposer,
    daemon: enDaemon,
    files: enFiles,
    keybindings: enKeybindings,
    launch: enLaunch,
    layout: enLayout,
    nativeMenu: enNativeMenu,
    onboarding: enOnboarding,
    org: enOrg,
    overview: enOverview,
    project: enProject,
    repo: enRepo,
    routing: enRouting,
    scheduledJob: enScheduledJob,
    settings: enSettings,
    tabs: enTabs,
    terminal: enTerminal,
    workspace: enWorkspace,
  },
  zh: {
    agentChat: zhAgentChat,
    app: zhApp,
    auth: zhAuth,
    chat: zhChat,
    common: zhCommon,
    composer: zhComposer,
    daemon: zhDaemon,
    files: zhFiles,
    keybindings: zhKeybindings,
    launch: zhLaunch,
    layout: zhLayout,
    nativeMenu: zhNativeMenu,
    onboarding: zhOnboarding,
    org: zhOrg,
    overview: zhOverview,
    project: zhProject,
    repo: zhRepo,
    routing: zhRouting,
    scheduledJob: zhScheduledJob,
    settings: zhSettings,
    tabs: zhTabs,
    terminal: zhTerminal,
    workspace: zhWorkspace,
  },
} as const;

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  defaultNS: "common",
  ns: [...I18N_NAMESPACES],
  fallbackNS: [...I18N_FALLBACK_NAMESPACES],
  lng: resolveStoredLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export async function setAppLanguage(languageCode: SupportedLanguageCode): Promise<void> {
  await i18n.changeLanguage(languageCode);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(I18N_LANGUAGE_STORAGE_KEY, languageCode);
  }
}
