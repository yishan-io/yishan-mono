package agent

import (
	"context"
	"encoding/json"
	"strings"
	"yishan/apps/cli/internal/events"

	agentcmd "yishan/apps/cli/internal/agent/command"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"

	"github.com/rs/zerolog/log"
)

// taskRunSessionInfo describes a task run started as a Pi RPC session (agent
// chat tab). Non-nil only when the chat-tab path was taken; the desktop uses
// it to open the agent chat tab for the run.
type taskRunSessionInfo struct {
	sessionID string
	title     string
}

func (s *Service) PublishWorkspaceCreateCompleted(prepared application.CreatePlan, created workspace.Workspace, warnings []any) {
	completionPayload := map[string]any{"workspaceId": created.ID, "worktreePath": created.Path, "lifecycleScriptWarnings": warnings}
	taskRunStatus, taskRunSession := s.maybeStartTaskRun(prepared, created)
	if taskRunStatus != "" {
		completionPayload["taskRunStatus"] = taskRunStatus
	}
	if taskRunSession != nil {
		completionPayload["taskRunSessionId"] = taskRunSession.sessionID
		completionPayload["taskRunTitle"] = taskRunSession.title
	}
	s.deps.Events.Publish(eventbus.Event{Topic: "workspaceCreateCompleted", Payload: completionPayload})
	if s.deps.RelayCreateCompleted != nil {
		s.deps.RelayCreateCompleted(prepared, completionPayload)
	}
}

// maybeStartTaskRun starts the task run attached to a workspace create.
//
// When a desktop UI is connected to this daemon, the run executes as a Pi RPC
// session so the desktop can show it as an agent chat tab. Otherwise (headless
// daemon, remote service node) the run executes in a terminal via the agent
// CLI, matching the pre-existing behavior.
func (s *Service) maybeStartTaskRun(prepared application.CreatePlan, created workspace.Workspace) (string, *taskRunSessionInfo) {
	if prepared.LocalCreate == nil || prepared.LocalCreate.TaskRun == nil {
		return "", nil
	}
	taskRun := prepared.LocalCreate.TaskRun
	if s.HasDesktopUI() {
		return s.startTaskRunChatSession(created, taskRun)
	}
	return s.startTaskRunTerminal(created, taskRun), nil
}

func (s *Service) startTaskRunChatSession(created workspace.Workspace, taskRun *workspace.TaskRunConfig) (string, *taskRunSessionInfo) {
	admission, err := s.piSessions.Admit(created.ID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("task run: workspace is closing")
		return "failed", nil
	}
	return s.startAdmittedTaskRun(created, taskRun, admission)
}

func (s *Service) startAdmittedTaskRun(created workspace.Workspace, taskRun *workspace.TaskRunConfig, admission *session.Admission) (string, *taskRunSessionInfo) {
	defer s.piSessions.ReleaseAdmission(admission)
	session, sessionID, tabID, ok := s.startTaskRunPiProcess(created, taskRun)
	if !ok {
		return "failed", nil
	}
	if !s.registerTaskRunAdmission(admission, created, sessionID, tabID, session) {
		return "failed", nil
	}
	return s.sendTaskRunPrompt(created, taskRun, sessionID, session)
}

func (s *Service) startTaskRunPiProcess(created workspace.Workspace, taskRun *workspace.TaskRunConfig) (*agentmanager.Session, string, string, bool) {
	sessionID := "task-" + created.ID
	tabID := sessionID
	extraEnv, ok := s.buildTaskRunExtraEnv(created, tabID)
	if !ok || s.deps.AgentLifecycleCtx.Err() != nil {
		return nil, "", "", false
	}
	session, err := s.deps.AgentMgr.Start(s.deps.AgentLifecycleCtx, s.taskRunStartOptions(created, taskRun, sessionID, tabID, extraEnv))
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("task run: failed to start pi session")
		return nil, "", "", false
	}
	return session, sessionID, tabID, true
}

func (s *Service) buildTaskRunExtraEnv(created workspace.Workspace, tabID string) ([]string, bool) {
	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{TabID: tabID, PaneID: "pane-" + tabID, WorkspaceID: created.ID}, created, s.deps.DaemonWSEndpoint)
	if err == nil {
		return extraEnv, true
	}
	log.Warn().Err(err).Str("workspaceId", created.ID).Msg("task run: failed to build pi session env")
	return nil, false
}

