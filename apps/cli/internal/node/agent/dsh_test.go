package agent

import (
	"context"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/agent/dsh/plugins"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

type recordingDSHSessions struct {
	listCWD             string
	readCWD             string
	resumeCWD           string
	resumeWorkspaceID   string
	disposeCWD          string
	startRequest        dsh.SessionStartRequest
	promptRequest       dsh.SessionPromptRequest
	setModelRequest     dsh.SetModelRequest
	startErr            error
	promptErr           error
	subscribeErr        error
	disposeCount        int
	listResult          dsh.SessionListResult
	listErr             error
	titleSummaryRequest dsh.SessionTitleSummaryRequest
	titleSummaryResult  dsh.SessionTitleSummaryResult
	titleSummaryErr     error
	readErr             error
	filePathResult      dsh.SessionFilePathResult
	filePathErr         error
	lineageRequest      dsh.SessionLineageRequest
	lineageResult       dsh.SessionLineageResult
	lineageErr          error
	interruptRequest    dsh.SubagentInterruptRequest
	interruptResult     dsh.SubagentInterruptResult
	interruptErr        error
}

func (r *recordingDSHSessions) ListSessions(_ context.Context, request dsh.SessionListRequest) (dsh.SessionListResult, error) {
	r.listCWD = request.CWD
	return r.listResult, r.listErr
}

func (r *recordingDSHSessions) ListSessionTitleSummaries(_ context.Context, request dsh.SessionTitleSummaryRequest) (dsh.SessionTitleSummaryResult, error) {
	r.titleSummaryRequest = request
	return r.titleSummaryResult, r.titleSummaryErr
}

func (r *recordingDSHSessions) ListSessionLineage(_ context.Context, request dsh.SessionLineageRequest) (dsh.SessionLineageResult, error) {
	r.lineageRequest = request
	return r.lineageResult, r.lineageErr
}

func (r *recordingDSHSessions) InterruptSubagent(_ context.Context, request dsh.SubagentInterruptRequest) (dsh.SubagentInterruptResult, error) {
	r.interruptRequest = request
	return r.interruptResult, r.interruptErr
}

func (r *recordingDSHSessions) GetSessionFilePath(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionFilePathResult, error) {
	r.readCWD = request.CWD
	return r.filePathResult, r.filePathErr
}

func (r *recordingDSHSessions) ReadSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionReadResult, error) {
	r.readCWD = request.CWD
	return dsh.SessionReadResult{}, r.readErr
}

func (r *recordingDSHSessions) ResumeSession(_ context.Context, request dsh.SessionResumeRequest) (dsh.SessionResumeResult, error) {
	r.resumeCWD = request.CWD
	r.resumeWorkspaceID = request.WorkspaceID
	return dsh.SessionResumeResult{SessionID: request.SessionID}, nil
}

func (r *recordingDSHSessions) DisposeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	r.disposeCWD = request.CWD
	r.disposeCount++
	return dsh.SessionDisposeResult{SessionID: request.SessionID, Disposed: true}, nil
}

func TestService_DSHSessionMethodsUseOpenWorkspacePath(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})

	if _, err := service.ListDSHSessions(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if _, err := service.ReadDSHSession(context.Background(), "workspace-1", "session-1"); err != nil {
		t.Fatalf("read session: %v", err)
	}
	if _, err := service.ResumeDSHSession(context.Background(), "workspace-1", "session-1"); err != nil {
		t.Fatalf("resume session: %v", err)
	}

	if runtime.listCWD != "/open/workspace" || runtime.readCWD != "/open/workspace" || runtime.resumeCWD != "/open/workspace" || runtime.resumeWorkspaceID != "workspace-1" {
		t.Fatalf("DSH calls used cwd list=%q read=%q resume=%q workspace=%q", runtime.listCWD, runtime.readCWD, runtime.resumeCWD, runtime.resumeWorkspaceID)
	}
}

type blockingResumeDSH struct {
	recordingDSHSessions
	started chan struct{}
	release chan struct{}
}

func (r *blockingResumeDSH) ResumeSession(_ context.Context, request dsh.SessionResumeRequest) (dsh.SessionResumeResult, error) {
	close(r.started)
	<-r.release
	return dsh.SessionResumeResult{SessionID: request.SessionID}, nil
}

