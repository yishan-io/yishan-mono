import { Check, X } from "@tamagui/lucide-icons";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Input, Paragraph, Text, XStack, useTheme } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceListHierarchyMode } from "@/features/shell/state/shell-workspace-tree";

type WorkspaceTreeFilterSheetProps = {
  displayProjectIds: string[];
  onClose: () => void;
  onSelectAllProjects: () => void;
  onSetHierarchyMode: (mode: WorkspaceListHierarchyMode) => void;
  onSetProjectQuickSearch: (value: string) => void;
  onToggleProjectId: (projectId: string) => void;
  open: boolean;
  projectQuickSearch: string;
  projects: ProjectWithWorkspaces[];
  workspaceListHierarchyMode: WorkspaceListHierarchyMode;
};

// Owns only filter-sheet presentation; hierarchy/search state stays in the filter model.
export function WorkspaceTreeFilterSheet({
  displayProjectIds,
  onClose,
  onSelectAllProjects,
  onSetHierarchyMode,
  onSetProjectQuickSearch,
  onToggleProjectId,
  open,
  projectQuickSearch,
  projects,
  workspaceListHierarchyMode,
}: WorkspaceTreeFilterSheetProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  return (
    <AppModalSheet
      contentStyle={{
        borderColor: theme.borderColor.val,
        borderRadius: 20,
        borderWidth: 1,
        gap: 12,
        maxHeight: 460,
        padding: 16,
      }}
      onClose={onClose}
      open={open}
      position="center"
      headerRight={
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={{ padding: 4 }}>
          <X color="$gray11" size={18} />
        </Pressable>
      }
    >
      <Text fontSize="$5" fontWeight="600">
        {t("shell.workspaceTreeFilterTitle")}
      </Text>

      <View style={{ gap: 8 }}>
        <Text color="$gray11" fontSize="$2" fontWeight="600">
          {t("shell.workspaceTreeHierarchySection")}
        </Text>
        <XStack
          style={{
            backgroundColor: theme.background.val,
            borderColor: theme.green10.val,
            borderRadius: 10,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          <HierarchyModeButton
            active={workspaceListHierarchyMode === "by_project"}
            label={t("shell.workspaceTreeHierarchyByProject")}
            onPress={() => onSetHierarchyMode("by_project")}
          />
          <HierarchyModeButton
            active={workspaceListHierarchyMode === "by_node"}
            label={t("shell.workspaceTreeHierarchyByNode")}
            onPress={() => onSetHierarchyMode("by_node")}
          />
        </XStack>
      </View>

      <View style={{ gap: 8 }}>
        <XStack style={{ alignItems: "center", justifyContent: "space-between" }}>
          <Text color="$gray11" fontSize="$2" fontWeight="600">
            {t("shell.workspaceTreeProjectSection")}
          </Text>
          <Button chromeless onPress={onSelectAllProjects} size="$3">
            <Text color="$green10" fontSize="$3" fontWeight="600">
              {t("shell.workspaceTreeSelectAll")}
            </Text>
          </Button>
        </XStack>

        <Input
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onSetProjectQuickSearch}
          placeholder={t("shell.workspaceTreeSearchPlaceholder")}
          size="$3"
          style={{
            backgroundColor: theme.background.val,
            borderColor: theme.gray7.val,
            color: theme.color.val,
            minHeight: 36,
          }}
          value={projectQuickSearch}
        />

        <ScrollView style={{ maxHeight: 220 }}>
          <View style={{ gap: 6 }}>
            {projects.length === 0 ? (
              <Paragraph>{t("shell.noProjectsYet")}</Paragraph>
            ) : (
              projects.map((project) => {
                const checked = displayProjectIds.includes(project.id);
                const isLastSelected = checked && displayProjectIds.length === 1;

                return (
                  <Pressable
                    key={project.id}
                    accessibilityRole="button"
                    disabled={isLastSelected}
                    onPress={() => {
                      if (isLastSelected) {
                        return;
                      }

                      onToggleProjectId(project.id);
                    }}
                    style={({ pressed }) => ({
                      opacity: isLastSelected ? 0.45 : pressed ? 0.72 : 1,
                    })}
                  >
                    <XStack
                      style={{
                        alignItems: "center",
                        borderRadius: 8,
                        gap: 10,
                        minHeight: 34,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <View
                        style={{
                          alignItems: "center",
                          backgroundColor: checked ? theme.green9.val : theme.gray4.val,
                          borderColor: checked ? theme.green9.val : theme.gray7.val,
                          borderRadius: 4,
                          borderWidth: 1,
                          height: 18,
                          justifyContent: "center",
                          width: 18,
                        }}
                      >
                        {checked ? <Check color="$gray1" size={12} strokeWidth={3} /> : null}
                      </View>
                      <Text fontSize="$4" fontWeight="500">
                        {project.name}
                      </Text>
                    </XStack>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </AppModalSheet>
  );
}

function HierarchyModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.green10.val : "transparent",
        borderRightColor: theme.borderColor.val,
        borderRightWidth: 1,
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        fontSize="$3"
        fontWeight="600"
        style={{ color: active ? theme.gray2.val : theme.green10.val, textAlign: "center" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
