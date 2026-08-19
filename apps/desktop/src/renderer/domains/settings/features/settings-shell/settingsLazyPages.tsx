import { lazy } from "react";

/**
 * Settings lazy page registrations (desktop8 Phase 33: split from
 * SettingsView.tsx).
 */

export const AccountSettingsView = lazy(() =>
  import("../account/AccountSettingsView").then((m) => ({ default: m.AccountSettingsView })),
);
export const MemberSettingsView = lazy(() =>
  import("@renderer/domains/organization").then((m) => ({ default: m.MemberSettingsView })),
);
export const ServiceTokenSettingsView = lazy(() =>
  import("../account/ServiceTokenSettingsView").then((m) => ({ default: m.ServiceTokenSettingsView })),
);
export const ComputerUseSettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.ComputerUseSettingsView })),
);
export const DaemonSettingsView = lazy(() =>
  import("../daemon/DaemonSettingsView").then((m) => ({ default: m.DaemonSettingsView })),
);
export const EditorSettingsView = lazy(() =>
  import("../editor/EditorSettingsView").then((m) => ({ default: m.EditorSettingsView })),
);
export const KeybindingsSettingsView = lazy(() =>
  import("../keybindings/KeybindingsSettingsView").then((m) => ({ default: m.KeybindingsSettingsView })),
);
export const LanguageSettingsView = lazy(() =>
  import("../language/LanguageSettingsView").then((m) => ({ default: m.LanguageSettingsView })),
);
export const LinkSettingsView = lazy(() =>
  import("../link/LinkSettingsView").then((m) => ({ default: m.LinkSettingsView })),
);
export const MarkdownSettingsView = lazy(() =>
  import("../markdown/MarkdownSettingsView").then((m) => ({ default: m.MarkdownSettingsView })),
);
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
export const CLISettingsView = lazy(() =>
  import("../cli/CLISettingsView").then((m) => ({ default: m.CLISettingsView })),
);
export const CustomizeSettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.CustomizeSettingsView })),
);
export const MemorySettingsView = lazy(() =>
  import("@renderer/domains/agent").then((m) => ({ default: m.MemorySettingsView })),
);
