package daemon

import (
	"context"
	"encoding/json"
	"fmt"

	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatch(ctx context.Context, client *wsClient, method string, params json.RawMessage) (any, error) {
	switch method {
	case "daemon.ping":
		return map[string]string{"status": "ok"}, nil
	case "workspace.open":
		var req workspace.OpenRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Open(req)
	case "workspace.list":
		return h.manager.List(), nil
	case "workspace.file.read":
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileRead(req.WorkspaceID, req.Path)
	case "workspace.file.list":
		var req fileListParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileList(req.WorkspaceID, req.Path)
	case "workspace.file.stat":
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileStat(req.WorkspaceID, req.Path)
	case "workspace.file.write":
		var req fileWriteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileWrite(req.WorkspaceID, req.Path, req.Content, req.Mode)
	case "workspace.file.delete":
		var req fileDeleteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileDelete(req.WorkspaceID, req.Path, req.Recursive); err != nil {
			return nil, err
		}
		return map[string]bool{"deleted": true}, nil
	case "workspace.file.move":
		var req fileMoveParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMove(req.WorkspaceID, req.FromPath, req.ToPath); err != nil {
			return nil, err
		}
		return map[string]bool{"moved": true}, nil
	case "workspace.file.mkdir":
		var req fileMkdirParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMkdir(req.WorkspaceID, req.Path, req.Parents, req.Mode); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case "workspace.file.diff":
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileReadDiff(ctx, req.WorkspaceID, req.Path)
	case "workspace.git.status":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitStatus(ctx, req.WorkspaceID)
	case "workspace.git.listChanges":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListChanges(ctx, req.WorkspaceID)
	case "workspace.git.track":
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitTrackChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"tracked": true}, nil
	case "workspace.git.unstage":
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitUnstageChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"unstaged": true}, nil
	case "workspace.git.revert":
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRevertChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"reverted": true}, nil
	case "workspace.git.commit":
		var req gitCommitParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitCommitChanges(ctx, req.WorkspaceID, req.Message, req.Amend, req.Signoff)
	case "workspace.git.branchStatus":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitBranchStatus(ctx, req.WorkspaceID)
	case "workspace.git.commitsToTarget":
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListCommitsToTarget(ctx, req.WorkspaceID, req.TargetBranch)
	case "workspace.git.commitDiff":
		var req gitCommitDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadCommitDiff(ctx, req.WorkspaceID, req.CommitHash, req.Path)
	case "workspace.git.branchDiff":
		var req gitBranchDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadBranchComparisonDiff(ctx, req.WorkspaceID, req.TargetBranch, req.Path)
	case "workspace.git.branches":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListBranches(ctx, req.WorkspaceID)
	case "workspace.git.push":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPushBranch(ctx, req.WorkspaceID)
	case "workspace.git.publish":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPublishBranch(ctx, req.WorkspaceID)
	case "workspace.git.renameBranch":
		var req gitRenameBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRenameBranch(ctx, req.WorkspaceID, req.NextBranch); err != nil {
			return nil, err
		}
		return map[string]bool{"renamed": true}, nil
	case "workspace.git.removeBranch":
		var req gitRemoveBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveBranch(ctx, req.WorkspaceID, req.Branch, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case "workspace.git.worktree.create":
		var req gitCreateWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitCreateWorktree(ctx, req.WorkspaceID, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case "workspace.git.worktree.remove":
		var req gitRemoveWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveWorktree(ctx, req.WorkspaceID, req.WorktreePath, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case "workspace.git.authorName":
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitAuthorName(ctx, req.WorkspaceID)
	case "workspace.terminal.start":
		var req workspace.TerminalStartRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalStart(ctx, req)
	case "workspace.terminal.send":
		var req workspace.TerminalSendRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalSend(req)
	case "workspace.terminal.read":
		var req workspace.TerminalReadRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalRead(req)
	case "workspace.terminal.stop":
		var req workspace.TerminalStopRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalStop(req)
	case "workspace.terminal.resize":
		var req workspace.TerminalResizeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalResize(req)
	case "workspace.terminal.subscribe":
		var req workspace.TerminalSubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		subscription, err := h.manager.TerminalSubscribe(req)
		if err != nil {
			return nil, err
		}
		client.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
			_, _ = h.manager.TerminalUnsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
		})
		return workspace.TerminalSubscribeResponse{Subscribed: true}, nil
	case "workspace.terminal.unsubscribe":
		var req workspace.TerminalUnsubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		client.DetachSubscription(req.SessionID)
		return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
	default:
		return nil, workspace.NewRPCError(-32601, fmt.Sprintf("method not found: %s", method))
	}
}
