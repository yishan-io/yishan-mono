import type { TFunction } from "i18next";
import { PROJECT_COLOR_PRESETS } from "@renderer/components/projectIcons";

export type ProjectConfigSectionId = "general" | "scripts" | "commands";

export const PROJECT_CONFIG_ICON_BG_COLOR_PRESETS = PROJECT_COLOR_PRESETS;

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
