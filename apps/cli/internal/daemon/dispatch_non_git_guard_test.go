package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

// newNonGitGuardTestHandler builds a handler whose local database holds a
// non-git project ("project-unknown", sourceType "unknown") and a git project
// ("project-git"), with one opened workspace per project.
func newNonGitGuardTestHandler(t *testing.T) (*JSONRPCHandler, string) {
	t.Helper()
	root := t.TempDir()
	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	t.Cleanup(handler.Shutdown)

	database, err := localdb.Open(filepath.Join(root, "db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.SetLocalDatabase(database)

	projectStore := localdb.NewProjectStore(database)
	unknownRepoKey := "owner/plain-folder"
	gitRepoKey := "owner/git-repo"
	if err := projectStore.Create(context.Background(), &localdb.Project{
		ID: "project-unknown", Name: "Plain Folder", OrganizationID: "org-1",
		SourceType: "unknown", RepoKey: &unknownRepoKey, ContextEnabled: true,
	}); err != nil {
		t.Fatalf("create non-git project: %v", err)
	}
	if err := projectStore.Create(context.Background(), &localdb.Project{
		ID: "project-git", Name: "Git Repo", OrganizationID: "org-1",
		SourceType: "git", RepoKey: &gitRepoKey, ContextEnabled: true,
	}); err != nil {
		t.Fatalf("create git project: %v", err)
	}

	plainFolder := t.TempDir()
	if _, err := manager.Open(workspace.OpenRequest{
		ID: "workspace-unknown", Path: plainFolder, ProjectID: "project-unknown", OrgID: "org-1",
	}); err != nil {
		t.Fatalf("open non-git workspace: %v", err)
	}
	gitFolder := t.TempDir()
	if _, err := exec.Command("git", "init", gitFolder).CombinedOutput(); err != nil {
		t.Skipf("git binary unavailable: %v", err)
	}
	if _, err := manager.Open(workspace.OpenRequest{
		ID: "workspace-git", Path: gitFolder, ProjectID: "project-git", OrgID: "org-1",
	}); err != nil {
		t.Fatalf("open git workspace: %v", err)
	}

	return handler, plainFolder
}

func marshalParams(t *testing.T, input map[string]any) json.RawMessage {
	t.Helper()
	params, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return params
}

func requireRPCError(t *testing.T, err error, messagePart string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected RPC error containing %q, got nil", messagePart)
	}
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected typed RPC error, got %T: %v", err, err)
	}
	if rpcErr.Code != rpcCodeInvalidParams {
		t.Fatalf("expected invalid-params code %d, got %d", rpcCodeInvalidParams, rpcErr.Code)
	}
	if rpcErr.Message != messagePart {
		t.Fatalf("expected message %q, got %q", messagePart, rpcErr.Message)
	}
}

func TestDispatchGit_RejectsGitMethodsForNonGitWorkspace(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	cases := []string{MethodGitStatus, MethodGitListChanges, MethodGitWorktreeCreate, MethodGitCommit, MethodGitPush}
	for _, method := range cases {
		t.Run(method, func(t *testing.T) {
			_, err := handler.dispatchGit(
				context.Background(),
				method,
				marshalParams(t, map[string]any{"workspaceId": "workspace-unknown"}),
			)
			requireRPCError(t, err, "project is not a git repository — git operations are unavailable")
		})
	}
}

func TestDispatchGit_AllowsGitMethodsForGitWorkspace(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	// git.status on a non-git DIRECTORY workspace is fine for the guard to
	// pass; the actual git exec failure (if any) is not the guard's concern.
	_, err := handler.dispatchGit(
		context.Background(),
		MethodGitStatus,
		marshalParams(t, map[string]any{"workspaceId": "workspace-git"}),
	)
	if err != nil {
		// Guard must pass; a git exec error for a non-repo folder would be
		// returned by the workspace layer, never the capability guard.
		t.Fatalf("git guard unexpectedly rejected git workspace: %v", err)
	}
}

func TestDispatchGit_InspectPathStillClassifiesPlainFolder(t *testing.T) {
	handler, plainFolder := newNonGitGuardTestHandler(t)

	result, err := handler.dispatchGit(
		context.Background(),
		MethodGitInspectPath,
		marshalParams(t, map[string]any{"path": plainFolder}),
	)
	if err != nil {
		t.Fatalf("git.inspectPath must not be gated: %v", err)
	}
	inspection, ok := result.(workspace.GitInspectResult)
	if !ok {
		t.Fatalf("expected GitInspectResult, got %T", result)
	}
	if inspection.IsGitRepository {
		t.Fatalf("expected plain folder to inspect as non-git")
	}
}

func TestDispatchGit_RejectsUnknownWorkspaceID(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	_, err := handler.dispatchGit(
		context.Background(),
		MethodGitStatus,
		marshalParams(t, map[string]any{"workspaceId": "workspace-missing"}),
	)
	if err == nil {
		t.Fatalf("expected workspace-not-found error for unknown workspace")
	}
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected typed RPC error, got %T: %v", err, err)
	}
	if rpcErr.Message != "workspace not found" {
		t.Fatalf("expected workspace-not-found message, got %q", rpcErr.Message)
	}
}

func TestHandleWorkspaceCreate_RejectsRepoKeyForNonGitProject(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	_, err := handler.handleWorkspaceCreate(
		context.Background(),
		marshalParams(t, map[string]any{
			"repoKey":        "owner/plain-folder",
			"sourcePath":     t.TempDir(),
			"targetBranch":   "feature-x",
			"sourceBranch":   "main",
			"organizationId": "org-1",
		}),
	)
	requireRPCError(t, err, "cannot create a workspace for a non-git project")
}

