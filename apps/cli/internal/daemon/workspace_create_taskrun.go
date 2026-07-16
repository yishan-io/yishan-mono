package daemon

import (
	"context"
	"strings"

	agentcmd "yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

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
