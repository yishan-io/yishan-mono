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
	h.maybeStartTaskRun(context.Background(), prepared, created)
	h.events.Publish(frontendEvent{Topic: "workspaceCreateCompleted", Payload: completionPayload})
	h.relayWorkspaceCreateCompleted(prepared, completionPayload)
}

func (h *JSONRPCHandler) maybeStartTaskRun(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) {
	if prepared.localCreate == nil || prepared.localCreate.TaskRun == nil {
		return
	}
	taskRun := prepared.localCreate.TaskRun
	cmd, buildErr := agentcmd.BuildRunCommand(taskRun.AgentKind, taskRun.Prompt, taskRun.Model, true)
	if buildErr != nil {
		log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to build agent command")
		return
	}
	resp, startErr := h.manager.Terminals().Start(ctx, created.Path, terminal.StartRequest{
		WorkspaceID: created.ID,
		TabID:       "task-" + created.ID,
		PaneID:      "pane-task-" + created.ID,
		Title:       buildTaskRunTerminalTitle(taskRun.Prompt, taskRun.AgentKind),
		AgentKind:   taskRun.AgentKind,
	})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to start terminal session")
		return
	}
	h.manager.Terminals().Send(terminal.SendRequest{SessionID: resp.SessionID, Input: shellCommandLine(cmd.Binary, cmd.Args) + "\r"})
	log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", taskRun.AgentKind).Str("prompt", taskRun.Prompt).Msg("task run: terminal session started")
}

func buildTaskRunTerminalTitle(prompt string, agentKind string) string {
	trimmedPrompt := strings.TrimSpace(prompt)
	if trimmedPrompt != "" {
		truncatedPrompt := truncateRunes(trimmedPrompt, 40)
		return "Task: " + truncatedPrompt
	}

	trimmedAgentKind := strings.TrimSpace(agentKind)
	if trimmedAgentKind != "" {
		return "Task Run - " + trimmedAgentKind
	}

	return "Task Run"
}

func truncateRunes(value string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
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