func TestHandleWorkspaceCreate_RejectsProjectIDForNonGitProject(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	_, err := handler.handleWorkspaceCreate(
		context.Background(),
		marshalParams(t, map[string]any{
			"projectId":      "project-unknown",
			"sourcePath":     t.TempDir(),
			"targetBranch":   "feature-x",
			"sourceBranch":   "main",
			"organizationId": "org-1",
			"nodeId":         "node-1",
		}),
	)
	requireRPCError(t, err, "cannot create a workspace for a non-git project")
}

func TestHandleWorkspaceCreate_RejectsUnresolvableProject(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	_, err := handler.handleWorkspaceCreate(
		context.Background(),
		marshalParams(t, map[string]any{
			"projectId":      "project-missing",
			"sourcePath":     t.TempDir(),
			"targetBranch":   "feature-x",
			"sourceBranch":   "main",
			"organizationId": "org-1",
			"nodeId":         "node-1",
		}),
	)
	requireRPCError(t, err, "cannot create a workspace for a non-git project")
}

func TestHandleWorkspaceCreate_AllowsGitProject(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	result, err := handler.handleWorkspaceCreate(
		context.Background(),
		marshalParams(t, map[string]any{
			"repoKey":        "owner/git-repo",
			"sourcePath":     t.TempDir(),
			"targetBranch":   "feature-x",
			"sourceBranch":   "main",
			"organizationId": "org-1",
			"nodeId":         "node-1",
		}),
	)
	if err != nil {
		t.Fatalf("git project workspace.create unexpectedly rejected: %v", err)
	}
	record, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if record["status"] != "pending" {
		t.Fatalf("expected pending status, got %v", record["status"])
	}
}

func TestHandleProjectCreate_CreatesPrimaryWorkspaceForLocalFolder(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	result, err := handler.dispatchProject(
		context.Background(),
		MethodProjectCreate,
		marshalParams(t, map[string]any{
			"name":           "Plain Folder",
			"organizationId": "org-1",
			"sourceType":     "unknown",
			"nodeId":         "node-1",
			"localPath":      "/tmp/plain-folder",
		}),
	)
	if err != nil {
		t.Fatalf("project.create: %v", err)
	}
	parsed := parseCreatedProject(t, result)
	if len(parsed.Workspaces) != 1 {
		t.Fatalf("expected 1 primary workspace, got %+v", parsed.Workspaces)
	}
	workspace := parsed.Workspaces[0]
	if workspace.Kind != "primary" {
		t.Fatalf("expected primary workspace, got %q", workspace.Kind)
	}
	if workspace.LocalPath != "/tmp/plain-folder" || workspace.NodeID != "node-1" {
		t.Fatalf("unexpected workspace: %+v", workspace)
	}
	if workspace.Branch != nil {
		t.Fatalf("expected nil branch for non-git workspace, got %v", *workspace.Branch)
	}

	// The row must be persisted so snapshot reloads (project.listWithWorkspaces)
	// and daemon restarts keep the workspace visible.
	storedWorkspaces, err := localdb.NewWorkspaceStore(handler.localDatabase).ListByProject(context.Background(), parsed.ID)
	if err != nil {
		t.Fatalf("list persisted workspaces: %v", err)
	}
	if len(storedWorkspaces) != 1 || storedWorkspaces[0].Kind != "primary" {
		t.Fatalf("expected persisted primary workspace, got %+v", storedWorkspaces)
	}
}

func TestHandleProjectCreate_HonorsExplicitContextDisabled(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	contextEnabled := false
	result, err := handler.dispatchProject(
		context.Background(),
		MethodProjectCreate,
		marshalParams(t, map[string]any{
			"name":           "Plain Folder",
			"organizationId": "org-1",
			"sourceType":     "unknown",
			"contextEnabled": contextEnabled,
		}),
	)
	if err != nil {
		t.Fatalf("project.create: %v", err)
	}
	parsed := parseCreatedProject(t, result)
	if parsed.ContextEnabled {
		t.Fatalf("expected context disabled, got %+v", parsed)
	}
}

func TestHandleProjectCreate_SkipsWorkspaceWithoutLocalPath(t *testing.T) {
	handler, _ := newNonGitGuardTestHandler(t)

	result, err := handler.dispatchProject(
		context.Background(),
		MethodProjectCreate,
		marshalParams(t, map[string]any{
			"name":           "Remote Repo",
			"organizationId": "org-1",
			"sourceType":     "git",
			"repoUrl":        "https://github.com/acme/repo.git",
		}),
	)
	if err != nil {
		t.Fatalf("project.create: %v", err)
	}
	parsed := parseCreatedProject(t, result)
	if len(parsed.Workspaces) != 0 {
		t.Fatalf("expected no workspaces for remote-only create, got %+v", parsed.Workspaces)
	}
}

// parseCreatedProject unmarshals the project.create response, whose result
// type is a package-private named struct, through JSON.
func parseCreatedProject(t *testing.T, result any) struct {
	ID             string              `json:"id"`
	ContextEnabled bool                `json:"contextEnabled"`
	Workspaces     []localdb.Workspace `json:"workspaces"`
} {
	t.Helper()
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal create result: %v", err)
	}
	var parsed struct {
		ID             string              `json:"id"`
		ContextEnabled bool                `json:"contextEnabled"`
		Workspaces     []localdb.Workspace `json:"workspaces"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal create result: %v", err)
	}
	return parsed
}
