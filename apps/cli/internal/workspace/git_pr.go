package workspace

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (s *GitService) BranchPullRequest(ctx context.Context, root string, branch string) (GitBranchPullRequestStatus, error) {
	return s.branchPullRequest(ctx, root, branch, false, true)
}

func (s *GitService) BranchPullRequestLite(ctx context.Context, root string, branch string) (GitBranchPullRequestStatus, error) {
	return s.branchPullRequest(ctx, root, branch, false, false)
}

// BranchPullRequestWithDetails returns the PR for the given branch including
// checks and deployments. The PR list lookup respects the 30-second cache to
// throttle gh CLI calls, but checks are always fetched fresh.
func (s *GitService) BranchPullRequestWithDetails(ctx context.Context, root string, branch string) (GitBranchPullRequestStatus, error) {
	return s.branchPullRequest(ctx, root, branch, false, true)
}

func (s *GitService) RefreshBranchPullRequest(ctx context.Context, root string, branch string) (GitBranchPullRequestStatus, error) {
	return s.branchPullRequest(ctx, root, branch, true, true)
}

func (s *GitService) branchPullRequest(ctx context.Context, root string, branch string, refresh bool, includeDetails bool) (GitBranchPullRequestStatus, error) {
	branchName := strings.TrimSpace(branch)
	if branchName == "" {
		return GitBranchPullRequestStatus{}, NewRPCError(-32602, "branch is required")
	}

	cacheKey := root + "\n" + branchName
	if !refresh {
		s.mu.RLock()
		entry, ok := s.branchPullRequestCache[cacheKey]
		s.mu.RUnlock()
		if ok && time.Since(entry.at) < branchPullRequestCacheTTL {
			return entry.data, nil
		}
	}

	if refresh {
		s.mu.Lock()
		delete(s.branchPullRequestCache, cacheKey)
		s.mu.Unlock()
	}

	out, err := ghCommand(ctx, root,
		"pr", "list",
		"--head", branchName,
		"--state", "all",
		"--limit", "1",
		"--json", "number,title,url,state,reviewDecision,isDraft,mergedAt,headRefName,baseRefName,headRefOid",
	)
	if err != nil {
		return GitBranchPullRequestStatus{}, err
	}

	type ghPullRequest struct {
		Number         int    `json:"number"`
		Title          string `json:"title"`
		URL            string `json:"url"`
		State          string `json:"state"`
		ReviewDecision string `json:"reviewDecision"`
		IsDraft        bool   `json:"isDraft"`
		MergedAt       string `json:"mergedAt"`
		HeadRefName    string `json:"headRefName"`
		BaseRefName    string `json:"baseRefName"`
		HeadRefOID     string `json:"headRefOid"`
	}

	prs := make([]ghPullRequest, 0)
	if err := json.Unmarshal([]byte(out), &prs); err != nil {
		return GitBranchPullRequestStatus{}, NewRPCError(-32010, "failed to parse gh pr list output")
	}

	if len(prs) == 0 {
		status := GitBranchPullRequestStatus{Found: false, Branch: branchName}
		s.mu.Lock()
		s.branchPullRequestCache[cacheKey] = branchPullRequestCacheEntry{data: status, at: time.Now()}
		s.mu.Unlock()
		return status, nil
	}

	pr := prs[0]
	checks := []GitPullRequestCheck{}
	deployments := []GitPullRequestDeployment{}
	if includeDetails {
		checks, err = getPullRequestChecks(ctx, root, pr.Number, pr.HeadRefOID)
		if err != nil {
			return GitBranchPullRequestStatus{}, err
		}
		deployments, err = getPullRequestDeployments(ctx, root, pr.HeadRefOID)
		if err != nil {
			return GitBranchPullRequestStatus{}, err
		}
	}
	status := GitBranchPullRequestStatus{
		Found:          true,
		Branch:         branchName,
		Number:         pr.Number,
		Title:          pr.Title,
		URL:            pr.URL,
		State:          pr.State,
		ReviewDecision: pr.ReviewDecision,
		IsDraft:        pr.IsDraft,
		MergedAt:       pr.MergedAt,
		HeadRefName:    pr.HeadRefName,
		BaseRefName:    pr.BaseRefName,
		Checks:         checks,
		Deployments:    deployments,
	}

	s.mu.Lock()
	s.branchPullRequestCache[cacheKey] = branchPullRequestCacheEntry{data: status, at: time.Now()}
	s.mu.Unlock()
	return status, nil
}

