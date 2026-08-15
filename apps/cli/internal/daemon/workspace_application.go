package daemon

import (
	"context"
	"fmt"
	"strings"

	api "yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// appDeps implements the application ports with the handler's
// existing dependencies (manager, API client, SQLite store, relay connection,
// event hub, watchers, PR tracker). The Service owns orchestration; this
// appDeps owns the mechanisms.
type appDeps struct {
	h *JSONRPCHandler
}

// newWorkspaceApplicationService wires the application Service for a handler.
func newWorkspaceApplicationService(h *JSONRPCHandler) *application.Service {
	appDeps := &appDeps{h: h}
	return application.New(application.Dependencies{
		NodeID:      h.nodeID,
		Now:         nowRFC3339Nano,
		Environment: appDeps,
		Records:     appDeps,
		Instances:   appDeps,
		Relay:       appDeps,
		Events:      appDeps,
		HookWarnings: func(setupHook string, result *workspace.HookResult) []any {
			return buildWorkspaceHookWarnings(setupHook, result, h.logFilePath)
		},
		SyncUsage: func(source string) {
			if h.tokenUsage != nil {
				h.tokenUsage.SyncNow(source)
			}
		},
		RegisterCleanup: func(req application.CleanupRequest) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Add(node.PendingWorkspaceCleanup{
				WorkspaceID: req.WorkspaceID, Path: req.Path, Branch: req.Branch,
				RemoveBranch: req.RemoveBranch, ForceWorktree: req.ForceWorktree,
				ForceBranch: req.ForceBranch, PostHook: req.PostHook,
			})
		},
		RemoveCleanup: func(workspaceID string) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Remove(workspaceID)
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.MarkFailure(workspaceID, cleanupErr)
		},
		SummarizeAgents: func(workspaceID string, req workspace.CloseRequest) {
			h.summarizeUsedAgents(workspaceID, req)
		},
		ClearAgentUsage: h.clearAgentUsage,
		Warn: func(workspaceID string, path string, message string, err error) {
			entry := log.Warn().Err(err).Str("workspaceId", workspaceID)
			if strings.TrimSpace(path) != "" {
				entry = entry.Str("path", path)
			}
			entry.Msg(message)
		},
	})
}

// ---- Environment ----

func (a *appDeps) APIConfigured() bool {
	return a.h.runtime != nil && a.h.runtime.APIConfigured()
}

func (a *appDeps) ListProjects(ctx context.Context, organizationID string) ([]application.Project, error) {
	runtime := a.h.runtime
	if runtime == nil || !runtime.APIConfigured() {
		return nil, fmt.Errorf("workspace creation requires an authenticated API session")
	}
	response, err := runtime.APIClient().ListProjects(organizationID)
	if err != nil {
		return nil, fmt.Errorf("load project metadata: %w", err)
	}
	projects := make([]application.Project, 0, len(response.Projects))
	for _, project := range response.Projects {
		projects = append(projects, application.Project{
			ID: project.ID, RepoKey: project.RepoKey, RepoURL: project.RepoURL,
			SetupScript: project.SetupScript, ContextEnabled: project.ContextEnabled,
		})
	}
	return projects, nil
}

func (a *appDeps) ListWorkspaces(ctx context.Context, organizationID string, projectID string) ([]workspace.Record, error) {
	if a.h.runtime == nil || !a.h.runtime.APIConfigured() {
		return nil, fmt.Errorf("load project workspaces: no authenticated API session")
	}
	response, err := a.h.runtime.APIClient().ListWorkspaces(organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("load project workspaces: %w", err)
	}
	records := make([]workspace.Record, 0, len(response.Workspaces))
	for _, item := range response.Workspaces {
		records = append(records, api.WorkspaceToDomain(item))
	}
	return records, nil
}

func (a *appDeps) ListNodes(ctx context.Context, organizationID string) ([]application.Node, error) {
	if a.h.runtime == nil || !a.h.runtime.APIConfigured() {
		return nil, fmt.Errorf("load organization nodes: no authenticated API session")
	}
	response, err := a.h.runtime.APIClient().ListNodes(organizationID)
	if err != nil {
		return nil, fmt.Errorf("load organization nodes: %w", err)
	}
	nodes := make([]application.Node, 0, len(response.Nodes))
	for _, node := range response.Nodes {
		nodes = append(nodes, application.Node{ID: node.ID})
	}
	return nodes, nil
}

func (a *appDeps) EnsureSharedRepoClone(ctx context.Context, repoKey string, repoURL string) (string, error) {
	return ensureSharedRepoClone(ctx, repoKey, repoURL)
}

// ---- WorkspaceRecords ----

func (a *appDeps) CreateRemoteRecord(ctx context.Context, registration application.Registration) {
	a.h.nodeApp.CreateRemoteRecord(ctx, registration)
}

func (a *appDeps) UpdateRemoteRecord(ctx context.Context, registration application.Registration, localPath string) {
	a.h.nodeApp.UpdateRemoteRecord(ctx, registration, localPath)
}

func (a *appDeps) CloseRemoteRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status workspace.Status) {
	a.h.nodeApp.CloseRemoteRecord(ctx, organizationID, projectID, workspaceID, string(status))
}

func (a *appDeps) PersistPrepared(ctx context.Context, plan application.CreatePlan) error {
	return a.h.nodeApp.PersistPrepared(ctx, plan)
}