func TestService_DSHResumeAdmissionBlocksWorkspaceCleanup(t *testing.T) {
	runtime := &blockingResumeDSH{started: make(chan struct{}), release: make(chan struct{})}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})
	resumeDone := make(chan error, 1)
	go func() {
		_, err := service.ResumeDSHSession(context.Background(), "workspace-1", "session-1")
		resumeDone <- err
	}()
	<-runtime.started
	cleanupDone := make(chan *WorkspaceAgentCleanup, 1)
	go func() {
		handle, _ := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
		cleanupDone <- handle
	}()
	select {
	case <-cleanupDone:
		t.Fatal("workspace cleanup crossed an active DSH resume")
	case <-time.After(20 * time.Millisecond):
	}
	close(runtime.release)
	if err := <-resumeDone; err != nil {
		t.Fatalf("resume: %v", err)
	}
	select {
	case handle := <-cleanupDone:
		service.AbortWorkspaceAgentCleanup(handle)
	case <-time.After(time.Second):
		t.Fatal("workspace cleanup did not continue after resume")
	}
}

func TestService_ListDSHSessionsAddsOptionalTitleSummaries(t *testing.T) {
	runtime := &recordingDSHSessions{
		listResult:         dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "session-1"}}},
		titleSummaryResult: dsh.SessionTitleSummaryResult{Titles: []dsh.SessionTitleSummary{{SessionID: "session-1", PreviewText: "Review migration"}}},
	}
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/workspace", State: workspace.StateActive}, nil
	}), DSH: runtime})
	listed, err := service.ListDSHSessions(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("ListDSHSessions: %v", err)
	}
	if got := listed.Sessions[0].PreviewText; got != "Review migration" {
		t.Fatalf("preview = %q", got)
	}
	if got := runtime.titleSummaryRequest; got.CWD != "/workspace" || len(got.SessionIDs) != 1 || got.SessionIDs[0] != "session-1" {
		t.Fatalf("title summary request = %#v", got)
	}
}

type legacyDSHSessions struct{ DSHSessions }

func TestService_ListDSHSessionsKeepsSessionsWhenRuntimeHasNoTitleSummary(t *testing.T) {
	runtime := &recordingDSHSessions{listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "session-1"}}}}
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/workspace", State: workspace.StateActive}, nil
	}), DSH: legacyDSHSessions{DSHSessions: runtime}})
	listed, err := service.ListDSHSessions(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("ListDSHSessions: %v", err)
	}
	if len(listed.Sessions) != 1 || listed.Sessions[0].PreviewText != "" {
		t.Fatalf("listed sessions = %#v", listed.Sessions)
	}
}

func TestService_ListDSHSessionsKeepsSessionsWhenOptionalTitleSummaryFails(t *testing.T) {
	runtime := &recordingDSHSessions{
		listResult:      dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "session-1"}}},
		titleSummaryErr: errors.New("unsupported title summary"),
	}
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/workspace", State: workspace.StateActive}, nil
	}), DSH: runtime})
	listed, err := service.ListDSHSessions(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("ListDSHSessions: %v", err)
	}
	if len(listed.Sessions) != 1 || listed.Sessions[0].PreviewText != "" {
		t.Fatalf("listed sessions = %#v", listed.Sessions)
	}
}

type undisposableDSH struct{ recordingDSHSessions }

func (r *undisposableDSH) DisposeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	return dsh.SessionDisposeResult{SessionID: request.SessionID, Disposed: false}, nil
}

func TestService_WorkspaceCleanupRejectsUnownedLiveDSHSession(t *testing.T) {
	runtime := &undisposableDSH{recordingDSHSessions: recordingDSHSessions{
		listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "session-1", Live: true}}},
	}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})
	handle, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
	if err == nil {
		t.Fatal("cleanup accepted a live DSH session that could not be disposed")
	}
	service.AbortWorkspaceAgentCleanup(handle)
}

func TestService_WorkspaceCleanupDisposesLiveDSHSessions(t *testing.T) {
	runtime := &recordingDSHSessions{listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{
		SessionID: "session-1", Live: true, Persisted: true,
	}}}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})
	handle, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("begin cleanup: %v", err)
	}
	service.AbortWorkspaceAgentCleanup(handle)
	if runtime.disposeCWD != "/open/workspace" {
		t.Fatalf("dispose cwd = %q", runtime.disposeCWD)
	}
}