func (s *Service) taskRunStartOptions(created workspace.Workspace, taskRun *workspace.TaskRunConfig, sessionID, tabID string, extraEnv []string) agentmanager.StartOptions {
	args := []string{"--mode", "rpc", "--name", tabID, "--approve", "--session-id", sessionID}
	if model := strings.TrimSpace(taskRun.Model); model != "" {
		args = append(args, "--model", model)
	}
	return agentmanager.StartOptions{SessionID: sessionID, TabID: tabID, WorkspaceID: created.ID, Binary: "pi", Args: args, CWD: created.Path, ExtraEnv: extraEnv, DaemonWSEndpoint: s.deps.DaemonWSEndpoint, OnEvent: s.makePiEventCallback(sessionID), OnExit: s.handlePiSessionExit}
}

func (s *Service) registerTaskRunAdmission(admission *session.Admission, created workspace.Workspace, sessionID, tabID string, proc *agentmanager.Session) bool {
	if s.afterProcessStart != nil {
		s.afterProcessStart()
	}
	if s.piSessions.RegisterAdmission(admission, sessionID, nil, proc, tabID, created.Path, true) {
		return true
	}
	stopErr := s.stopProcess(proc)
	s.piSessions.RejectAdmission(admission, sessionID, nil, proc, tabID, created.Path, true, stopErr)
	if stopErr != nil {
		log.Warn().Err(stopErr).Str("workspaceId", created.ID).Msg("task run: failed to stop session crossing workspace close")
	}
	return false
}

func (s *Service) sendTaskRunPrompt(created workspace.Workspace, taskRun *workspace.TaskRunConfig, sessionID string, proc *agentmanager.Session) (string, *taskRunSessionInfo) {
	promptCmd, err := json.Marshal(map[string]any{"type": "prompt", "message": taskRun.Prompt})
	if err == nil {
		err = proc.Send(promptCmd)
	}
	if err != nil {
		s.cleanupTaskRunSession(sessionID)
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("task run: failed to send prompt to pi session")
		return "failed", nil
	}
	log.Info().Str("workspaceId", created.ID).Str("sessionId", sessionID).Msg("task run: pi session started")
	return "started", &taskRunSessionInfo{sessionID: sessionID, title: buildTaskRunTerminalTitle(taskRun.Prompt, taskRun.AgentKind)}
}

// cleanupTaskRunSession stops a just-started task run pi session and removes it
// from the registry when the run cannot proceed (e.g. prompt send failed).
func (s *Service) cleanupTaskRunSession(sessionID string) {
	if err := s.stopRegisteredSession(context.Background(), sessionID); err != nil {
		log.Warn().Err(err).Str("sessionId", sessionID).Msg("task run: failed to stop pi session after prompt failure")
	}
}

func (s *Service) startTaskRunTerminal(created workspace.Workspace, taskRun *workspace.TaskRunConfig) string {
	cmd, buildErr := agentcmd.BuildRunCommand(taskRun.AgentKind, taskRun.Prompt, taskRun.Model, true)
	if buildErr != nil {
		log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to build agent command")
		return "failed"
	}
	resp, startErr := s.deps.Terminals.Start(context.Background(), created.Path, term.StartRequest{
		WorkspaceID: created.ID,
		ProjectID:   created.ProjectID,
		OrgID:       created.OrgID,
		TabID:       "task-" + created.ID,
		PaneID:      "pane-task-" + created.ID,
		Title:       buildTaskRunTerminalTitle(taskRun.Prompt, taskRun.AgentKind),
		AgentKind:   taskRun.AgentKind,
	})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to start terminal session")
		return "failed"
	}
	_, sendErr := s.deps.Terminals.Send(term.SendRequest{SessionID: resp.SessionID, Input: shellCommandLine(cmd.Binary, cmd.Args) + "\r"})
	if sendErr != nil {
		log.Warn().Err(sendErr).Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", taskRun.AgentKind).Msg("task run: failed to send agent command")
		return "failed"
	}
	log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", taskRun.AgentKind).Str("prompt", taskRun.Prompt).Msg("task run: terminal session started")
	return "started"
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
