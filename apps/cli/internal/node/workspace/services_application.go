package workspace

import (
	"context"
	"fmt"
	"strings"
	"time"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// nowRFC3339Nano formats the current UTC time in the wire protocol's timestamp
// shape. It is the Now dependency for the application Service.
func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

// appDeps implements the application port interfaces (Environment,
// WorkspaceRecords, Instances, Relay, Events) with the services layer's
// dependencies (manager, API client, SQLite store, relay client, event hub,
// watchers, PR tracker). The application Service owns orchestration; appDeps
// owns the mechanisms. This keeps the application package free of daemon and
// transport types.
type appDeps struct {
	s *Service
}

// newWorkspaceApplicationService wires the application Service for the
// services layer.
func (s *Service) newAppService() *application.Service {
	deps := &appDeps{s: s}
	return application.New(application.Dependencies{
		NodeID:                       s.deps.NodeID,
		Now:                          nowRFC3339Nano,
		Environment:                  deps,
		Records:                      deps,
		Instances:                    deps,
		Relay:                        deps,
		Events:                       deps,
		WorkspaceAvailabilityChanged: s.deps.WorkspaceAvailabilityChanged,
		HookWarnings: func(setupHook string, result *workspace.HookResult) []any {
			return buildHookWarnings(setupHook, result, s.deps.LogFilePath)
		},
		BeginAgentCleanup: func(ctx context.Context, workspaceID string) (any, error) {
			return s.beginAgentCleanup(ctx, workspaceID)
		},
		AbortAgentCleanup:  s.abortAgentCleanup,
		CommitAgentCleanup: s.commitAgentCleanup,
		SyncUsage: func(source string) {
			if s.deps.TokenUsage != nil {
				s.deps.TokenUsage.SyncNow(source)
			}
		},
		RegisterCleanup: func(req application.CleanupRequest) error {
			if s.deps.CleanupStore == nil {
				return nil
			}
			return s.deps.CleanupStore.Add(sqlite.PendingWorkspaceCleanup{
				WorkspaceID: req.WorkspaceID, Path: req.Path, Branch: req.Branch,
				RemoveBranch: req.RemoveBranch, ForceWorktree: req.ForceWorktree,
				ForceBranch: req.ForceBranch, PostHook: req.PostHook, AgentSummaryDone: req.AgentSummaryDone,
			})
		},
		RemoveCleanup: func(workspaceID string) error {
			if s.deps.CleanupStore == nil {
				return nil
			}
			return s.deps.CleanupStore.Remove(workspaceID)
		},
		ClaimAgentSummary: func(workspaceID string) (bool, error) {
			if s.deps.CleanupStore == nil {
				return false, nil
			}
			return s.deps.CleanupStore.ClaimAgentSummary(workspaceID)
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if s.deps.CleanupStore == nil {
				return nil
			}
			return s.deps.CleanupStore.MarkFailure(workspaceID, cleanupErr)
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
	return d.s.deps.Session != nil && d.s.deps.Session.APIConfigured()
}

func (d *appDeps) ListProjects(ctx context.Context, organizationID string) ([]application.Project, error) {
	runtime := d.s.deps.Session
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
	if d.s.deps.Session == nil || !d.s.deps.Session.APIConfigured() {
		return nil, fmt.Errorf("load project workspaces: no authenticated API session")
	}
	response, err := d.s.deps.Session.APIClient().ListWorkspaces(organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("load project workspaces: %w", err)
	}
	records := make([]workspace.Record, 0, len(response.Workspaces))
	for _, item := range response.Workspaces {
		records = append(records, cloud.WorkspaceToDomain(item))
	}
	return records, nil
}

func (d *appDeps) ListNodes(ctx context.Context, organizationID string) ([]application.Node, error) {
	if d.s.deps.Session == nil || !d.s.deps.Session.APIConfigured() {
		return nil, fmt.Errorf("load organization nodes: no authenticated API session")
	}
	response, err := d.s.deps.Session.APIClient().ListNodes(organizationID)
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
	d.s.CreateRecord(ctx, registration)
}

func (d *appDeps) UpdateRemoteRecord(ctx context.Context, registration application.Registration, localPath string) {
	d.s.UpdateRecord(ctx, registration, localPath)
}

func (d *appDeps) CloseRemoteRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status workspace.Status) {
	d.s.CloseRecord(ctx, organizationID, projectID, workspaceID, string(status))
}

func (d *appDeps) PersistPrepared(ctx context.Context, plan application.CreatePlan) error {
	return d.s.PersistPlan(ctx, plan)
}

func (d *appDeps) FinalizePersisted(ctx context.Context, plan application.CreatePlan, created workspace.Workspace) error {
	return d.s.Finalize(ctx, plan, created)
}

func (d *appDeps) ClosePersisted(ctx context.Context, workspaceID string) error {
	return d.s.MarkClosed(ctx, workspaceID)
}

func (d *appDeps) LocalRow(ctx context.Context, workspaceID string) (workspace.Record, bool) {
	if d.s.deps.Database == nil {
		return workspace.Record{}, false
	}
	row, err := sqlite.NewWorkspaceStore(d.s.deps.Database).Get(ctx, workspaceID)
	if err != nil {
		return workspace.Record{}, false
	}
	return sqlite.WorkspaceToDomain(row), true
}

// ---- Instances ----

func (d *appDeps) CreateWorkspaceWithProgress(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
	return application.CreateWorkspace(d.s.deps.Registry, ctx, req, report)
}

func (d *appDeps) StopWorkspaceTerminals(workspaceID string) []string {
	return d.s.stopWorkspaceTerminals(workspaceID)
}

func (d *appDeps) CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	return d.s.closeWorkspace(ctx, req)
}

func (d *appDeps) CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	return d.s.ClosePath(ctx, req)
}

func (d *appDeps) SetState(workspaceID string, state instance.State, health instance.Health) error {
	return d.s.deps.Registry.SetState(workspaceID, state, health)
}
func (d *appDeps) Get(workspaceID string) (workspace.Workspace, error) {
	if d.s.deps.Registry == nil {
		return workspace.Workspace{}, fmt.Errorf("workspace runtime is unavailable")
	}
	return d.s.GetWorkspace(workspaceID)
}

func (d *appDeps) RemoveFromMemory(workspaceID string) {
	if d.s.deps.Registry != nil {
		d.s.deps.Registry.Remove(workspaceID)
	}
}

func (d *appDeps) WatchAndTrack(ws workspace.Workspace) error {
	return d.s.WatchAndTrack(ws)
}

func (d *appDeps) Unwatch(path string) {
	if d.s.deps.Watchers != nil {
		d.s.deps.Watchers.Unwatch(path)
	}
}

func (d *appDeps) StopTracking(workspaceID string) {
	if d.s.deps.PRTracker != nil {
		d.s.deps.PRTracker.StopTracking(workspaceID)
	}
}

// ---- Relay ----

func (d *appDeps) DispatchCreate(ctx context.Context, plan application.CreatePlan, command application.CreateCommand) error {
	return d.s.dispatchCreate(workspaceCreateParams(command), workspaceCreateStartedEvent(plan.StartedEvent))
}

func (d *appDeps) DispatchClose(ctx context.Context, command application.CloseCommand, targetNodeID string) error {
	payload := relayWorkspaceCloseEnvelope{
		OrganizationID: command.OrganizationID,
		ProjectID:      command.ProjectID,
		WorkspaceID:    command.WorkspaceID,
		SourceNodeID:   d.s.deps.NodeID,
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
	d.s.deps.Events.Publish(eventbus.Event{Topic: topic, Payload: payload})
}

func (d *appDeps) SnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	d.s.PublishSnapshotChanged(organizationID, projectID, workspaceID, change)
}

func (d *appDeps) CreateStarted(event application.StartedEvent) {
	d.s.deps.Events.Publish(eventbus.Event{Topic: "workspaceCreateStarted", Payload: event})
}

func (d *appDeps) CreateProgress(plan application.CreatePlan, event workspace.CreateProgressEvent) {
	d.s.deps.Events.Publish(eventbus.Event{Topic: "workspaceCreateProgress", Payload: event})
	d.s.relayCreateProgress(plan, event)
}

func (d *appDeps) CreateFailed(plan application.CreatePlan, failed application.FailedEvent) {
	d.s.deps.Events.Publish(eventbus.Event{Topic: "workspaceCreateFailed", Payload: failed})
	d.s.relayCreateFailed(plan, workspaceCreateFailedEvent(failed))
}

func (d *appDeps) CreateCompleted(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
	if d.s.deps.CreateCompleted != nil {
		d.s.deps.CreateCompleted(plan, created, warnings)
	}
}

func buildHookWarnings(command string, result *workspace.HookResult, logFilePath string) []any {
	warnings := []any{}
	if result != nil && result.Error != "" {
		warnings = append(warnings, hookResultToWarning("setup", command, result, logFilePath))
	}
	return warnings
}

func hookResultToWarning(scriptKind string, command string, hr *workspace.HookResult, logFilePath string) map[string]any {
	var exitCode any
	if hr.ExitCode >= 0 {
		exitCode = hr.ExitCode
	}

	timedOut := false
	if hr.Error != "" {
		timedOut = strings.Contains(hr.Error, "timed out")
	}

	var logFileValue any
	if logFilePath != "" {
		logFileValue = logFilePath
	}

	return map[string]any{
		"scriptKind":    scriptKind,
		"timedOut":      timedOut,
		"message":       hr.Error,
		"command":       command,
		"stdoutExcerpt": hr.Stdout,
		"stderrExcerpt": hr.Stderr,
		"exitCode":      exitCode,
		"signal":        nil,
		"logFilePath":   logFileValue,
	}
}
