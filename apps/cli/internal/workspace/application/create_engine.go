package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
	"yishan/apps/cli/internal/workspace/worktree"
)

// CreateWorkspace provisions the local git worktree for a prepared create and
// registers the runtime instance. It is the local-provision engine the
// application Service delegates to (the Instances port); it owns the create
// steps (worktree, context link, setup hook) and their timeouts.
func CreateWorkspace(registry *instance.Registry, ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
	reportProgress := func(stepID string, label string, status workspace.CreateProgressStatus, message string) {
		if report == nil {
			return
		}
		report(workspace.CreateProgressEvent{
			WorkspaceID: strings.TrimSpace(req.ID),
			StepID:      stepID,
			Label:       label,
			Status:      status,
			Message:     message,
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	if err := validateCreateRequest(req); err != nil {
		return workspace.Workspace{}, err
	}

	paths, err := worktree.ResolveCreatePaths(worktree.CreateRequest{
		RepoKey:       req.RepoKey,
		WorkspaceName: req.WorkspaceName,
		SourcePath:    req.SourcePath,
		TargetBranch:  req.TargetBranch,
		SourceBranch:  req.SourceBranch,
	})
	if err != nil {
		return workspace.Workspace{}, err
	}

	ws := workspace.Workspace{
		ID:        strings.TrimSpace(req.ID),
		Path:      paths.WorktreePath,
		OrgID:     req.OrganizationID,
		ProjectID: req.ProjectID,
		Kind:      workspace.KindWorktree,
		State:     workspace.StateActive,
	}

	steps := []createProgressStep{
		makeWorktreeStep(req, paths),
		makeContextStep(req, paths),
		makeSetupHookStep(req, &ws),
	}

	if err := runCreateSteps(ctx, req.ID, steps, reportProgress); err != nil {
		cleanupFailedCreate(ctx, paths.SourcePath, paths.WorktreePath, req.TargetBranch)
		return workspace.Workspace{}, err
	}

	registry.Open(ws)

	return ws, nil
}

// validateCreateRequest checks that all required fields are present.
func validateCreateRequest(req workspace.CreateRequest) error {
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
			return workspace.NewError(workspace.ErrCodeInvalidParams, field.name+" is required")
		}
	}
	return nil
}

// makeWorktreeStep returns the step that creates the local git worktree.
// It checks whether the source ref exists locally first. If it does, it runs
// worktree add directly (fast path, no network). If the ref is missing it
// fetches it with a shallow, blobless fetch before creating the worktree.
func makeWorktreeStep(req workspace.CreateRequest, paths worktree.CreatePaths) createProgressStep {
	return createProgressStep{
		ID:      "worktree",
		Label:   "Fetch & create worktree",
		Timeout: defaultCreateStepTimeouts["worktree"],
		Run: func(stepCtx context.Context) (workspace.CreateProgressStatus, string, error) {
			createdPath, err := worktree.Create(stepCtx, worktree.CreateRequest{
				RepoKey:       req.RepoKey,
				WorkspaceName: req.WorkspaceName,
				SourcePath:    req.SourcePath,
				TargetBranch:  req.TargetBranch,
				SourceBranch:  req.SourceBranch,
			}, paths)
			if err != nil {
				return workspace.CreateProgressFailed, err.Error(), err
			}
			return workspace.CreateProgressCompleted, createdPath, nil
		},
	}
}

// makeContextStep returns the step that links the project context directory.
func makeContextStep(req workspace.CreateRequest, paths worktree.CreatePaths) createProgressStep {
	return createProgressStep{
		ID:      "context",
		Label:   "Link project context",
		Timeout: defaultCreateStepTimeouts["context"],
		Run: func(stepCtx context.Context) (workspace.CreateProgressStatus, string, error) {
			if !req.ContextEnabled {
				return workspace.CreateProgressSkipped, "Context link disabled", nil
			}

			contextPath, err := workspace.DefaultContextPath(paths.RepoKey)
			if err != nil {
				return workspace.CreateProgressFailed, err.Error(), err
			}
			if err := workspace.EnsureContextLink(contextPath, paths.WorktreePath); err != nil {
				wrappedErr := fmt.Errorf("create context link: %w", err)
				return workspace.CreateProgressFailed, err.Error(), wrappedErr
			}
			return workspace.CreateProgressCompleted, "", nil
		},
	}
}

// makeSetupHookStep returns the step that runs the setup lifecycle hook.
// ws is a pointer so the step can record the hook result onto the workspace.
func makeSetupHookStep(req workspace.CreateRequest, ws *workspace.Workspace) createProgressStep {
	return createProgressStep{
		ID:      "setup",
		Label:   "Run setup script",
		Timeout: defaultCreateStepTimeouts["setup"],
		Run: func(stepCtx context.Context) (workspace.CreateProgressStatus, string, error) {
			hookResult, hookErr := workspace.RunHook(stepCtx, workspace.HookRequest{
				Command:       req.SetupHook,
				WorkspaceID:   ws.ID,
				WorkspacePath: ws.Path,
				HookName:      "setup",
			})
			if hookErr != nil {
				hookResult.Error = fmt.Sprintf("setup hook: %v", hookErr)
				ws.SetupHookResult = &hookResult
				return workspace.CreateProgressWarning, hookResult.Error, nil
			}
			if !hookResult.Skipped {
				ws.SetupHookResult = &hookResult
				if hookResult.Error != "" {
					return workspace.CreateProgressWarning, hookResult.Error, nil
				}
				return workspace.CreateProgressCompleted, "", nil
			}
			return workspace.CreateProgressSkipped, "No setup script configured", nil
		},
	}
}

// runCreateSteps executes each step in sequence, emitting progress events.
// On step failure it emits the failed event and returns the error.
func runCreateSteps(ctx context.Context, workspaceID string, steps []createProgressStep, reportProgress func(string, string, workspace.CreateProgressStatus, string)) error {
	for _, step := range steps {
		reportProgress(step.ID, step.Label, workspace.CreateProgressRunning, "")

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
// best-effort basis, using the same removal primitives as the normal close
// path. This prevents orphaned branches and worktree directories from
// accumulating when a creation step fails after the worktree step succeeded.
func cleanupFailedCreate(ctx context.Context, repoRoot string, worktreePath string, branch string) {
	cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	worktree.CleanupPartial(cleanupCtx, repoRoot, worktreePath, branch)
}

// createProgressStep is a single step of the local provision pipeline.
type createProgressStep struct {
	ID      string
	Label   string
	Timeout time.Duration
	Run     func(ctx context.Context) (workspace.CreateProgressStatus, string, error)
}

// defaultCreateStepTimeouts provides the fallback timeout for each creation step.
var defaultCreateStepTimeouts = map[string]time.Duration{
	"worktree": 30 * time.Minute,
	"context":  30 * time.Second,
	"setup":    5 * time.Minute,
}
