package application

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"time"

	agentkind "yishan/apps/cli/internal/agent/kind"
	"yishan/apps/cli/internal/workspace"
)

// prepare validates and normalizes a create command and resolves the routing:
// direct create (explicit source path), project worktree create (local node),
// or remote-node create (relay dispatch). The resulting plan is the single
// input to execute.
func (s *Service) prepare(ctx context.Context, command CreateCommand) (CreatePlan, error) {
	normalized := normalizeCreateCommand(command)
	if normalized.ID == "" {
		normalized.ID = generateWorkspaceID()
	}
	if normalized.WorkspaceName == "" {
		normalized.WorkspaceName = fallbackWorkspaceName(normalized)
	}
	if err := validateTaskRun(normalized.TaskRun); err != nil {
		return CreatePlan{}, err
	}
	if normalized.Kind == string(workspace.KindPrimary) {
		return CreatePlan{}, fmt.Errorf("workspace create only supports worktree workspaces; create a new project to create a primary workspace")
	}
	if normalized.LocalTaskID != "" && normalized.NodeID != "" && normalized.NodeID != s.deps.NodeID {
		return CreatePlan{}, workspace.NewError(
			workspace.ErrCodeInvalidParams,
			"localTaskId can only be used when creating a workspace on this daemon",
		)
	}
	if isDirectCreate(normalized) {
		if normalized.NodeID == "" {
			normalized.NodeID = s.deps.NodeID
		}
		return s.reserveAvailableCreate(ctx, prepareDirectCreate(normalized, s.deps.NodeID))
	}
	prepared, err := s.prepareWorktreeCreate(ctx, normalized)
	if err != nil {
		return CreatePlan{}, err
	}
	return s.reserveAvailableCreate(ctx, prepared)
}

func normalizeCreateCommand(command CreateCommand) CreateCommand {
	command.ID = strings.TrimSpace(command.ID)
	command.LocalTaskID = strings.TrimSpace(command.LocalTaskID)
	command.OrganizationID = strings.TrimSpace(command.OrganizationID)
	command.NodeID = strings.TrimSpace(command.NodeID)
	command.ProjectID = strings.TrimSpace(command.ProjectID)
	command.RepoKey = strings.TrimSpace(command.RepoKey)
	command.WorkspaceName = strings.TrimSpace(command.WorkspaceName)
	command.SourcePath = strings.TrimSpace(command.SourcePath)
	command.TargetBranch = strings.TrimSpace(command.TargetBranch)
	command.SourceBranch = strings.TrimSpace(command.SourceBranch)
	command.SetupHook = strings.TrimSpace(command.SetupHook)
	command.Kind = strings.TrimSpace(command.Kind)
	command.Branch = strings.TrimSpace(command.Branch)
	command.ReplyNodeID = strings.TrimSpace(command.ReplyNodeID)
	if command.TaskRun != nil {
		command.TaskRun.AgentKind = strings.TrimSpace(command.TaskRun.AgentKind)
		command.TaskRun.Prompt = strings.TrimSpace(command.TaskRun.Prompt)
		command.TaskRun.Model = strings.TrimSpace(command.TaskRun.Model)
		if command.TaskRun.AgentKind == "" {
			command.TaskRun.AgentKind = agentkind.Pi
		}
	}
	if command.Kind == "" {
		command.Kind = string(workspace.KindWorktree)
	}
	return command
}

func validateTaskRun(taskRun *workspace.TaskRunConfig) error {
	if taskRun == nil || taskRun.AgentKind == agentkind.Pi {
		return nil
	}
	return fmt.Errorf("unsupported task-run agent kind %q; only %q is supported", taskRun.AgentKind, agentkind.Pi)
}