func getPullRequestChecks(ctx context.Context, root string, prNumber int, headRefOID string) ([]GitPullRequestCheck, error) {
	// Use the GitHub REST API to get check runs with correct html_url links.
	// gh pr checks --json only provides marketplace/app links, not check run URLs.
	if strings.TrimSpace(headRefOID) != "" {
		type ghCheckRun struct {
			Name       string `json:"name"`
			Status     string `json:"status"`
			Conclusion string `json:"conclusion"`
			HTMLURL    string `json:"html_url"`
		}
		type ghCheckRunsResponse struct {
			CheckRuns []ghCheckRun `json:"check_runs"`
		}

		var resp ghCheckRunsResponse
		if err := ghJSON(ctx, root, &resp,
			"api", fmt.Sprintf("repos/{owner}/{repo}/commits/%s/check-runs", headRefOID),
		); err == nil && len(resp.CheckRuns) > 0 {
			result := make([]GitPullRequestCheck, 0, len(resp.CheckRuns))
			for _, run := range resp.CheckRuns {
				state := run.Conclusion
				if state == "" {
					state = run.Status
				}
				result = append(result, GitPullRequestCheck{
					Name:  run.Name,
					State: strings.ToUpper(state),
					URL:   run.HTMLURL,
				})
			}
			return result, nil
		}
	}

	// Fall back to gh pr checks if headRefOID is empty or API call failed.
	type ghCheck struct {
		Name        string `json:"name"`
		Workflow    string `json:"workflow"`
		State       string `json:"state"`
		Description string `json:"description"`
		Link        string `json:"link"`
	}

	checks := make([]ghCheck, 0)
	if err := ghJSON(ctx, root, &checks,
		"pr", "checks", fmt.Sprintf("%d", prNumber),
		"--required=false",
		"--json", "name,workflow,state,description,link",
	); err != nil {
		return nil, err
	}

	result := make([]GitPullRequestCheck, 0, len(checks))
	for _, check := range checks {
		result = append(result, GitPullRequestCheck{
			Name:        check.Name,
			Workflow:    check.Workflow,
			State:       check.State,
			Description: check.Description,
			URL:         check.Link,
		})
	}
	return result, nil
}

func getPullRequestDeployments(ctx context.Context, root string, headRefOID string) ([]GitPullRequestDeployment, error) {
	if strings.TrimSpace(headRefOID) == "" {
		return []GitPullRequestDeployment{}, nil
	}

	type ghRepo struct {
		NameWithOwner string `json:"nameWithOwner"`
	}
	repo := ghRepo{}
	if err := ghJSON(ctx, root, &repo, "api", "repos/{owner}/{repo}"); err != nil {
		return nil, err
	}
	if strings.TrimSpace(repo.NameWithOwner) == "" {
		return []GitPullRequestDeployment{}, nil
	}

	type ghDeployment struct {
		ID              int64  `json:"id"`
		Environment     string `json:"environment"`
		Description     string `json:"description"`
		OriginalPayload string `json:"original_payload"`
		CreatedAt       string `json:"created_at"`
		UpdatedAt       string `json:"updated_at"`
	}

	deployments := make([]ghDeployment, 0)
	if err := ghJSON(ctx, root, &deployments,
		"api",
		fmt.Sprintf("repos/%s/deployments", repo.NameWithOwner),
		"-f", "sha="+headRefOID,
		"-f", "per_page=20",
	); err != nil {
		return nil, err
	}

	result := make([]GitPullRequestDeployment, 0, len(deployments))
	for _, deployment := range deployments {
		status, envURL, statusDescription, err := getDeploymentStatus(ctx, root, repo.NameWithOwner, deployment.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, GitPullRequestDeployment{
			ID:              deployment.ID,
			Environment:     deployment.Environment,
			State:           status,
			Description:     coalesceNonEmpty(statusDescription, deployment.Description),
			EnvironmentURL:  envURL,
			CreatedAt:       deployment.CreatedAt,
			UpdatedAt:       deployment.UpdatedAt,
			OriginalPayload: deployment.OriginalPayload,
		})
	}

	return result, nil
}

func getDeploymentStatus(ctx context.Context, root string, repo string, deploymentID int64) (state string, environmentURL string, description string, err error) {
	type ghDeploymentStatus struct {
		State          string `json:"state"`
		EnvironmentURL string `json:"environment_url"`
		Description    string `json:"description"`
	}

	statuses := make([]ghDeploymentStatus, 0)
	err = ghJSON(ctx, root, &statuses,
		"api",
		fmt.Sprintf("repos/%s/deployments/%d/statuses", repo, deploymentID),
		"-f", "per_page=1",
	)
	if err != nil {
		return "", "", "", err
	}
	if len(statuses) == 0 {
		return "", "", "", nil
	}
	return statuses[0].State, statuses[0].EnvironmentURL, statuses[0].Description, nil
}
