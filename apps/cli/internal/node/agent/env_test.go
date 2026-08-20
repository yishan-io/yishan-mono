package agent

import (
	"testing"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestBuildPiStartExtraEnv_InjectsNotificationSessionEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
		TabID:       "tab-2",
		WorkspaceID: "workspace-2",
		PaneID:      "pane-2",
	}, workspace.Workspace{ProjectID: "project-2", OrgID: "org-2"})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-2", "tab-2", "pane-2", homeDir)
	assertEnvValue(t, extraEnv, "YISHAN_PROJECT_ID", "project-2")
	assertEnvValue(t, extraEnv, "YISHAN_ORG_ID", "org-2")
}

func TestBuildPiStartExtraEnv_FallsBackToPaneIDFromTabID(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
		TabID:       "tab-3",
		WorkspaceID: "workspace-3",
	}, workspace.Workspace{ProjectID: "project-3", OrgID: "org-3"})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-3", "tab-3", "pane-tab-3", homeDir)
	assertEnvValue(t, extraEnv, "YISHAN_PROJECT_ID", "project-3")
	assertEnvValue(t, extraEnv, "YISHAN_ORG_ID", "org-3")
}
