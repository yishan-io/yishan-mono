package daemon

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	agentcmd "yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"
	"yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	prepared, err := h.prepareWorkspaceCreate(ctx, req)
	if err != nil {
		return nil, err
	}
	prepared, err = h.registerPreparedWorkspace(ctx, prepared, "")
	if err != nil {
		return nil, err
	}
	h.events.Publish(frontendEvent{Topic: "workspaceCreateStarted", Payload: prepared.startedEvent})

	go h.executeWorkspaceCreate(context.Background(), prepared)

	return map[string]any{"id": prepared.workspaceID, "status": "pending"}, nil
}

func (h *JSONRPCHandler) executeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", prepared.workspaceID).Msg("panic in executeWorkspaceCreate")
		}
	}()

	createflow.ExecutePreparedPlan(ctx, createflow.PreparedPlan{
		WorkspaceID:   prepared.workspaceID,
		LocalCreate:   prepared.localCreate,
		RemoteRequest: prepared.remoteRequest,
	}, createflow.ExecutePreparedPlanDependencies{
		Now:            nowRFC3339Nano,
		DispatchRemote: h.dispatchRemoteWorkspaceCreate,
		RollbackRegistration: func(ctx context.Context) {
			h.rollbackWorkspaceCreateRegistration(ctx, prepared)
		},
		ExecuteLocalCreate: func(ctx context.Context, report workspace.CreateProgressReporter) error {
			return h.executeWorktreeWorkspaceCreate(ctx, prepared, report)
		},
		PublishProgress: func(event workspace.CreateProgressEvent) {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
			h.relayWorkspaceCreateProgress(prepared, event)
		},
		PublishFailed: func(failed createflow.WorkspaceCreateFailedEvent) {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateFailed", Payload: failed})
			h.relayWorkspaceCreateFailed(prepared, workspaceCreateFailedEvent(failed))
		},
	})
}

func (h *JSONRPCHandler) executeWorktreeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate, reportProgress workspace.CreateProgressReporter) error {
	return createflow.ExecuteLocalCreate(ctx, prepared.workspaceID, *prepared.localCreate, createflow.ExecuteLocalCreateDependencies{
		Now:                         nowRFC3339Nano,
		CreateWorkspaceWithProgress: h.manager.CreateWorkspaceWithProgress,
		RollbackRegistration: func(ctx context.Context) {
			h.rollbackWorkspaceCreateRegistration(ctx, prepared)
		},
		FinalizeLocalCreate: func(ctx context.Context, created workspace.Workspace) error {
			h.watchAndTrack(created.ID, created.Path)
			h.upsertWorkspaceIndex(created)
			if err := h.updatePreparedWorkspace(ctx, prepared, created.Path); err != nil {
				h.rollbackWorkspaceCreateFailure(ctx, prepared, created)
				return err
			}
			return nil
		},
		PublishProgress: reportProgress,
		PublishCompleted: func(created workspace.Workspace) {
			warnings := buildWorkspaceHookWarnings(prepared.localCreate.SetupHook, created.SetupHookResult, h.logFilePath)
			h.publishWorkspaceCreateCompleted(prepared, created, warnings)
		},
	}, reportProgress)
}

func applyAuthoritativeWorkspaceID(prepared preparedWorkspaceCreate, workspaceID string) preparedWorkspaceCreate {
	normalizedWorkspaceID := strings.TrimSpace(workspaceID)
	if normalizedWorkspaceID == "" {
		return prepared
	}
	prepared.workspaceID = normalizedWorkspaceID
	prepared.startedEvent.WorkspaceID = normalizedWorkspaceID
	if prepared.registration != nil {
		prepared.registration.ID = normalizedWorkspaceID
	}
	if prepared.localCreate != nil {
		prepared.localCreate.ID = normalizedWorkspaceID
	}
	if prepared.remoteRequest != nil {
		prepared.remoteRequest.ID = normalizedWorkspaceID
	}
	return prepared
}

func (h *JSONRPCHandler) registerPreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) (preparedWorkspaceCreate, error) {
	if prepared.registration == nil {
		return prepared, nil
	}
	registration := *prepared.registration
	registration.LocalPath = localPath
	registeredWorkspace, err := registerWorkspace(ctx, h.runtime, registration)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	prepared = applyAuthoritativeWorkspaceID(prepared, registeredWorkspace.ID)
	if strings.TrimSpace(registeredWorkspace.ID) != "" {
		h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.workspaceID, "created")
	}
	return prepared, nil
}

func (h *JSONRPCHandler) updatePreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) error {
	if prepared.registration == nil {
		return nil
	}
	if err := updateWorkspace(ctx, h.runtime, *prepared.registration, localPath); err != nil {
		return err
	}
	h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.registration.ID, "updated")
	return nil
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if prepared.registration == nil {
		return
	}
	if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
		WorkspaceID:    prepared.registration.ID,
		SourceNodeID:   prepared.registration.SourceNodeID,
		OrganizationID: prepared.organizationID,
		ProjectID:      prepared.projectID,
	}); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create registration")
	}
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateFailure(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) {
	if prepared.registration != nil {
		if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
			WorkspaceID:    prepared.registration.ID,
			SourceNodeID:   prepared.registration.SourceNodeID,
			OrganizationID: prepared.organizationID,
			ProjectID:      prepared.projectID,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create rollback")
		}
	}

	closeReq := createflow.BuildCreateFailureClosePathRequest(created, prepared.localCreate.TargetBranch)
	h.cleanupLocalWorkspaceCreateFailure(ctx, closeReq)
}

