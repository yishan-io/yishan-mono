package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type TaskRunConfig struct {
	AgentKind string `json:"agentKind"`
	Prompt    string `json:"prompt"`
	Model     string `json:"model,omitempty"`
}

type CreateRequest struct {
	ID             string         `json:"id"`
	OrganizationID string         `json:"organizationId,omitempty"`
	NodeID         string         `json:"nodeId,omitempty"`
	ProjectID      string         `json:"projectId,omitempty"`
	RepoKey        string         `json:"repoKey"`
	WorkspaceName  string         `json:"workspaceName"`
	SourcePath     string         `json:"sourcePath"`
	TargetBranch   string         `json:"targetBranch"`
	SourceBranch   string         `json:"sourceBranch"`
	ContextEnabled bool           `json:"contextEnabled,omitempty"`
	SetupHook      string         `json:"setupHook,omitempty"`
	TaskRun        *TaskRunConfig `json:"taskRun,omitempty"`
}

type CreateProgressStatus string

const (
	CreateProgressPending   CreateProgressStatus = "pending"
	CreateProgressRunning   CreateProgressStatus = "running"
	CreateProgressCompleted CreateProgressStatus = "completed"
	CreateProgressFailed    CreateProgressStatus = "failed"
	CreateProgressSkipped   CreateProgressStatus = "skipped"
	CreateProgressWarning   CreateProgressStatus = "warning"
)

type CreateProgressEvent struct {
	WorkspaceID string               `json:"workspaceId"`
	StepID      string               `json:"stepId"`
	Label       string               `json:"label"`
	Status      CreateProgressStatus `json:"status"`
	Message     string               `json:"message,omitempty"`
	CreatedAt   string               `json:"createdAt"`
}

type CreateProgressReporter func(CreateProgressEvent)

type createProgressStep struct {
	ID      string
	Label   string
	Timeout time.Duration
	Run     func(ctx context.Context) (CreateProgressStatus, string, error)
}

// resolvedCreatePaths holds the validated and resolved filesystem paths for a
// CreateWorkspace request.
type resolvedCreatePaths struct {
	sourcePath   string
	worktreePath string
	repoKey      string // validated relative path, used for context dir resolution
}

// CreateStepTimeouts maps step IDs to their timeout durations.
type CreateStepTimeouts map[string]time.Duration

// defaultCreateStepTimeouts provides the fallback timeout for each creation step.
var defaultCreateStepTimeouts = CreateStepTimeouts{
	"worktree": 30 * time.Minute,
	"context":  30 * time.Second,
	"setup":    5 * time.Minute,
}

func (m *Manager) CreateWorkspace(ctx context.Context, req CreateRequest) (Workspace, error) {
	return m.CreateWorkspaceWithProgress(ctx, req, nil)
}

