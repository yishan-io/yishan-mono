package clidetector

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

const ghDetectionCacheTTLEnvKey = "GITHUB_DETECTION_CACHE_TTL"
const defaultGhDetectionCacheTTL = 5 * time.Minute
const ghAuthStatusTimeout = 5 * time.Second

// GitHubConnectionStatus represents the status of the local GitHub CLI connection.
type GitHubConnectionStatus struct {
	// Installed is true when the `gh` CLI binary is found in the user's PATH.
	Installed bool `json:"installed"`
	// LoggedIn is true when `gh auth status` reports an authenticated session.
	LoggedIn bool `json:"loggedIn"`
	// Username is the GitHub username from `gh auth status`, if available.
	Username string `json:"username,omitempty"`
	// StatusDetail is a human-readable summary of the detection result.
	StatusDetail string `json:"statusDetail"`
}

type cachedGitHubDetectionResult struct {
	ExpiresAt time.Time
	Status    GitHubConnectionStatus
}

type gitHubDetectionCache struct {
	mu    sync.Mutex
	value cachedGitHubDetectionResult
}

func newGitHubDetectionCache() *gitHubDetectionCache {
	return &gitHubDetectionCache{}
}

func (c *gitHubDetectionCache) load(ttl time.Duration) (GitHubConnectionStatus, bool) {
	if ttl <= 0 {
		return GitHubConnectionStatus{}, false
	}

	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()

	if now.After(c.value.ExpiresAt) {
		return GitHubConnectionStatus{}, false
	}

	return c.value.Status, true
}

func (c *gitHubDetectionCache) store(ttl time.Duration, status GitHubConnectionStatus) {
	if ttl <= 0 {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.value = cachedGitHubDetectionResult{
		ExpiresAt: time.Now().Add(ttl),
		Status:    status,
	}
}

func (c *gitHubDetectionCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value = cachedGitHubDetectionResult{}
}

var defaultGitHubDetectionCache = newGitHubDetectionCache()

// CheckGitHubConnectionStatus detects whether the GitHub CLI is installed and
// the user is authenticated. Results are cached to avoid repeated subprocess
// invocations.
func CheckGitHubConnectionStatus(forceRefresh bool) GitHubConnectionStatus {
	return CheckGitHubConnectionStatusRaw(forceRefresh)
}

func CheckGitHubConnectionStatusRaw(forceRefresh bool) GitHubConnectionStatus {
	ttl := resolveGhDetectionCacheTTL()

	if !forceRefresh {
		if status, ok := defaultGitHubDetectionCache.load(ttl); ok {
			return status
		}
	}

	status := detectGitHubConnectionStatus()
	defaultGitHubDetectionCache.store(ttl, status)

	return status
}

func resolveGhDetectionCacheTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv(ghDetectionCacheTTLEnvKey))
	if raw == "" {
		return defaultGhDetectionCacheTTL
	}

	ttl, err := time.ParseDuration(raw)
	if err != nil || ttl <= 0 {
		return defaultGhDetectionCacheTTL
	}

	return ttl
}

func resetGhDetectionCacheForTest() {
	defaultGitHubDetectionCache.reset()
}

func detectGitHubConnectionStatus() GitHubConnectionStatus {
	// Step 1: Check if `gh` is installed by locating it in PATH.
	// Reuse the same PATH resolution logic as agent detection so that tools
	// installed via nvm/pyenv/brew etc. are also found.
	ghPath := findGhCLIInPath()
	if ghPath == "" {
		return GitHubConnectionStatus{
			Installed:    false,
			LoggedIn:     false,
			StatusDetail: "GitHub CLI (gh) is not installed",
		}
	}

	// Step 2: Check auth status with `gh auth status`.
	username, loggedIn := checkGhAuthStatus(ghPath)
	if !loggedIn {
		return GitHubConnectionStatus{
			Installed:    true,
			LoggedIn:     false,
			StatusDetail: "GitHub CLI is installed but not logged in",
		}
	}

	detail := "Connected to GitHub"
	if username != "" {
		detail = "Connected to GitHub as " + username
	}

	return GitHubConnectionStatus{
		Installed:    true,
		LoggedIn:     true,
		Username:     username,
		StatusDetail: detail,
	}
}

// findGhCLIInPath locates the `gh` binary using the same PATH resolution
// strategy as the agent detection system.
func findGhCLIInPath() string {
	pathValue := resolveDetectionPathValue()
	pathSegments := splitPathSegments(pathValue)

	options := agentDetectionOptions{
		PathValue:    pathValue,
		PathExtValue: os.Getenv("PATHEXT"),
		IsWindows:    runtime.GOOS == "windows",
		ExcludedDirs: map[string]struct{}{},
	}

	ghPath, found := findExecutableInPath([]string{"gh"}, pathSegments, options)
	if !found {
		return ""
	}

	return ghPath
}

// checkGhAuthStatus runs `gh auth status` and parses the output to determine
// whether the user is logged in and extracts the username if possible.
func checkGhAuthStatus(ghPath string) (username string, loggedIn bool) {
	ctx, cancel := context.WithTimeout(context.Background(), ghAuthStatusTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, ghPath, "auth", "status")
	output, err := cmd.CombinedOutput()
	outputStr := strings.TrimSpace(string(output))

	// `gh auth status` exits 0 when logged in and non-zero when not.
	if err != nil {
		// Check if the output still indicates a login (some older gh versions).
		if strings.Contains(outputStr, "Logged in to") {
			return extractGhUsername(outputStr), true
		}
		return "", false
	}

	// Exit code 0 means authenticated.
	return extractGhUsername(outputStr), true
}

// extractGhUsername parses the username from `gh auth status` output.
// Typical output includes a line like: "Logged in to github.com account username (...)".
func extractGhUsername(output string) string {
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		// Look for pattern: "Logged in to github.com account <username>"
		if idx := strings.Index(trimmed, "account "); idx >= 0 {
			rest := trimmed[idx+len("account "):]
			rest = strings.TrimSpace(rest)
			for _, sep := range []string{" ", "(", "\t"} {
				if i := strings.Index(rest, sep); i > 0 {
					rest = rest[:i]
				}
			}
			if rest != "" {
				return rest
			}
		}
	}
	return ""
}