func (h *JSONRPCHandler) cleanupLocalWorkspaceCreateFailure(ctx context.Context, closeReq workspace.ClosePathRequest) {
	createflow.CleanupLocalWorkspaceCreateFailure(ctx, createflow.CleanupDependencies{
		Unwatch:      h.watchers.Unwatch,
		StopTracking: h.prTracker.StopTracking,
		RegisterCleanup: func(req workspace.ClosePathRequest) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Add(pendingWorkspaceCleanup{
				WorkspaceID:   req.WorkspaceID,
				Path:          req.Path,
				Branch:        req.Branch,
				RemoveBranch:  req.RemoveBranch,
				ForceWorktree: req.ForceWorktree,
				ForceBranch:   req.ForceBranch,
				PostHook:      req.PostHook,
			})
		},
		CloseWorkspacePath: func(ctx context.Context, req workspace.ClosePathRequest) error {
			_, err := h.manager.CloseWorkspacePath(ctx, req)
			return err
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.MarkFailure(workspaceID, cleanupErr)
		},
		RemoveRegisteredCleanup: func(workspaceID string) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Remove(workspaceID)
		},
		RemoveWorkspaceFromMemory: h.manager.RemoveWorkspaceFromMemory,
		RemoveWorkspaceIndex: func(workspaceID string) error {
			if h.wsIndexStore == nil {
				return nil
			}
			return h.wsIndexStore.Remove(workspaceID)
		},
		ClearAgentUsage: h.clearAgentUsage,
		Warn: func(workspaceID string, path string, message string, err error) {
			entry := log.Warn().Err(err).Str("workspaceId", workspaceID)
			if strings.TrimSpace(path) != "" {
				entry = entry.Str("path", path)
			}
			entry.Msg(message)
		},
	}, closeReq)
}

func (h *JSONRPCHandler) publishWorkspaceSnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" || strings.TrimSpace(workspaceID) == "" {
		return
	}

	h.events.Publish(frontendEvent{Topic: "workspaceSnapshotChanged", Payload: map[string]any{
		"organizationId": organizationID,
		"resource":       "workspace",
		"change":         change,
		"projectId":      projectID,
		"workspaceId":    workspaceID,
	}})
}

func (h *JSONRPCHandler) upsertWorkspaceIndex(created workspace.Workspace) {
	if h.wsIndexStore == nil || created.Path == "" {
		return
	}
	if err := h.wsIndexStore.Upsert(workspaceIndexEntry{WorkspaceID: created.ID, WorktreePath: created.Path, ProjectID: created.ProjectID, OrgID: created.OrgID, State: created.State}); err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("workspace index store upsert failed on create")
	}
}

func (h *JSONRPCHandler) publishWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, created workspace.Workspace, warnings []any) {
	completionPayload := map[string]any{"workspaceId": created.ID, "worktreePath": created.Path, "lifecycleScriptWarnings": warnings}
	h.maybeStartTaskRun(context.Background(), prepared, created, completionPayload)
	h.events.Publish(frontendEvent{Topic: "workspaceCreateCompleted", Payload: completionPayload})
	h.relayWorkspaceCreateCompleted(prepared, completionPayload)
}

func (h *JSONRPCHandler) maybeStartTaskRun(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace, completionPayload map[string]any) {
	if prepared.localCreate == nil || prepared.localCreate.TaskRun == nil {
		return
	}
	cmd, buildErr := agentcmd.BuildRunCommand(prepared.localCreate.TaskRun.AgentKind, prepared.localCreate.TaskRun.Prompt, prepared.localCreate.TaskRun.Model, true)
	if buildErr != nil {
		log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Msg("task run: failed to build agent command")
		return
	}
	resp, startErr := h.manager.Terminals().Start(ctx, created.Path, terminal.StartRequest{WorkspaceID: created.ID, TabID: "task-" + created.ID, PaneID: "pane-task-" + created.ID})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Msg("task run: failed to start terminal session")
		return
	}
	h.manager.Terminals().Send(terminal.SendRequest{SessionID: resp.SessionID, Input: shellCommandLine(cmd.Binary, cmd.Args) + "\r"})
	completionPayload["taskRunSessionId"] = resp.SessionID
	completionPayload["taskRunAgentKind"] = prepared.localCreate.TaskRun.AgentKind
	completionPayload["taskRunPrompt"] = prepared.localCreate.TaskRun.Prompt
	completionPayload["taskRunTabId"] = "task-" + created.ID
	completionPayload["taskRunPaneId"] = "pane-task-" + created.ID
	log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Str("prompt", prepared.localCreate.TaskRun.Prompt).Msg("task run: terminal session started")
}

func buildWorkspaceHookWarnings(command string, result *workspace.HookResult, logFilePath string) []any {
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

func generateWorkspaceID() string {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
			uint32(time.Now().UnixNano()),
			uint16(time.Now().UnixNano()>>16),
			0x4000,
			0x8000,
			uint64(time.Now().UnixNano()))
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
}

func shellCommandLine(binary string, args []string) string {
	var b strings.Builder
	b.WriteString(binary)
	for _, arg := range args {
		b.WriteByte(' ')
		if strings.ContainsAny(arg, " \t\n\r'\"") {
			b.WriteByte('\'')
			b.WriteString(strings.ReplaceAll(arg, "'", "'\\''"))
			b.WriteByte('\'')
		} else {
			b.WriteString(arg)
		}
	}
	return b.String()
}
