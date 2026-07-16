package daemon

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/workspace"
)

func restoreIndexedWorkspaces(handler *JSONRPCHandler) error {
	if handler == nil || handler.wsIndexStore == nil {
		return nil
	}

	entries, err := handler.wsIndexStore.List()
	if err != nil {
		return err
	}

	for _, entry := range entries {
		workspaceID := entry.WorkspaceID
		worktreePath := entry.WorktreePath
		if workspaceID == "" || worktreePath == "" {
			continue
		}

		ws, openErr := handler.manager.Open(workspace.OpenRequest{
			ID:        workspaceID,
			Path:      worktreePath,
			ProjectID: entry.ProjectID,
			OrgID:     entry.OrgID,
		})
		if openErr != nil {
			log.Warn().Err(openErr).Str("workspaceId", workspaceID).Str("path", worktreePath).Msg("failed to restore indexed workspace")
			if handler.wsIndexStore != nil {
				if os.IsNotExist(openErr) {
					if removeErr := handler.wsIndexStore.Remove(workspaceID); removeErr != nil {
						log.Warn().Err(removeErr).Str("workspaceId", workspaceID).Msg("failed to prune missing workspace index entry")
					}
				} else if upsertErr := handler.wsIndexStore.Upsert(workspaceIndexEntry{
					WorkspaceID:  workspaceID,
					WorktreePath: worktreePath,
					ProjectID:    entry.ProjectID,
					OrgID:        entry.OrgID,
					State:        workspace.WorkspaceStateStaleIndex,
					Error:        openErr.Error(),
				}); upsertErr != nil {
					log.Warn().Err(upsertErr).Str("workspaceId", workspaceID).Msg("failed to update stale index entry")
				}
			}
			continue
		}

		handler.upsertActiveWorkspaceIndexEntry(ws)
		handler.watchAndTrack(ws.ID, ws.Path)
		log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("restored indexed workspace")
	}

	return nil
}

func buildRunAgentFunc() memory.RunAgentFunc {
	return BuildRunAgentFunc()
}

func BuildRunAgentFunc() memory.RunAgentFunc {
	return func(ctx context.Context, agentKind, model, prompt, workDir string) (string, error) {
		cmd, err := agentcmd.ResolveCommand(agentKind, prompt, model, false)
		if err != nil {
			if errors.Is(err, agentcmd.ErrBinaryNotFound) {
				return "", fmt.Errorf("%w: %s", memory.ErrAgentNotFound, agentKind)
			}
			return "", fmt.Errorf("run %s: %w", agentKind, err)
		}
		execCmd := exec.CommandContext(ctx, cmd.ResolvedBinary, cmd.Args...)
		execCmd.Env = append(cmd.Env, cmd.ExtraEnv...)
		if workDir != "" {
			execCmd.Dir = workDir
		}
		out, err := execCmd.Output()
		if err != nil {
			return "", fmt.Errorf("run %s: %w", cmd.ResolvedBinary, err)
		}
		return string(out), nil
	}
}
