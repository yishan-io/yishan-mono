import type { TFunction } from "i18next";

export type ProjectConfigSectionId = "general" | "scripts" | "commands";

export const PROJECT_CONFIG_ICON_BG_COLOR_PRESETS = [
  "#1E66F5",
  "#0F766E",
  "#CA8A04",
  "#DC2626",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
];

export function getProjectConfigSectionItems(t: TFunction) {
  return [
    {
      id: "general" as const,
      label: t("project.config.sections.general", { defaultValue: "General" }),
    },
    {
      id: "scripts" as const,
      label: t("project.config.sections.scripts", { defaultValue: "Scripts" }),
    },
    {
      id: "commands" as const,
      label: t("project.config.sections.quickCommands", { defaultValue: "Quick commands" }),
    },
  ];
}