func (m *Manager) CreateWorkspaceWithProgress(ctx context.Context, req CreateRequest, report CreateProgressReporter) (Workspace, error) {
	reportProgress := func(stepID string, label string, status CreateProgressStatus, message string) {
		if report == nil {
			return
		}
		report(CreateProgressEvent{
			WorkspaceID: strings.TrimSpace(req.ID),
			StepID:      stepID,
			Label:       label,
			Status:      status,
			Message:     message,
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	if err := validateCreateRequest(req); err != nil {
		return Workspace{}, err
	}

	paths, err := resolveCreatePaths(req)
	if err != nil {
		return Workspace{}, err
	}

	ws := Workspace{
		ID:        strings.TrimSpace(req.ID),
		Path:      paths.worktreePath,
		OrgID:     req.OrganizationID,
		ProjectID: req.ProjectID,
		State:     WorkspaceStateActive,
	}

	steps := []createProgressStep{
		makeWorktreeStep(m, req, paths),
		makeContextStep(req, paths),
		makeSetupHookStep(req, &ws),
	}

	if err := runCreateSteps(ctx, req.ID, steps, reportProgress); err != nil {
		m.cleanupFailedCreate(ctx, paths.sourcePath, paths.worktreePath, req.TargetBranch)
		return Workspace{}, err
	}

	m.mu.Lock()
	m.workspaces[ws.ID] = ws
	m.mu.Unlock()

	return ws, nil
}

// validateCreateRequest checks that all required fields are present.
func validateCreateRequest(req CreateRequest) error {
	for _, field := range []struct {
		name  string
		value string
	}{
		{name: "id", value: req.ID},
		{name: "sourcePath", value: req.SourcePath},
		{name: "repoKey", value: req.RepoKey},
		{name: "workspaceName", value: req.WorkspaceName},
		{name: "targetBranch", value: req.TargetBranch},
		{name: "sourceBranch", value: req.SourceBranch},
	} {
		if strings.TrimSpace(field.value) == "" {
			return NewRPCError(rpcCodeInvalidParams, field.name+" is required")
		}
	}
	return nil
}

// resolveCreatePaths validates and resolves filesystem paths for a create request.
func resolveCreatePaths(req CreateRequest) (resolvedCreatePaths, error) {
	sourcePath, err := absUserPath(req.SourcePath)
	if err != nil {
		return resolvedCreatePaths{}, err
	}
	repoKey, err := safeRelativePath(req.RepoKey, "repoKey")
	if err != nil {
		return resolvedCreatePaths{}, err
	}
	workspaceName, err := safeRelativePath(req.WorkspaceName, "workspaceName")
	if err != nil {
		return resolvedCreatePaths{}, err
	}
	// Sanitize workspaceName so that branch names like "feature/my-branch" do
	// not produce nested directories. Only the filesystem path component is
	// changed; TargetBranch is left untouched.
	workspaceName = strings.ReplaceAll(workspaceName, "/", "-")
	if workspaceName == "" {
		return resolvedCreatePaths{}, NewRPCError(rpcCodeInvalidParams, "workspaceName is empty after sanitization")
	}
	worktreePath, err := DefaultWorktreePath(repoKey, workspaceName)
	if err != nil {
		return resolvedCreatePaths{}, err
	}
	return resolvedCreatePaths{sourcePath: sourcePath, worktreePath: worktreePath, repoKey: repoKey}, nil
}

// makeWorktreeStep returns the step that creates the local git worktree.
// It checks whether the source ref exists locally first. If it does, it runs
// worktree add directly (fast path, no network). If the ref is missing it
// fetches it with a shallow, blobless fetch before creating the worktree.
func makeWorktreeStep(m *Manager, req CreateRequest, paths resolvedCreatePaths) createProgressStep {
	return createProgressStep{
		ID:      "worktree",
		Label:   "Fetch & create worktree",
		Timeout: defaultCreateStepTimeouts["worktree"],
		Run: func(stepCtx context.Context) (CreateProgressStatus, string, error) {
			sourceBranch := strings.TrimSpace(req.SourceBranch)

			// Fast path: ref already available locally — no network round-trip.
			if m.gits.RefExists(stepCtx, paths.sourcePath, sourceBranch) {
				// Resolve to the safe full ref path to avoid "fatal: ambiguous
				// object name" errors (stale packed-ref divergence or a local
				// branch with the same slash-delimited name as the remote ref).
				resolved := resolveRef(stepCtx, paths.sourcePath, sourceBranch)
				err := m.gits.CreateWorktree(stepCtx, paths.sourcePath, req.TargetBranch, paths.worktreePath, true, resolved)
				if err != nil {
					return CreateProgressFailed, err.Error(), err
				}
				return CreateProgressCompleted, paths.worktreePath, nil
			}

			// Slow path: fetch the ref (shallow + blobless) then create the worktree.
			if fetchErr := m.gits.FetchRefShallow(stepCtx, paths.sourcePath, sourceBranch); fetchErr != nil {
				return CreateProgressFailed, fetchErr.Error(), fetchErr
			}

			// Re-resolve after fetch in case the ref is now available as a full
			// remote-tracking ref (e.g. refs/remotes/origin/main).
			resolved := resolveRef(stepCtx, paths.sourcePath, sourceBranch)
			if err := m.gits.CreateWorktree(stepCtx, paths.sourcePath, req.TargetBranch, paths.worktreePath, true, resolved); err != nil {
				return CreateProgressFailed, err.Error(), err
			}
			return CreateProgressCompleted, paths.worktreePath, nil
		},
	}
}

// makeContextStep returns the step that links the project context directory.
func makeContextStep(req CreateRequest, paths resolvedCreatePaths) createProgressStep {
	return createProgressStep{
		ID:      "context",
		Label:   "Link project context",
		Timeout: defaultCreateStepTimeouts["context"],
		Run: func(stepCtx context.Context) (CreateProgressStatus, string, error) {
			if !req.ContextEnabled {
				return CreateProgressSkipped, "Context link disabled", nil
			}

			contextPath, err := DefaultContextPath(paths.repoKey)
			if err != nil {
				return CreateProgressFailed, err.Error(), err
			}
			if err := ensureContextLink(contextPath, paths.worktreePath); err != nil {
				wrappedErr := fmt.Errorf("create context link: %w", err)
				return CreateProgressFailed, err.Error(), wrappedErr
			}
			return CreateProgressCompleted, "", nil
		},
	}
}

// makeSetupHookStep returns the step that runs the setup lifecycle hook.
// ws is a pointer so the step can record the hook result onto the workspace.
func makeSetupHookStep(req CreateRequest, ws *Workspace) createProgressStep {
	return createProgressStep{
		ID:      "setup",
		Label:   "Run setup script",
		Timeout: defaultCreateStepTimeouts["setup"],
		Run: func(stepCtx context.Context) (CreateProgressStatus, string, error) {
			hookResult, hookErr := RunHook(stepCtx, HookRequest{
				Command:       req.SetupHook,
				WorkspaceID:   ws.ID,
				WorkspacePath: ws.Path,
				HookName:      "setup",
			})
			if hookErr != nil {
				hookResult.Error = fmt.Sprintf("setup hook: %v", hookErr)
				ws.SetupHookResult = &hookResult
				return CreateProgressWarning, hookResult.Error, nil
			}
			if !hookResult.Skipped {
				ws.SetupHookResult = &hookResult
				if hookResult.Error != "" {
					return CreateProgressWarning, hookResult.Error, nil
				}
				return CreateProgressCompleted, "", nil
			}
			return CreateProgressSkipped, "No setup script configured", nil
		},
	}
}

// runCreateSteps executes each step in sequence, emitting progress events.
// On step failure it emits the failed event and returns the error.
func runCreateSteps(ctx context.Context, workspaceID string, steps []createProgressStep, reportProgress func(string, string, CreateProgressStatus, string)) error {
	for _, step := range steps {
		reportProgress(step.ID, step.Label, CreateProgressRunning, "")

		stepCtx, cancel := context.WithTimeout(ctx, step.Timeout)
		status, message, err := step.Run(stepCtx)
		cancel()

		reportProgress(step.ID, step.Label, status, message)
		if err != nil {
			return err
		}
	}
	return nil
}

// cleanupFailedCreate removes a partially created worktree and its branch on
// best-effort basis. This prevents orphaned branches and worktree directories
// from accumulating when a creation step fails after the worktree step succeeded.
func (m *Manager) cleanupFailedCreate(ctx context.Context, repoRoot string, worktreePath string, branch string) {
	cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Try to remove the worktree first (this also cleans up .git/worktrees entry).
	if _, err := os.Stat(worktreePath); err == nil {
		if removeErr := m.gits.RemoveWorktree(cleanupCtx, repoRoot, worktreePath, true); removeErr != nil {
			// Worktree removal via git failed — try removing directory directly.
			_ = os.RemoveAll(worktreePath)
		}
	}

	// Remove the branch that was created by `git worktree add -b`.
	if strings.TrimSpace(branch) != "" && m.gits.RefExists(cleanupCtx, repoRoot, branch) {
		_ = m.gits.RemoveBranch(cleanupCtx, repoRoot, branch, true)
	}
}

func absUserPath(path string) (string, error) {
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, path[2:])
		}
	}
	return filepath.Abs(path)
}

func safeRelativePath(input string, field string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || filepath.IsAbs(trimmed) {
		return "", NewRPCError(rpcCodeInvalidParams, field+" must be relative")
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", NewRPCError(rpcCodeInvalidParams, field+" must not escape .yishan")
	}
	return cleaned, nil
}