func TestService_DSHSessionMethodsRejectClosedWorkspaceBeforeRuntimeCall(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(string) (workspace.Workspace, error) {
			return workspace.Workspace{}, errors.New("workspace not found")
		}),
		DSH: runtime,
	})

	if _, err := service.ListDSHSessions(context.Background(), "closed-workspace"); err == nil {
		t.Fatal("list sessions succeeded for a closed workspace")
	}
	if _, err := service.ReadDSHSession(context.Background(), "closed-workspace", "session-1"); err == nil {
		t.Fatal("read session succeeded for a closed workspace")
	}
	if _, err := service.ResumeDSHSession(context.Background(), "closed-workspace", "session-1"); err == nil {
		t.Fatal("resume session succeeded for a closed workspace")
	}
	if runtime.listCWD != "" || runtime.readCWD != "" || runtime.resumeCWD != "" {
		t.Fatal("runtime was called for a closed workspace")
	}
}

func (r *recordingDSHSessions) StartSession(_ context.Context, request dsh.SessionStartRequest) (dsh.SessionStartResult, error) {
	r.startRequest = request
	return dsh.SessionStartResult{SessionID: request.SessionID, InstanceID: "test-instanceID"}, r.startErr
}
func (r *recordingDSHSessions) SetModelSession(_ context.Context, request dsh.SetModelRequest) error {
	r.setModelRequest = request
	return nil
}
func (r *recordingDSHSessions) PromptSession(_ context.Context, request dsh.SessionPromptRequest) (dsh.SessionPromptResult, error) {
	r.promptRequest = request
	return dsh.SessionPromptResult{}, r.promptErr
}
func (r *recordingDSHSessions) CancelSession(_ context.Context, request dsh.SessionCancelRequest) (dsh.SessionCancelResult, error) {
	return dsh.SessionCancelResult{SessionID: request.SessionID, Cancelled: true}, nil
}
func (r *recordingDSHSessions) SubscribeSession(context.Context, dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error) {
	return dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate), Unsubscribe: func() {}}, r.subscribeErr
}
func (r *recordingDSHSessions) FlushSession(_ context.Context, request dsh.SessionFlushRequest) (dsh.DurableCursor, error) {
	return dsh.DurableCursor{SessionID: request.SessionID}, nil
}
func (r *recordingDSHSessions) Health() dsh.Health { return dsh.Health{IsReady: true} }

func TestAgentInspectionRPC_MapsDSHRuntimeErrorsToStableUnavailableCode(t *testing.T) {
	for _, operation := range []struct {
		name    string
		method  string
		params  map[string]any
		runtime *recordingDSHSessions
	}{
		{"list", rpc.MethodAgentListSessions, map[string]any{"runtime": "dsh", "workspaceId": "workspace", "cwd": "/workspace"}, &recordingDSHSessions{listErr: dsh.ErrRuntimeUnavailable}},
		{"read", rpc.MethodAgentReadHistory, map[string]any{"runtime": "dsh", "transcriptProtocolVersion": 2, "sessionId": "session", "workspaceId": "workspace", "cwd": "/workspace"}, &recordingDSHSessions{readErr: dsh.ErrRuntimeUnavailable}},
	} {
		t.Run(operation.name, func(t *testing.T) {
			service := newTestHandler(t)
			service.deps.Workspace = testWorkspaceResolver(func(string) (workspace.Workspace, error) {
				return workspace.Workspace{ID: "workspace", Path: "/workspace", State: workspace.StateActive}, nil
			})
			service.deps.DSH = operation.runtime
			_, err := service.callAgentRPCForTest(context.Background(), nil, operation.method, mustMarshalJSON(t, operation.params))
			var rpcErr *rpc.Error
			if !errors.As(err, &rpcErr) || rpcErr.Data["code"] != rpc.ErrorDataCodeDSHRuntimeUnavailable {
				t.Fatalf("RPC error = %#v, want stable DSH runtime-unavailable code", err)
			}
		})
	}
}

