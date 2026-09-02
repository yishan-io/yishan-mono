package workspace

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace/worktree"
)

func TestCreateLocalTask_CollidingTitleResolvesNameAndBranch(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "source")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	const repoKey = "owner/local-task-title-collision"
	for _, name := range []string{"ship-release", "ship-release-2"} {
		path, err := worktree.DefaultWorktreePath(repoKey, name)
		if err != nil {
			t.Fatalf("worktree path: %v", err)
		}
		_ = os.RemoveAll(path)
		t.Cleanup(func() { _ = os.RemoveAll(path) })
	}

	linkedWorkspaceIDs := []string{}
	s := newBehaviorHandler(t, nil, "node-1", openMigratedTestDB(t))
	s.deps.LinkLocalTaskWorkspace = func(_ context.Context, _ string, workspaceID string) error {
		linkedWorkspaceIDs = append(linkedWorkspaceIDs, workspaceID)
		return nil
	}
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	createTaskWorkspace := func(id string) map[string]any {
		raw, err := json.Marshal(map[string]any{
			"id": id, "localTaskId": "task-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
			"repoKey": repoKey, "workspaceName": "ship-release", "sourcePath": sourceRepo,
			"targetBranch": "task/ship-release", "sourceBranch": "main",
		})
		if err != nil {
			t.Fatalf("marshal create: %v", err)
		}
		result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw)
		if err != nil {
			t.Fatalf("workspace create: %v", err)
		}
		accepted, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("create acceptance = %#v, want object", result)
		}
		return accepted
	}

	first := createTaskWorkspace("ws-task-title-1")
	if first["workspaceName"] != "ship-release" || first["branch"] != "task/ship-release" {
		t.Fatalf("first acceptance = %#v, want unsuffixed name and branch", first)
	}
	collectUntil(t, eventCh, "workspaceCreateCompleted", 30*time.Second)

	second := createTaskWorkspace("ws-task-title-2")
	if second["workspaceName"] != "ship-release-2" || second["branch"] != "task/ship-release-2" {
		t.Fatalf("second acceptance = %#v, want suffixed name and branch", second)
	}
	events := collectUntil(t, eventCh, "workspaceCreateCompleted", 30*time.Second)
	started := decodeCreateStartedEvent(t, findTopic(events, "workspaceCreateStarted"))
	if started.WorkspaceName != "ship-release-2" || started.Branch != "task/ship-release-2" {
		t.Fatalf("started event = %#v, want resolved name and branch", started)
	}
	if len(linkedWorkspaceIDs) != 2 || linkedWorkspaceIDs[1] != "ws-task-title-2" {
		t.Fatalf("linked workspaces = %v, want both workspace IDs", linkedWorkspaceIDs)
	}
}
