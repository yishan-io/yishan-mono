package daemon

import (
	"context"
	"encoding/json"
	"strings"

	agentcmd "yishan/apps/cli/internal/agent/command"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

// taskRunSessionInfo describes a task run started as a Pi RPC session (agent
// chat tab). Non-nil only when the chat-tab path was taken; the desktop uses
// it to open the agent chat tab for the run.
type taskRunSessionInfo struct {
	sessionID string
	title     string
}

func (h *JSONRPCHandler) publishWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, created workspace.Workspace, warnings []any) {
	completionPayload := map[string]any{"workspaceId": created.ID, "worktreePath": created.Path, "lifecycleScriptWarnings": warnings}
	taskRunStatus, taskRunSession := h.maybeStartTaskRun(prepared, created)
	if taskRunStatus != "" {
		completionPayload["taskRunStatus"] = taskRunStatus
	}
	if taskRunSession != nil {
		completionPayload["taskRunSessionId"] = taskRunSession.sessionID
		completionPayload["taskRunTitle"] = taskRunSession.title
	}
	h.events.Publish(frontendEvent{Topic: "workspaceCreateCompleted", Payload: completionPayload})
	h.relayWorkspaceCreateCompleted(prepared, completionPayload)
}

// maybeStartTaskRun starts the task run attached to a workspace create.
//
// When a desktop UI is connected to this daemon, the run executes as a Pi RPC
// session so the desktop can show it as an agent chat tab. Otherwise (headless
// daemon, remote service node) the run executes in a terminal via the agent
// CLI, matching the pre-existing behavior.
func (h *JSONRPCHandler) maybeStartTaskRun(prepared preparedWorkspaceCreate, created workspace.Workspace) (string, *taskRunSessionInfo) {
	if prepared.LocalCreate == nil || prepared.LocalCreate.TaskRun == nil {
		return "", nil
	}
	taskRun := prepared.LocalCreate.TaskRun
	if h.hasDesktopUI() {
		return h.startTaskRunChatSession(created, taskRun)
	}
	return h.startTaskRunTerminal(created, taskRun), nil
}

func (h *JSONRPCHandler) startTaskRunChatSession(created workspace.Workspace, taskRun *workspace.TaskRunConfig) (string, *taskRunSessionInfo) {
	sessionID := "task-" + created.ID
	tabID := sessionID
	paneID := "pane-" + sessionID

	args := []string{"--mode", "rpc", "--name", tabID, "--approve", "--session-id", sessionID}
	if strings.TrimSpace(taskRun.Model) != "" {
		args = append(args, "--model", strings.TrimSpace(taskRun.Model))
	}
	extraEnv, err := buildPiStartExtraEnv(piStartParams{
		TabID:       tabID,
		PaneID:      paneID,
		WorkspaceID: created.ID,
	})
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to build pi session env")
		return "failed", nil
	}

	if err := h.agentLifecycleCtx.Err(); err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: daemon is shutting down")
		return "failed", nil
	}
	session, startErr := h.agentMgr.Start(h.agentLifecycleCtx, agentmanager.StartOptions{
		SessionID:   sessionID,
		TabID:       tabID,
		WorkspaceID: created.ID,
		Binary:      "pi",
		Args:        args,
		CWD:         created.Path,
		ExtraEnv:    extraEnv,
		OnEvent:     h.makePiEventCallback(sessionID),
	})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("sessionId", sessionID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to start pi session")
		return "failed", nil
	}

	h.piSessions.Register(sessionID, nil, session, tabID, created.ID, created.Path, true)

	promptCmd, marshalErr := json.Marshal(map[string]any{"type": "prompt", "message": taskRun.Prompt})
	if marshalErr != nil {
		h.cleanupTaskRunSession(sessionID)
		log.Warn().Err(marshalErr).Str("workspaceId", created.ID).Msg("task run: failed to encode prompt")
		return "failed", nil
	}
	if sendErr := session.Send(promptCmd); sendErr != nil {
		h.cleanupTaskRunSession(sessionID)
		log.Warn().Err(sendErr).Str("workspaceId", created.ID).Str("sessionId", sessionID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to send prompt to pi session")
		return "failed", nil
	}
	log.Info().Str("workspaceId", created.ID).Str("sessionId", sessionID).Str("agentKind", taskRun.AgentKind).Str("prompt", taskRun.Prompt).Msg("task run: pi session started")
	return "started", &taskRunSessionInfo{sessionID: sessionID, title: buildTaskRunTerminalTitle(taskRun.Prompt, taskRun.AgentKind)}
}

// cleanupTaskRunSession stops a just-started task run pi session and removes it
// from the registry when the run cannot proceed (e.g. prompt send failed).
func (h *JSONRPCHandler) cleanupTaskRunSession(sessionID string) {
	// Mark the session as stopping before the (potentially slow) process
	// teardown so a concurrent pi.start/pi.attach cannot bind to a dying
	// process, mirroring handlePiStop.
	if !h.piSessions.MarkStopping(sessionID) {
		return
	}

	if err := h.agentMgr.Stop(sessionID); err != nil {
		log.Warn().Err(err).Str("sessionId", sessionID).Msg("task run: failed to stop pi session after prompt failure")
	}
	h.piSessions.Delete(sessionID)
}

func (h *JSONRPCHandler) startTaskRunTerminal(created workspace.Workspace, taskRun *workspace.TaskRunConfig) string {
	cmd, buildErr := agentcmd.BuildRunCommand(taskRun.AgentKind, taskRun.Prompt, taskRun.Model, true)
	if buildErr != nil {
		log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to build agent command")
		return "failed"
	}
	resp, startErr := h.manager.Terminals().Start(context.Background(), created.Path, terminal.StartRequest{
		WorkspaceID: created.ID,
		TabID:       "task-" + created.ID,
		PaneID:      "pane-task-" + created.ID,
		Title:       buildTaskRunTerminalTitle(taskRun.Prompt, taskRun.AgentKind),
		AgentKind:   taskRun.AgentKind,
	})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to start terminal session")
		return "failed"
	}
	_, sendErr := h.manager.Terminals().Send(terminal.SendRequest{SessionID: resp.SessionID, Input: shellCommandLine(cmd.Binary, cmd.Args) + "\r"})
	if sendErr != nil {
		log.Warn().Err(sendErr).Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to send agent command")
		return "failed"
	}
	log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", taskRun.AgentKind).Str("prompt", taskRun.Prompt).Msg("task run: terminal session started")
	return "started"
}

// hasDesktopUI reports whether a Yishan desktop app connection is currently
// attached to this daemon. Task runs switch to agent chat tab execution when
// true; headless daemons (remote service nodes) keep the pi CLI terminal.
func (h *JSONRPCHandler) hasDesktopUI() bool {
	h.desktopConnsMu.Lock()
	defer h.desktopConnsMu.Unlock()
	return len(h.desktopConns) > 0
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
