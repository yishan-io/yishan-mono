package agent

import (
	"testing"

	"yishan/apps/cli/internal/rpc"
)

func TestBuildPiStartExtraEnv_InjectsNotificationSessionEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
		TabID:       "tab-2",
		WorkspaceID: "workspace-2",
		PaneID:      "pane-2",
	})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-2", "tab-2", "pane-2", homeDir)
}

func TestBuildPiStartExtraEnv_FallsBackToPaneIDFromTabID(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
		TabID:       "tab-3",
		WorkspaceID: "workspace-3",
	})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-3", "tab-3", "pane-tab-3", homeDir)
}