func (a *appDeps) FinalizePersisted(ctx context.Context, plan application.CreatePlan, created workspace.Workspace) error {
	return a.h.nodeApp.FinalizePersisted(ctx, plan, created)
}

func (a *appDeps) ClosePersisted(ctx context.Context, workspaceID string) error {
	return a.h.nodeApp.ClosePersisted(ctx, workspaceID)
}

func (a *appDeps) LocalRow(ctx context.Context, workspaceID string) (workspace.Record, bool) {
	if a.h.localDatabase == nil {
		return workspace.Record{}, false
	}
	row, err := localdb.NewWorkspaceStore(a.h.localDatabase).Get(ctx, workspaceID)
	if err != nil {
		return workspace.Record{}, false
	}
	return localdb.WorkspaceToDomain(row), true
}

// ---- Instances ----

func (a *appDeps) CreateWorkspaceWithProgress(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
	return a.h.manager.CreateWorkspaceWithProgress(ctx, req, report)
}

func (a *appDeps) CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	return a.h.manager.CloseWorkspace(ctx, req)
}

func (a *appDeps) CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	return a.h.manager.CloseWorkspacePath(ctx, req)
}

func (a *appDeps) SetState(workspaceID string, state instance.State, health instance.Health) error {
	return a.h.manager.Instances().SetState(workspaceID, state, health)
}

func (a *appDeps) Get(workspaceID string) (workspace.Workspace, error) {
	return a.h.getWorkspace(workspaceID)
}

func (a *appDeps) RemoveFromMemory(workspaceID string) {
	a.h.manager.Instances().Remove(workspaceID)
}

func (a *appDeps) WatchAndTrack(workspaceID string, path string) {
	a.h.nodeApp.WatchAndTrack(workspaceID, path)
}

func (a *appDeps) Unwatch(path string) {
	a.h.watchers.Unwatch(path)
}

func (a *appDeps) StopTracking(workspaceID string) {
	a.h.prTracker.StopTracking(workspaceID)
}

// ---- Relay ----

func (a *appDeps) DispatchCreate(ctx context.Context, plan application.CreatePlan, command application.CreateCommand) error {
	return a.h.dispatchRemoteWorkspaceCreate(workspaceCreateParams(command), workspaceCreateStartedEvent(plan.StartedEvent))
}

func (a *appDeps) DispatchClose(ctx context.Context, command application.CloseCommand, targetNodeID string) error {
	payload := relayWorkspaceCloseEnvelope{
		OrganizationID: command.OrganizationID,
		ProjectID:      command.ProjectID,
		WorkspaceID:    command.WorkspaceID,
		SourceNodeID:   a.h.nodeID,
		TargetNodeID:   targetNodeID,
		Change:         relayChangeWorkspaceCloseRequest,
		Branch:         command.Branch,
		RemoveBranch:   command.RemoveBranch,
		ForceWorktree:  command.ForceWorktree,
		ForceBranch:    command.ForceBranch,
		PostHook:       command.PostHook,
	}
	return a.h.sendRelayDispatchRequest(payload, targetNodeID)
}

// ---- Events ----

func (a *appDeps) Publish(topic string, payload any) {
	a.h.events.Publish(frontendEvent{Topic: topic, Payload: payload})
}

func (a *appDeps) SnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	a.h.nodeApp.PublishWorkspaceSnapshotChanged(organizationID, projectID, workspaceID, change)
}

func (a *appDeps) CreateStarted(event application.StartedEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateStarted", Payload: event})
}

func (a *appDeps) CreateProgress(plan application.CreatePlan, event workspace.CreateProgressEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
	a.h.relayWorkspaceCreateProgress(plan, event)
}

func (a *appDeps) CreateFailed(plan application.CreatePlan, failed application.FailedEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateFailed", Payload: failed})
	a.h.relayWorkspaceCreateFailed(plan, workspaceCreateFailedEvent(failed))
}

func (a *appDeps) CreateCompleted(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
	a.h.publishWorkspaceCreateCompleted(plan, created, warnings)
}

// workspaceHandle builds a workspace-scoped handle from the instance registry
// and the manager's shared services (file cache, git, terminals).
func (h *JSONRPCHandler) workspaceHandle(workspaceID string) (instance.Handle, error) {
	ws, ok := h.manager.Instances().Get(workspaceID)
	if !ok {
		return instance.Handle{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return h.handleForInstance(ws), nil
}

// workspaceHandleByPath resolves the canonical path and builds the handle for
// the instance at that path.
func (h *JSONRPCHandler) workspaceHandleByPath(path string) (instance.Handle, error) {
	ws, ok := h.manager.Instances().GetByPath(path)
	if !ok {
		return instance.Handle{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return h.handleForInstance(ws), nil
}

func (h *JSONRPCHandler) handleForInstance(ws workspace.Workspace) instance.Handle {
	return instance.NewHandle(ws, h.manager.Instances().Files(), h.manager.Gits(), h.manager.Terminals())
}

// getWorkspace returns the open instance for a workspace id, mapping a missing
// instance to the RPC not-found error (instance reads go through the registry).
func (h *JSONRPCHandler) getWorkspace(workspaceID string) (workspace.Workspace, error) {
	ws, ok := h.manager.Instances().Get(workspaceID)
	if !ok {
		return workspace.Workspace{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return ws, nil
}
