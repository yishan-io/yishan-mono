package application

import (
	"context"
	"strings"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

// fakeEnvironment implements Environment for prepare tests.
type fakeEnvironment struct {
	apiConfigured bool
	projects      []Project
	workspaces    []workspace.Record
	nodes         []Node
	clonePath     string
}

func (f *fakeEnvironment) APIConfigured() bool { return f.apiConfigured }

func (f *fakeEnvironment) ListProjects(_ context.Context, _ string) ([]Project, error) {
	return f.projects, nil
}

func (f *fakeEnvironment) ListWorkspaces(_ context.Context, _ string, _ string) ([]workspace.Record, error) {
	return f.workspaces, nil
}

func (f *fakeEnvironment) ListNodes(_ context.Context, _ string) ([]Node, error) {
	return f.nodes, nil
}

func (f *fakeEnvironment) EnsureSharedRepoClone(_ context.Context, _ string, _ string) (string, error) {
	return f.clonePath, nil
}

func newPrepareTestService(env Environment) *Service {
	if env == nil {
		env = &fakeEnvironment{}
	}
	return New(Dependencies{NodeID: "node-local", Environment: env})
}

func TestPrepare_ValidatesAndDefaultsTaskRunAgentKind(t *testing.T) {
	testCases := []struct {
		name          string
		agentKind     string
		wantAgentKind string
		wantErr       string
	}{
		{name: "defaults omitted kind to pi", wantAgentKind: "pi"},
		{name: "trims Pi kind", agentKind: " pi ", wantAgentKind: "pi"},
		{name: "rejects Pi subagent definition", agentKind: "builder", wantErr: "unsupported task-run agent kind \"builder\""},
		{name: "rejects other agent CLI", agentKind: "opencode", wantErr: "unsupported task-run agent kind \"opencode\""},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			service := newPrepareTestService(nil)
			plan, err := service.prepare(context.Background(), CreateCommand{
				OrganizationID: "org-1",
				ProjectID:      "proj-1",
				SourcePath:     "/tmp/primary-repo",
				RepoKey:        "acme/repo",
				TargetBranch:   "feature/test",
				SourceBranch:   "main",
				TaskRun:        &workspace.TaskRunConfig{AgentKind: testCase.agentKind},
			})
			if testCase.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), testCase.wantErr) {
					t.Fatalf("err = %v, want error containing %q", err, testCase.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("prepare: %v", err)
			}
			if plan.LocalCreate == nil || plan.LocalCreate.TaskRun == nil {
				t.Fatal("local task run = nil, want config")
			}
			if plan.LocalCreate.TaskRun.AgentKind != testCase.wantAgentKind {
				t.Fatalf("AgentKind = %q, want %q", plan.LocalCreate.TaskRun.AgentKind, testCase.wantAgentKind)
			}
		})
	}
}

func TestPrepare_RejectsPrimaryWorkspaceCreate(t *testing.T) {
	service := newPrepareTestService(nil)
	_, err := service.prepare(context.Background(), CreateCommand{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           string(workspace.KindPrimary),
	})
	want := "workspace create only supports worktree workspaces; create a new project to create a primary workspace"
	if err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
}

