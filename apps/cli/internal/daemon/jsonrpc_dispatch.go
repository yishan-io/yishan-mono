package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatch(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDaemonPing:
		return map[string]string{"status": "ok"}, nil
	case MethodOpen:
		var req workspace.OpenRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Open(req)
	case MethodList:
		return h.manager.List(), nil
	case MethodWorkspaceCreate:
		var req workspace.CreateRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		created, err := h.manager.CreateWorkspace(ctx, req)
		if err != nil {
			return nil, err
		}
		if req.ProjectID != "" {
			if err := createRemoteWorkspace(ctx, WorkspaceCreation{
				NodeID:         h.nodeID,
				OrganizationID: req.OrganizationID,
				ProjectID:      req.ProjectID,
				Kind:           "worktree",
				Branch:         req.TargetBranch,
				SourceBranch:   req.SourceBranch,
				LocalPath:      created.Path,
			}); err != nil {
				return nil, err
			}
		}
		warnings := []any{}
		if created.SetupHookResult != nil && created.SetupHookResult.Error != "" {
			warnings = append(warnings, hookResultToWarning("setup", req.SetupHook, created.SetupHookResult))
		}
		return map[string]any{
			"id":                      created.ID,
			"path":                    created.Path,
			"setupHookResult":         created.SetupHookResult,
			"lifecycleScriptWarnings": warnings,
		}, nil
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.SyncContextLink(req)
	case MethodWorkspaceClose:
		var req workspaceCloseParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		closeResult, err := h.manager.CloseWorkspace(ctx, workspace.CloseRequest{
			WorkspaceID:   req.WorkspaceID,
			Branch:        req.Branch,
			RemoveBranch:  req.RemoveBranch,
			ForceWorktree: req.ForceWorktree,
			ForceBranch:   req.ForceBranch,
			PostHook:      req.PostHook,
		})
		if err != nil {
			return nil, err
		}
		if req.ProjectID != "" {
			if err := closeRemoteWorkspace(ctx, WorkspaceClose{
				NodeID:         h.nodeID,
				OrganizationID: req.OrganizationID,
				ProjectID:      req.ProjectID,
				Kind:           "worktree",
				Branch:         req.Branch,
				LocalPath:      req.WorktreePath,
			}); err != nil {
				return nil, err
			}
		}
		warnings := []any{}
		if closeResult.PostHookResult != nil && closeResult.PostHookResult.Error != "" {
			warnings = append(warnings, hookResultToWarning("post", req.PostHook, closeResult.PostHookResult))
		}
		result := map[string]any{
			"workspace":               map[string]string{"id": req.WorkspaceID, "status": "closed"},
			"workspaceId":             req.WorkspaceID,
			"lifecycleScriptWarnings": warnings,
		}
		if closeResult.PostHookResult != nil {
			result["postHookResult"] = closeResult.PostHookResult
		}
		return result, nil
	case MethodAgentListDetectionStatuses:
		return ListAgentCLIDetectionStatuses(), nil
	case MethodFrontendEventsStream:
		subscriptionID, events := h.events.Subscribe()
		connState.AttachEventStream(events, func() {
			h.events.Unsubscribe(subscriptionID)
		})
		return map[string]bool{"subscribed": true}, nil
	case MethodFileRead:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileRead(req.WorkspaceID, req.Path)
	case MethodFileList:
		var req fileListParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileList(req.WorkspaceID, req.Path, req.Recursive)
	case MethodFileStat:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileStat(req.WorkspaceID, req.Path)
	case MethodFileWrite:
		var req fileWriteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileWrite(req.WorkspaceID, req.Path, req.Content, req.Mode)
	case MethodFileDelete:
		var req fileDeleteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileDelete(req.WorkspaceID, req.Path, req.Recursive); err != nil {
			return nil, err
		}
		return map[string]bool{"deleted": true}, nil
	case MethodFileMove:
		var req fileMoveParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMove(req.WorkspaceID, req.FromPath, req.ToPath); err != nil {
			return nil, err
		}
		return map[string]bool{"moved": true}, nil
	case MethodFileMkdir:
		var req fileMkdirParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMkdir(req.WorkspaceID, req.Path, req.Parents, req.Mode); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodFileDiff:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileReadDiff(ctx, req.WorkspaceID, req.Path)
	case MethodGitStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitStatus(ctx, req.WorkspaceID)
	case MethodGitInspect:
		var req gitInspectParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitInspect(ctx, req.Path)
	case MethodGitListChanges:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListChanges(ctx, req.WorkspaceID)
	case MethodGitTrack:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitTrackChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"tracked": true}, nil
	case MethodGitUnstage:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitUnstageChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"unstaged": true}, nil
	case MethodGitRevert:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRevertChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"reverted": true}, nil
	case MethodGitCommit:
		var req gitCommitParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitCommitChanges(ctx, req.WorkspaceID, req.Message, req.Amend, req.Signoff)
	case MethodGitBranchStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitBranchStatus(ctx, req.WorkspaceID)
	case MethodGitCommitsToTarget:
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListCommitsToTarget(ctx, req.WorkspaceID, req.TargetBranch)
	case MethodGitCommitDiff:
		var req gitCommitDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadCommitDiff(ctx, req.WorkspaceID, req.CommitHash, req.Path)
	case MethodGitBranchDiff:
		var req gitBranchDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadBranchComparisonDiff(ctx, req.WorkspaceID, req.TargetBranch, req.Path)
	case MethodGitBranches:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListBranches(ctx, req.WorkspaceID)
	case MethodGitPush:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPushBranch(ctx, req.WorkspaceID)
	case MethodGitPublish:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPublishBranch(ctx, req.WorkspaceID)
	case MethodGitRenameBranch:
		var req gitRenameBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRenameBranch(ctx, req.WorkspaceID, req.NextBranch); err != nil {
			return nil, err
		}
		return map[string]bool{"renamed": true}, nil
	case MethodGitRemoveBranch:
		var req gitRemoveBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveBranch(ctx, req.WorkspaceID, req.Branch, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitWorktreeCreate:
		var req gitCreateWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitCreateWorktree(ctx, req.WorkspaceID, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodGitWorktreeRemove:
		var req gitRemoveWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveWorktree(ctx, req.WorkspaceID, req.WorktreePath, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitAuthorName:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitAuthorName(ctx, req.WorkspaceID)
	case MethodTerminalStart:
		var req workspace.TerminalStartRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalStart(ctx, req)
	case MethodTerminalSend:
		var req workspace.TerminalSendRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalSend(req)
	case MethodTerminalRead:
		var req workspace.TerminalReadRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalRead(req)
	case MethodTerminalStop:
		var req workspace.TerminalStopRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalStop(req)
	case MethodTerminalListSessions:
		var req workspace.TerminalListSessionsRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalListSessions(req), nil
	case MethodTerminalListPorts:
		return h.manager.TerminalListDetectedPorts(), nil
	case MethodTerminalResize:
		var req workspace.TerminalResizeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalResize(req)
	case MethodTerminalSubscribe:
		var req workspace.TerminalSubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		subscription, err := h.manager.TerminalSubscribe(req)
		if err != nil {
			return nil, err
		}
		connState.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
			_, _ = h.manager.TerminalUnsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
		})
		return workspace.TerminalSubscribeResponse{Subscribed: true}, nil
	case MethodTerminalUnsubscribe:
		var req workspace.TerminalUnsubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		connState.DetachSubscription(req.SessionID)
		return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
	default:
		return nil, workspace.NewRPCError(-32601, fmt.Sprintf("method not found: %s", method))
	}
}

// hookResultToWarning converts a HookResult into the structured warning shape
// that the desktop UI expects for lifecycle script warnings.
func hookResultToWarning(scriptKind string, command string, hr *workspace.HookResult) map[string]any {
	var exitCode any
	if hr.ExitCode >= 0 {
		exitCode = hr.ExitCode
	}

	timedOut := false
	if hr.Error != "" {
		timedOut = strings.Contains(hr.Error, "timed out")
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
		"logFilePath":   nil,
	}
}
