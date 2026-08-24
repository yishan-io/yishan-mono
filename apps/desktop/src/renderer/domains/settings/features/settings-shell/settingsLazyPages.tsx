import { lazy } from "react";

/**
 * Settings page registrations.
 *
 * Views with no cross-domain reach and no module-level side effects are
 * imported eagerly. The rest must stay lazy for one of two reasons:
 *
 * - Cross-domain views (agent / workspace / terminal / notification / node /
 *   organization): their domain indexes import the settings index back
 *   (agent chat uses keybindingSettingsStore, files editors use
 *   editorSettingsStore / useCodeTheme), so an eager settings→domain edge
 *   closes the eval-time cycle and breaks ~30 tests (TDZ / i18n-mock
 *   ordering errors).
 * - DaemonSettingsView imports the workbench index (useDialogRegistration);
 *   workbench eagerly imports the files index (tabCommands), and files views
 *   value-import the settings index — eager loading it closes
 *   settings→workbench→files→settings.
 *
 * LanguageSettingsView used to force laziness too: it imports `../../../../i18n`,
 * whose module scope ran `i18n.init()` — that side effect moved to
 * RendererApplication's explicit initI18n(), so the view is now safe to import
 * eagerly.
 */

export { AccountSettingsView } from "../account/AccountSettingsView";
export { AgentChatWidthSettingsView } from "../agent-chat-width/AgentChatWidthSettingsView";
export const MemberSettingsView = lazy(() =>
  import("@renderer/domains/organization").then((m) => ({ default: m.MemberSettingsView })),
);
export { ServiceTokenSettingsView } from "../account/ServiceTokenSettingsView";
export const ComputerUseSettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.ComputerUseSettingsView })),
);
export const DaemonSettingsView = lazy(() =>
  import("../daemon/DaemonSettingsView").then((m) => ({ default: m.DaemonSettingsView })),
);
export { EditorSettingsView } from "../editor/EditorSettingsView";
export { KeybindingsSettingsView } from "../keybindings/KeybindingsSettingsView";
export { LanguageSettingsView } from "../language/LanguageSettingsView";
export { LinkSettingsView } from "../link/LinkSettingsView";
export const LocalTaskTagsSettingsView = lazy(() =>
  import("@renderer/domains/local-task").then((m) => ({ default: m.LocalTaskTagsSettingsView })),
);
export { MarkdownSettingsView } from "../markdown/MarkdownSettingsView";
export const NodesSettingsView = lazy(() =>
  import("@renderer/domains/node").then((m) => ({ default: m.NodesSettingsView })),
);
export const NotificationSettingsView = lazy(() =>
  import("@renderer/domains/notification").then((m) => ({ default: m.NotificationSettingsView })),
);
export const TerminalSettingsView = lazy(() =>
  import("@renderer/domains/terminal").then((m) => ({ default: m.TerminalSettingsView })),
);
export const WorkspaceSettingsView = lazy(() =>
  import("@renderer/domains/workspace").then((m) => ({ default: m.WorkspaceSettingsView })),
);

export const AgentProviderSettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.AgentProviderSettingsView })),
);
export { CLISettingsView } from "../cli/CLISettingsView";
export const CustomizeSettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.CustomizeSettingsView })),
);
export const MemorySettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.MemorySettingsView })),
);