func TestPrepare_WorktreeCreateUsesPrimaryWorkspacePath(t *testing.T) {
	env := &fakeEnvironment{
		apiConfigured: true,
		projects: []Project{{
			ID: "proj-1", RepoKey: "acme/repo", RepoURL: "https://example.com/repo.git",
			SetupScript: "npm install", ContextEnabled: true,
		}},
		workspaces: []workspace.Record{{
			ID: "ws-primary", ProjectID: "proj-1", NodeID: "node-local",
			Kind: workspace.KindPrimary, LocalPath: "/tmp/primary-repo",
		}},
	}
	service := newPrepareTestService(env)
	plan, err := service.prepare(context.Background(), CreateCommand{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           string(workspace.KindWorktree),
		Branch:         "feature/test",
		SourceBranch:   "main",
	})
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if plan.LocalCreate == nil {
		t.Fatal("localCreate = nil, want local worktree plan")
	}
	if plan.RemoteRequest != nil {
		t.Fatalf("remoteRequest = %#v, want nil", plan.RemoteRequest)
	}
	if plan.LocalCreate.SourcePath != "/tmp/primary-repo" {
		t.Fatalf("SourcePath = %q, want %q", plan.LocalCreate.SourcePath, "/tmp/primary-repo")
	}
	if plan.LocalCreate.RepoKey != "acme/repo" {
		t.Fatalf("RepoKey = %q, want %q", plan.LocalCreate.RepoKey, "acme/repo")
	}
	if plan.LocalCreate.SetupHook != "npm install" {
		t.Fatalf("SetupHook = %q, want %q", plan.LocalCreate.SetupHook, "npm install")
	}
}

func TestPrepare_WorktreeCreateRemoteNodeReturnsRelayRequest(t *testing.T) {
	env := &fakeEnvironment{
		apiConfigured: true,
		nodes:         []Node{{ID: "node-remote"}},
	}
	service := newPrepareTestService(env)
	plan, err := service.prepare(context.Background(), CreateCommand{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           string(workspace.KindWorktree),
		Branch:         "feature/test",
		SourceBranch:   "main",
		NodeID:         "node-remote",
	})
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if plan.RemoteRequest == nil {
		t.Fatal("remoteRequest = nil, want remote relay plan")
	}
	if plan.LocalCreate != nil {
		t.Fatalf("localCreate = %#v, want nil", plan.LocalCreate)
	}
	if plan.RemoteRequest.NodeID != "node-remote" {
		t.Fatalf("NodeID = %q, want %q", plan.RemoteRequest.NodeID, "node-remote")
	}
	if plan.RemoteRequest.ReplyNodeID != "node-local" {
		t.Fatalf("ReplyNodeID = %q, want %q", plan.RemoteRequest.ReplyNodeID, "node-local")
	}
}

func TestPrepare_DirectCreateSetsRegistrationWithFallbackNodeID(t *testing.T) {
	service := newPrepareTestService(nil)
	plan, err := service.prepare(context.Background(), CreateCommand{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		// direct path: sourcePath + repoKey + targetBranch all present
		SourcePath:   "/tmp/primary-repo",
		RepoKey:      "acme/repo",
		TargetBranch: "feature/test",
		SourceBranch: "main",
		// nodeId intentionally omitted — the service fills in its own nodeID
	})
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if plan.LocalCreate == nil {
		t.Fatal("localCreate = nil, want direct local plan")
	}
	if plan.Registration == nil {
		t.Fatal("registration = nil, want API registration to be set for direct create path")
	}
	if plan.Registration.NodeID != "node-local" {
		t.Fatalf("registration.NodeID = %q, want %q", plan.Registration.NodeID, "node-local")
	}
	if plan.Registration.OrganizationID != "org-1" {
		t.Fatalf("registration.OrganizationID = %q, want %q", plan.Registration.OrganizationID, "org-1")
	}
	if plan.Registration.Branch != "feature/test" {
		t.Fatalf("registration.Branch = %q, want %q", plan.Registration.Branch, "feature/test")
	}
}

func TestPrepare_DirectCreateSkipsRegistrationWhenOrgMissing(t *testing.T) {
	service := newPrepareTestService(nil)
	plan, err := service.prepare(context.Background(), CreateCommand{
		// no organizationId — registration should be nil (offline/unauthenticated use)
		SourcePath:   "/tmp/primary-repo",
		RepoKey:      "acme/repo",
		TargetBranch: "feature/test",
		SourceBranch: "main",
	})
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if plan.LocalCreate == nil {
		t.Fatal("localCreate = nil")
	}
	if plan.Registration != nil {
		t.Fatalf("registration = %#v, want nil when org is missing", plan.Registration)
	}
}