func TestAgentListSessionLineage_UsesResolvedWorkspaceAndMapsResult(t *testing.T) {
	runtime := &recordingDSHSessions{lineageResult: dsh.SessionLineageResult{
		RootSessionID: "root", Mode: dsh.SessionLineageDescendants,
		Children: []dsh.SessionLineageEntry{{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: 1, RelativeDepth: 1, Live: true, Persisted: true, Activity: "running", Mode: "continuable", Label: "worker"}},
	}}
	service := newTestHandler(t)
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/open/workspace", State: workspace.StateActive}, nil
	})
	service.deps.DSH = runtime

	response, err := service.AgentListSessionLineage(context.Background(), rpc.AgentListSessionLineageParams{
		Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/open/workspace", RootSessionID: "root", Mode: rpc.AgentSessionLineageDescendants,
	})
	if err != nil {
		t.Fatalf("AgentListSessionLineage: %v", err)
	}
	if runtime.lineageRequest != (dsh.SessionLineageRequest{CWD: "/open/workspace", RootSessionID: "root", Mode: dsh.SessionLineageDescendants}) {
		t.Fatalf("DSH request = %#v", runtime.lineageRequest)
	}
	got, ok := response.(rpc.AgentSessionLineageResult)
	if !ok || got.Runtime != rpc.AgentRuntimeDSH || got.RootSessionID != "root" || len(got.Children) != 1 || got.Children[0].SessionID != "child" || got.Children[0].Mode != "continuable" {
		t.Fatalf("result = %#v", response)
	}
}

func TestAgentListSessionLineage_RejectsInvalidRequestsBeforeDSH(t *testing.T) {
	tests := []struct {
		name       string
		params     rpc.AgentListSessionLineageParams
		workspace  workspace.Workspace
		resolveErr error
		isInvalid  bool
	}{
		{"pi runtime", rpc.AgentListSessionLineageParams{Runtime: rpc.AgentRuntimePi, WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: "root", Mode: rpc.AgentSessionLineageChildren}, workspace.Workspace{}, nil, true},
		{"unknown runtime", rpc.AgentListSessionLineageParams{Runtime: "other", WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: "root", Mode: rpc.AgentSessionLineageChildren}, workspace.Workspace{}, nil, true},
		{"blank root session", rpc.AgentListSessionLineageParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: " ", Mode: rpc.AgentSessionLineageChildren}, workspace.Workspace{}, nil, true},
		{"invalid mode", rpc.AgentListSessionLineageParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: "root", Mode: "all"}, workspace.Workspace{}, nil, true},
		{"workspace cwd mismatch", rpc.AgentListSessionLineageParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/untrusted", RootSessionID: "root", Mode: rpc.AgentSessionLineageChildren}, workspace.Workspace{ID: "workspace", Path: "/workspace", State: workspace.StateActive}, nil, true},
		{"closed workspace", rpc.AgentListSessionLineageParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: "root", Mode: rpc.AgentSessionLineageChildren}, workspace.Workspace{}, errors.New("workspace not found"), false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runtime := &recordingDSHSessions{}
			service := newTestHandler(t)
			service.deps.Workspace = testWorkspaceResolver(func(string) (workspace.Workspace, error) {
				return test.workspace, test.resolveErr
			})
			service.deps.DSH = runtime
			_, err := service.AgentListSessionLineage(context.Background(), test.params)
			var rpcErr *rpc.Error
			if test.isInvalid && (!errors.As(err, &rpcErr) || rpcErr.Code != rpc.CodeInvalidParams) {
				t.Fatalf("error = %#v, want invalid params", err)
			}
			if runtime.lineageRequest.CWD != "" {
				t.Fatalf("DSH called for rejected request: %#v", runtime.lineageRequest)
			}
		})
	}
}

func TestAgentListSessionLineage_MapsRuntimeUnavailable(t *testing.T) {
	service := newTestHandler(t)
	service.deps.Workspace = testWorkspaceResolver(func(string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: "workspace", Path: "/workspace", State: workspace.StateActive}, nil
	})
	service.deps.DSH = &recordingDSHSessions{lineageErr: dsh.ErrRuntimeUnavailable}
	_, err := service.AgentListSessionLineage(context.Background(), rpc.AgentListSessionLineageParams{
		Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/workspace", RootSessionID: "root", Mode: rpc.AgentSessionLineageChildren,
	})
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) || rpcErr.Data["code"] != rpc.ErrorDataCodeDSHRuntimeUnavailable {
		t.Fatalf("error = %#v, want stable runtime-unavailable code", err)
	}
}

