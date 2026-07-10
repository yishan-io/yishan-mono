import { EmptyState } from "@/components/ui/EmptyState";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

/** Renders a stable empty state when relay-backed preview context is incomplete. */
export function WorkspacePreviewMissingContext() {
  const { t } = useAppLanguage();

  return (
    <EmptyState
      title={t("shell.workspacePreviewMissingContextTitle")}
      message={t("shell.workspacePreviewMissingContextMessage")}
    />
  );
}
