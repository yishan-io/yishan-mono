package node

import (
	"context"
	"fmt"
	"strings"

	api "yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// appDeps implements the application port interfaces (Environment,
// WorkspaceRecords, Instances, Relay, Events) with the services layer's
// dependencies (manager, API client, SQLite store, relay client, event hub,
// watchers, PR tracker). The application Service owns orchestration; appDeps
// owns the mechanisms. This keeps the application package free of daemon and
// transport types.
type appDeps struct {
	s *Services
}

// newWorkspaceApplicationService wires the application Service for the
// services layer.
func (s *Services) newWorkspaceApplicationService() *application.Service {
	deps := &appDeps{s: s}
	return application.New(application.Dependencies{
		NodeID:      s.nodeID,
		Now:         nowRFC3339Nano,
		Environment: deps,
		Records:     deps,
		Instances:   deps,
		Relay:       deps,
		Events:      deps,
		HookWarnings: func(setupHook string, result *workspace.HookResult) []any {
			return buildWorkspaceHookWarnings(setupHook, result, s.logFilePath)
		},
		SyncUsage: func(source string) {
			if s.tokenUsage != nil {
				s.tokenUsage.SyncNow(source)
			}
		},
		RegisterCleanup: func(req application.CleanupRequest) error {
			if s.cleanupStore == nil {
				return nil
			}
			return s.cleanupStore.Add(PendingWorkspaceCleanup{
				WorkspaceID: req.WorkspaceID, Path: req.Path, Branch: req.Branch,
				RemoveBranch: req.RemoveBranch, ForceWorktree: req.ForceWorktree,
				ForceBranch: req.ForceBranch, PostHook: req.PostHook,
			})
		},
		RemoveCleanup: func(workspaceID string) error {
			if s.cleanupStore == nil {
				return nil
			}
			return s.cleanupStore.Remove(workspaceID)
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if s.cleanupStore == nil {
				return nil
			}
			return s.cleanupStore.MarkFailure(workspaceID, cleanupErr)
		},
		SummarizeAgents: func(workspaceID string, req workspace.CloseRequest) {
			s.summarizeUsedAgents(workspaceID, req)
		},
		ClearAgentUsage: s.clearAgentUsage,
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

func (d *appDeps) APIConfigured() bool {
	return d.s.runtime != nil && d.s.runtime.APIConfigured()
}

func (d *appDeps) ListProjects(ctx context.Context, organizationID string) ([]application.Project, error) {
	runtime := d.s.runtime
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

func (d *appDeps) ListWorkspaces(ctx context.Context, organizationID string, projectID string) ([]workspace.Record, error) {
	if d.s.runtime == nil || !d.s.runtime.APIConfigured() {
		return nil, fmt.Errorf("load project workspaces: no authenticated API session")
	}
	response, err := d.s.runtime.APIClient().ListWorkspaces(organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("load project workspaces: %w", err)
	}
	records := make([]workspace.Record, 0, len(response.Workspaces))
	for _, item := range response.Workspaces {
		records = append(records, api.WorkspaceToDomain(item))
	}
	return records, nil
}

func (d *appDeps) ListNodes(ctx context.Context, organizationID string) ([]application.Node, error) {
	if d.s.runtime == nil || !d.s.runtime.APIConfigured() {
		return nil, fmt.Errorf("load organization nodes: no authenticated API session")
	}
	response, err := d.s.runtime.APIClient().ListNodes(organizationID)
	if err != nil {
		return nil, fmt.Errorf("load organization nodes: %w", err)
	}
	nodes := make([]application.Node, 0, len(response.Nodes))
	for _, node := range response.Nodes {
		nodes = append(nodes, application.Node{ID: node.ID})
	}
	return nodes, nil
}

func (d *appDeps) EnsureSharedRepoClone(ctx context.Context, repoKey string, repoURL string) (string, error) {
	return ensureSharedRepoClone(ctx, repoKey, repoURL)
}

// ---- WorkspaceRecords ----

func (d *appDeps) CreateRemoteRecord(ctx context.Context, registration application.Registration) {
	d.s.nodeApp.CreateRemoteRecord(ctx, registration)
}

func (d *appDeps) UpdateRemoteRecord(ctx context.Context, registration application.Registration, localPath string) {
	d.s.nodeApp.UpdateRemoteRecord(ctx, registration, localPath)
}

func (d *appDeps) CloseRemoteRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status workspace.Status) {
	d.s.nodeApp.CloseRemoteRecord(ctx, organizationID, projectID, workspaceID, string(status))
}

func (d *appDeps) PersistPrepared(ctx context.Context, plan application.CreatePlan) error {
	return d.s.nodeApp.PersistPrepared(ctx, plan)
}

func (d *appDeps) FinalizePersisted(ctx context.Context, plan application.CreatePlan, created workspace.Workspace) error {
	return d.s.nodeApp.FinalizePersisted(ctx, plan, created)
}

func (d *appDeps) ClosePersisted(ctx context.Context, workspaceID string) error {
	return d.s.nodeApp.ClosePersisted(ctx, workspaceID)
}

func (d *appDeps) LocalRow(ctx context.Context, workspaceID string) (workspace.Record, bool) {
	if d.s.localDatabase == nil {
		return workspace.Record{}, false
	}
	row, err := localdb.NewWorkspaceStore(d.s.localDatabase).Get(ctx, workspaceID)
	if err != nil {
		return workspace.Record{}, false
	}
	return localdb.WorkspaceToDomain(row), true
}

// ---- Instances ----

func (d *appDeps) CreateWorkspaceWithProgress(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
	return d.s.manager.CreateWorkspaceWithProgress(ctx, req, report)
}

func (d *appDeps) CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	return d.s.manager.CloseWorkspace(ctx, req)
}

func (d *appDeps) CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	return d.s.manager.CloseWorkspacePath(ctx, req)
}

func (d *appDeps) SetState(workspaceID string, state instance.State, health instance.Health) error {
	return d.s.manager.Instances().SetState(workspaceID, state, health)
}

func (d *appDeps) Get(workspaceID string) (workspace.Workspace, error) {
	return d.s.getWorkspace(workspaceID)
}

func (d *appDeps) RemoveFromMemory(workspaceID string) {
	d.s.manager.Instances().Remove(workspaceID)
}

func (d *appDeps) WatchAndTrack(workspaceID string, path string) {
	d.s.nodeApp.WatchAndTrack(workspaceID, path)
}

func (d *appDeps) Unwatch(path string) {
	d.s.watchers.Unwatch(path)
}

func (d *appDeps) StopTracking(workspaceID string) {
	d.s.prTracker.StopTracking(workspaceID)
}

// ---- Relay ----

func (d *appDeps) DispatchCreate(ctx context.Context, plan application.CreatePlan, command application.CreateCommand) error {
	return d.s.dispatchRemoteWorkspaceCreate(workspaceCreateParams(command), workspaceCreateStartedEvent(plan.StartedEvent))
}

func (d *appDeps) DispatchClose(ctx context.Context, command application.CloseCommand, targetNodeID string) error {
	payload := relayWorkspaceCloseEnvelope{
		OrganizationID: command.OrganizationID,
		ProjectID:      command.ProjectID,
		WorkspaceID:    command.WorkspaceID,
		SourceNodeID:   d.s.nodeID,
		TargetNodeID:   targetNodeID,
		Change:         relayChangeWorkspaceCloseRequest,
		Branch:         command.Branch,
		RemoveBranch:   command.RemoveBranch,
		ForceWorktree:  command.ForceWorktree,
		ForceBranch:    command.ForceBranch,
		PostHook:       command.PostHook,
	}
	return d.s.relayClient.SendDispatchRequest(payload, targetNodeID)
}

// ---- Events ----

func (d *appDeps) Publish(topic string, payload any) {
	d.s.events.Publish(internalevents.Event{Topic: topic, Payload: payload})
}

func (d *appDeps) SnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	d.s.nodeApp.PublishWorkspaceSnapshotChanged(organizationID, projectID, workspaceID, change)
}

func (d *appDeps) CreateStarted(event application.StartedEvent) {
	d.s.events.Publish(internalevents.Event{Topic: "workspaceCreateStarted", Payload: event})
}

func (d *appDeps) CreateProgress(plan application.CreatePlan, event workspace.CreateProgressEvent) {
	d.s.events.Publish(internalevents.Event{Topic: "workspaceCreateProgress", Payload: event})
	d.s.relayWorkspaceCreateProgress(plan, event)
}

func (d *appDeps) CreateFailed(plan application.CreatePlan, failed application.FailedEvent) {
	d.s.events.Publish(internalevents.Event{Topic: "workspaceCreateFailed", Payload: failed})
	d.s.relayWorkspaceCreateFailed(plan, workspaceCreateFailedEvent(failed))
}

func (d *appDeps) CreateCompleted(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
	d.s.publishWorkspaceCreateCompleted(plan, created, warnings)
}

// workspaceHandle builds a workspace-scoped handle from the instance registry
// and the manager's shared services (file cache, git, terminals).
func (s *Services) workspaceHandle(workspaceID string) (instance.Handle, error) {
	ws, ok := s.manager.Instances().Get(workspaceID)
	if !ok {
		return instance.Handle{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return s.handleForInstance(ws), nil
}

// workspaceHandleByPath resolves the canonical path and builds the handle for
// the instance at that path.
func (s *Services) workspaceHandleByPath(path string) (instance.Handle, error) {
	ws, ok := s.manager.Instances().GetByPath(path)
	if !ok {
		return instance.Handle{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return s.handleForInstance(ws), nil
}

func (s *Services) handleForInstance(ws workspace.Workspace) instance.Handle {
	return instance.NewHandle(ws, s.manager.Instances().Files(), s.manager.Gits(), s.manager.Terminals())
}

// getWorkspace returns the open instance for a workspace id, mapping a missing
// instance to the RPC not-found error (instance reads go through the registry).
func (s *Services) getWorkspace(workspaceID string) (workspace.Workspace, error) {
	ws, ok := s.manager.Instances().Get(workspaceID)
	if !ok {
		return workspace.Workspace{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return ws, nil
}