type recordingDSHPluginManager struct {
	inventory       plugins.Inventory
	officialBundles []plugins.ApprovedBundle
	name            string
	enabled         bool
	operation       string
}

func (m *recordingDSHPluginManager) List(context.Context) (plugins.Inventory, error) {
	return m.inventory, nil
}
func (m *recordingDSHPluginManager) ListOfficial() []plugins.ApprovedBundle { return m.officialBundles }
func (m *recordingDSHPluginManager) Install(_ context.Context, name string) (plugins.Inventory, error) {
	m.operation, m.name = "install", name
	return m.inventory, nil
}
func (m *recordingDSHPluginManager) SetEnabled(_ context.Context, name string, enabled bool) (plugins.Inventory, error) {
	m.operation, m.name, m.enabled = "setEnabled", name, enabled
	return m.inventory, nil
}
func (m *recordingDSHPluginManager) Remove(_ context.Context, name string) (plugins.Inventory, error) {
	m.operation, m.name = "remove", name
	return m.inventory, nil
}
func (m *recordingDSHPluginManager) Update(_ context.Context, name string) (plugins.Inventory, error) {
	m.operation, m.name = "update", name
	return m.inventory, nil
}
func (m *recordingDSHPluginManager) CaptureSnapshot(context.Context) (plugins.Snapshot, error) {
	return plugins.Snapshot{}, nil
}
func (m *recordingDSHPluginManager) RestoreSnapshot(context.Context, plugins.Snapshot) error {
	return nil
}

type recordingDSHPluginRuntime struct{ restarts int }

func (r *recordingDSHPluginRuntime) Restart(context.Context) error { r.restarts++; return nil }
func (r *recordingDSHPluginRuntime) Recover(context.Context) error { r.restarts++; return nil }

func TestService_DSHPluginMutationRestartsRuntimeAfterSuccessfulMutation(t *testing.T) {
	manager := &recordingDSHPluginManager{inventory: plugins.Inventory{Plugins: []plugins.Plugin{{Name: "safe-plugin", Version: "1.0.0", Enabled: true}}}}
	runtime := &recordingDSHPluginRuntime{}
	service := NewService(Deps{DSHPlugins: manager, DSHPluginRuntime: runtime})

	result, err := service.DSHSetPluginEnabled(context.Background(), rpc.DSHSetPluginEnabledParams{Name: "safe-plugin", Enabled: false})
	if err != nil {
		t.Fatalf("set enabled: %v", err)
	}
	if manager.operation != "setEnabled" || manager.name != "safe-plugin" || manager.enabled || runtime.restarts != 1 {
		t.Fatalf("manager = %#v, restarts = %d", manager, runtime.restarts)
	}
	if got := result.(rpc.DSHPluginListResult).Bundles[0]; got.Name != "safe-plugin" || !got.Enabled {
		t.Fatalf("result bundle = %#v", got)
	}
}

func TestService_DSHOfficialPluginCatalogMapsEmptyAuditedCatalog(t *testing.T) {
	service := NewService(Deps{DSHPlugins: &recordingDSHPluginManager{}})
	result, err := service.DSHListOfficialPlugins(context.Background())
	if err != nil {
		t.Fatalf("list official plugins: %v", err)
	}
	bundles := result.(rpc.DSHPluginCatalogResult).Bundles
	if len(bundles) != 0 {
		t.Fatalf("official catalog = %#v, want empty compatible catalog", bundles)
	}
}
func TestService_DSHInstallPluginUsesDaemonSelectedName(t *testing.T) {
	manager := &recordingDSHPluginManager{inventory: plugins.Inventory{}}
	runtime := &recordingDSHPluginRuntime{}
	service := NewService(Deps{DSHPlugins: manager, DSHPluginRuntime: runtime})
	if _, err := service.DSHInstallPlugin(context.Background(), rpc.DSHPluginNameParams{Name: "safe-plugin"}); err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if manager.operation != "install" || manager.name != "safe-plugin" || runtime.restarts != 1 {
		t.Fatalf("manager = %#v, restarts = %d", manager, runtime.restarts)
	}
}