func fallbackWorkspaceName(command CreateCommand) string {
	for _, value := range []string{command.Branch, command.TargetBranch, command.ID} {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}

func isDirectCreate(command CreateCommand) bool {
	return command.SourcePath != "" || command.RepoKey != "" || command.TargetBranch != ""
}

func prepareDirectCreate(command CreateCommand, sourceNodeID string) CreatePlan {
	createReq := workspace.CreateRequest{
		ID:             command.ID,
		OrganizationID: command.OrganizationID,
		NodeID:         command.NodeID,
		ProjectID:      command.ProjectID,
		RepoKey:        command.RepoKey,
		WorkspaceName:  command.WorkspaceName,
		SourcePath:     command.SourcePath,
		TargetBranch:   command.TargetBranch,
		SourceBranch:   command.SourceBranch,
		ContextEnabled: command.ContextEnabled,
		SetupHook:      command.SetupHook,
		TaskRun:        command.TaskRun,
	}
	var registration *Registration
	if command.OrganizationID != "" && command.ProjectID != "" && command.NodeID != "" {
		registration = &Registration{
			ID:             command.ID,
			NodeID:         command.NodeID,
			SourceNodeID:   sourceNodeID,
			OrganizationID: command.OrganizationID,
			ProjectID:      command.ProjectID,
			Kind:           workspace.Kind(command.Kind),
			Branch:         command.TargetBranch,
			SourceBranch:   command.SourceBranch,
		}
	}
	return CreatePlan{
		WorkspaceID:    command.ID,
		LocalTaskID:    command.LocalTaskID,
		OrganizationID: command.OrganizationID,
		ProjectID:      command.ProjectID,
		StartedEvent:   buildStartedEvent(command, command.NodeID, command.TargetBranch),
		LocalCreate:    &createReq,
		Registration:   registration,
	}
}

func (s *Service) prepareWorktreeCreate(ctx context.Context, command CreateCommand) (CreatePlan, error) {
	if command.OrganizationID == "" || command.ProjectID == "" {
		return CreatePlan{}, fmt.Errorf("organizationId and projectId are required")
	}
	if command.Branch == "" || command.SourceBranch == "" {
		return CreatePlan{}, fmt.Errorf("branch and sourceBranch are required")
	}
	nodeID, err := resolveCreateNode(ctx, s.deps.Environment, s.deps.NodeID, command.OrganizationID, command.NodeID)
	if err != nil {
		return CreatePlan{}, err
	}
	if nodeID != s.deps.NodeID {
		if command.LocalTaskID != "" {
			return CreatePlan{}, workspace.NewError(
				workspace.ErrCodeInvalidParams,
				"localTaskId can only be used when creating a workspace on this daemon",
			)
		}
		return prepareRemoteCreate(command, nodeID, s.deps.NodeID), nil
	}
	project, err := loadProjectForCreate(s.deps.Environment, command.OrganizationID, command.ProjectID)
	if err != nil {
		return CreatePlan{}, err
	}
	sourcePath, err := resolveLocalCreateSourcePath(ctx, s.deps.Environment, command.OrganizationID, command.ProjectID, nodeID, project)
	if err != nil {
		return CreatePlan{}, err
	}
	createReq := workspace.CreateRequest{ID: command.ID, OrganizationID: command.OrganizationID, NodeID: nodeID, ProjectID: command.ProjectID, RepoKey: project.RepoKey, WorkspaceName: command.WorkspaceName, SourcePath: sourcePath, TargetBranch: command.Branch, SourceBranch: command.SourceBranch, ContextEnabled: project.ContextEnabled, SetupHook: project.SetupScript, TaskRun: command.TaskRun}
	registration := Registration{ID: command.ID, NodeID: nodeID, SourceNodeID: s.deps.NodeID, OrganizationID: command.OrganizationID, ProjectID: command.ProjectID, Kind: workspace.KindWorktree, Branch: command.Branch, SourceBranch: command.SourceBranch}
	return CreatePlan{WorkspaceID: command.ID, LocalTaskID: command.LocalTaskID, OrganizationID: command.OrganizationID, ProjectID: command.ProjectID, StartedEvent: buildStartedEvent(command, nodeID, command.Branch), RelayReplyNodeID: command.ReplyNodeID, IsRelayed: command.ReplyNodeID != "", LocalCreate: &createReq, Registration: &registration}, nil
}

func prepareRemoteCreate(command CreateCommand, targetNodeID string, replyNodeID string) CreatePlan {
	command.NodeID = targetNodeID
	command.ReplyNodeID = replyNodeID
	branch := command.Branch
	if branch == "" {
		branch = command.TargetBranch
	}
	registration := Registration{ID: command.ID, NodeID: targetNodeID, SourceNodeID: replyNodeID, OrganizationID: command.OrganizationID, ProjectID: command.ProjectID, Kind: workspace.KindWorktree, Branch: branch, SourceBranch: command.SourceBranch}
	return CreatePlan{WorkspaceID: command.ID, LocalTaskID: command.LocalTaskID, OrganizationID: command.OrganizationID, ProjectID: command.ProjectID, StartedEvent: buildStartedEvent(command, targetNodeID, branch), Registration: &registration, RemoteRequest: &command}
}

func buildStartedEvent(command CreateCommand, nodeID string, branch string) StartedEvent {
	return StartedEvent{
		WorkspaceID:    command.ID,
		OrganizationID: command.OrganizationID,
		ProjectID:      command.ProjectID,
		WorkspaceName:  command.WorkspaceName,
		SourceBranch:   command.SourceBranch,
		Branch:         strings.TrimSpace(branch),
		NodeID:         strings.TrimSpace(nodeID),
	}
}

func resolveCreateNode(ctx context.Context, env Environment, localNodeID string, organizationID string, requestedNodeID string) (string, error) {
	resolvedNodeID := strings.TrimSpace(requestedNodeID)
	if resolvedNodeID == "" {
		resolvedNodeID = strings.TrimSpace(localNodeID)
	}
	if resolvedNodeID == "" {
		return "", fmt.Errorf("workspace node id is required")
	}
	if resolvedNodeID == strings.TrimSpace(localNodeID) {
		return resolvedNodeID, nil
	}
	if !env.APIConfigured() {
		return "", fmt.Errorf("creating a workspace on node %s requires an authenticated API session", resolvedNodeID)
	}
	if err := ensureNodeUsableForWorkspace(env, organizationID, resolvedNodeID); err != nil {
		return "", err
	}
	return resolvedNodeID, nil
}

func ensureNodeUsableForWorkspace(env Environment, organizationID string, nodeID string) error {
	nodes, err := env.ListNodes(context.Background(), organizationID)
	if err != nil {
		return fmt.Errorf("load organization nodes: %w", err)
	}
	for _, node := range nodes {
		if node.ID == nodeID {
			return nil
		}
	}
	return fmt.Errorf("node %s was not found in this organization", nodeID)
}

func loadProjectForCreate(env Environment, organizationID string, projectID string) (Project, error) {
	if !env.APIConfigured() {
		return Project{}, fmt.Errorf("workspace creation requires an authenticated API session")
	}
	projects, err := env.ListProjects(context.Background(), organizationID)
	if err != nil {
		return Project{}, fmt.Errorf("load project metadata: %w", err)
	}
	for _, project := range projects {
		if project.ID == projectID {
			return project, nil
		}
	}
	return Project{}, fmt.Errorf("project %s not found in organization %s", projectID, organizationID)
}

func resolveLocalCreateSourcePath(ctx context.Context, env Environment, organizationID string, projectID string, nodeID string, project Project) (string, error) {
	primary, err := resolvePrimaryWorkspaceForNode(env, organizationID, projectID, nodeID)
	if err == nil {
		return strings.TrimSpace(primary.LocalPath), nil
	}
	if strings.TrimSpace(project.RepoURL) == "" {
		return "", fmt.Errorf("no primary workspace found on node %s for project %s and project has no repo URL; create a primary workspace first", nodeID, projectID)
	}
	return env.EnsureSharedRepoClone(ctx, project.RepoKey, project.RepoURL)
}

func resolvePrimaryWorkspaceForNode(env Environment, organizationID string, projectID string, nodeID string) (workspace.Record, error) {
	records, err := env.ListWorkspaces(context.Background(), organizationID, projectID)
	if err != nil {
		return workspace.Record{}, fmt.Errorf("load project workspaces: %w", err)
	}
	for _, record := range records {
		if record.Kind == workspace.KindPrimary && record.NodeID == nodeID && strings.TrimSpace(record.LocalPath) != "" {
			return record, nil
		}
	}
	return workspace.Record{}, fmt.Errorf("no primary workspace found on node %s for project %s; create one first", nodeID, projectID)
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
