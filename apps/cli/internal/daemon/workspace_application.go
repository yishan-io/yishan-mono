package daemon

import (
	"context"
	"fmt"
	"strings"

	apiclientadapter "yishan/apps/cli/internal/adapters/apiclient"
	sqliteadapter "yishan/apps/cli/internal/adapters/sqlite"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// workspaceAppAdapter implements the application ports with the handler's
// existing dependencies (manager, API client, SQLite store, relay connection,
// event hub, watchers, PR tracker). The Service owns orchestration; this
// adapter owns the mechanisms.
type workspaceAppAdapter struct {
	h *JSONRPCHandler
}

// newWorkspaceApplicationService wires the application Service for a handler.
func newWorkspaceApplicationService(h *JSONRPCHandler) *application.Service {
	adapter := &workspaceAppAdapter{h: h}
	return application.New(application.Dependencies{
		NodeID:      h.nodeID,
		Now:         nowRFC3339Nano,
		Environment: adapter,
		Records:     adapter,
		Instances:   adapter,
		Relay:       adapter,
		Events:      adapter,
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
			return h.cleanupStore.Add(pendingWorkspaceCleanup{
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

// ---- EnvironmentPort ----

func (a *workspaceAppAdapter) APIConfigured() bool {
	return a.h.runtime != nil && a.h.runtime.APIConfigured()
}

func (a *workspaceAppAdapter) ListProjects(ctx context.Context, organizationID string) ([]application.Project, error) {
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

func (a *workspaceAppAdapter) ListWorkspaces(ctx context.Context, organizationID string, projectID string) ([]workspace.Record, error) {
	if a.h.runtime == nil || !a.h.runtime.APIConfigured() {
		return nil, fmt.Errorf("load project workspaces: no authenticated API session")
	}
	response, err := a.h.runtime.APIClient().ListWorkspaces(organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("load project workspaces: %w", err)
	}
	records := make([]workspace.Record, 0, len(response.Workspaces))
	for _, item := range response.Workspaces {
		records = append(records, apiclientadapter.WorkspaceToDomain(item))
	}
	return records, nil
}

func (a *workspaceAppAdapter) ListNodes(ctx context.Context, organizationID string) ([]application.Node, error) {
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

func (a *workspaceAppAdapter) EnsureSharedRepoClone(ctx context.Context, repoKey string, repoURL string) (string, error) {
	return ensureSharedRepoClone(ctx, repoKey, repoURL)
}

// ---- WorkspaceRecordPort ----

func (a *workspaceAppAdapter) CreateRemoteRecord(ctx context.Context, registration application.Registration) {
	a.h.createRemoteWorkspaceRecord(ctx, registration)
}

func (a *workspaceAppAdapter) UpdateRemoteRecord(ctx context.Context, registration application.Registration, localPath string) {
	a.h.updateRemoteWorkspaceRecord(ctx, registration, localPath)
}

func (a *workspaceAppAdapter) CloseRemoteRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status workspace.Status) {
	a.h.closeRemoteWorkspaceRecord(ctx, organizationID, projectID, workspaceID, string(status))
}

func (a *workspaceAppAdapter) PersistPrepared(ctx context.Context, plan application.CreatePlan) error {
	return a.h.persistPreparedWorkspace(ctx, plan)
}

func (a *workspaceAppAdapter) FinalizePersisted(ctx context.Context, plan application.CreatePlan, created workspace.Workspace) error {
	return a.h.finalizePersistedWorkspace(ctx, plan, created)
}

func (a *workspaceAppAdapter) ClosePersisted(ctx context.Context, workspaceID string) error {
	return a.h.closePersistedWorkspace(ctx, workspaceID)
}

func (a *workspaceAppAdapter) LocalRow(ctx context.Context, workspaceID string) (workspace.Record, bool) {
	if a.h.localDatabase == nil {
		return workspace.Record{}, false
	}
	row, err := localdb.NewWorkspaceStore(a.h.localDatabase).Get(ctx, workspaceID)
	if err != nil {
		return workspace.Record{}, false
	}
	return sqliteadapter.WorkspaceToDomain(row), true
}

// ---- WorkspaceInstancePort ----

func (a *workspaceAppAdapter) CreateWorkspaceWithProgress(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
	return a.h.manager.CreateWorkspaceWithProgress(ctx, req, report)
}

func (a *workspaceAppAdapter) CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	return a.h.manager.CloseWorkspace(ctx, req)
}

func (a *workspaceAppAdapter) CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	return a.h.manager.CloseWorkspacePath(ctx, req)
}

func (a *workspaceAppAdapter) SetState(workspaceID string, state instance.State, health instance.Health) error {
	return a.h.manager.SetWorkspaceState(workspaceID, string(state), string(health))
}

func (a *workspaceAppAdapter) Get(workspaceID string) (workspace.Workspace, error) {
	return a.h.manager.GetWorkspace(workspaceID)
}

func (a *workspaceAppAdapter) RemoveFromMemory(workspaceID string) {
	a.h.manager.RemoveWorkspaceFromMemory(workspaceID)
}

func (a *workspaceAppAdapter) WatchAndTrack(workspaceID string, path string) {
	a.h.watchAndTrack(workspaceID, path)
}

func (a *workspaceAppAdapter) Unwatch(path string) {
	a.h.watchers.Unwatch(path)
}

func (a *workspaceAppAdapter) StopTracking(workspaceID string) {
	a.h.prTracker.StopTracking(workspaceID)
}

// ---- RelayPort ----

func (a *workspaceAppAdapter) DispatchCreate(ctx context.Context, plan application.CreatePlan, command application.CreateCommand) error {
	return a.h.dispatchRemoteWorkspaceCreate(workspaceCreateParams(command), workspaceCreateStartedEvent(plan.StartedEvent))
}

func (a *workspaceAppAdapter) DispatchClose(ctx context.Context, command application.CloseCommand, targetNodeID string) error {
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

// ---- EventPort ----

func (a *workspaceAppAdapter) Publish(topic string, payload any) {
	a.h.events.Publish(frontendEvent{Topic: topic, Payload: payload})
}

func (a *workspaceAppAdapter) SnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	a.h.publishWorkspaceSnapshotChanged(organizationID, projectID, workspaceID, change)
}

func (a *workspaceAppAdapter) CreateStarted(event application.StartedEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateStarted", Payload: event})
}

func (a *workspaceAppAdapter) CreateProgress(plan application.CreatePlan, event workspace.CreateProgressEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
	a.h.relayWorkspaceCreateProgress(plan, event)
}

func (a *workspaceAppAdapter) CreateFailed(plan application.CreatePlan, failed application.FailedEvent) {
	a.h.events.Publish(frontendEvent{Topic: "workspaceCreateFailed", Payload: failed})
	a.h.relayWorkspaceCreateFailed(plan, workspaceCreateFailedEvent(failed))
}

func (a *workspaceAppAdapter) CreateCompleted(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
	a.h.publishWorkspaceCreateCompleted(plan, created, warnings)
}
