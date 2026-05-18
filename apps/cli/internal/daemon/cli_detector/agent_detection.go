package clidetector

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/workspace/shellenv"
)

const managedBinDirEnvKey = "MANAGED_BIN_DIR"
const agentDetectionCacheTTLEnvKey = "AGENT_CLI_DETECTION_CACHE_TTL"
const defaultAgentDetectionCacheTTL = time.Hour

const loginShellPathTimeout = 3 * time.Second

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`)

// SupportedAgentCLIKinds contains all supported agent CLIs that can be detected on one node.
var SupportedAgentCLIKinds = []string{"opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor-agent"}

type supportedAgentCLI struct {
	Kind     string
	Commands []string
}

var supportedAgentCLIs = []supportedAgentCLI{
	{Kind: "opencode", Commands: []string{"opencode"}},
	{Kind: "codex", Commands: []string{"codex"}},
	{Kind: "claude", Commands: []string{"claude"}},
	{Kind: "gemini", Commands: []string{"gemini"}},
	{Kind: "pi", Commands: []string{"pi"}},
	{Kind: "copilot", Commands: []string{"copilot"}},
	{Kind: "cursor-agent", Commands: []string{"cursor"}},
}

type cachedAgentDetectionResult struct {
	CacheKey  string
	ExpiresAt time.Time
	Statuses  []AgentCLIDetectionStatus
}

var (
	agentDetectionCacheMu sync.Mutex
	agentDetectionCache   cachedAgentDetectionResult
)

// AgentCLIDetectionStatus captures one supported agent CLI detection result.
type AgentCLIDetectionStatus struct {
	AgentKind string `json:"agentKind"`
	Detected  bool   `json:"detected"`
	Version   string `json:"version,omitempty"`
}

type agentDetectionOptions struct {
	PathValue      string
	PathExtValue   string
	IsWindows      bool
	ExcludedDirs   map[string]struct{}
	VersionTimeout time.Duration
}

// ListAgentCLIDetectionStatuses returns detection statuses for all supported desktop agent CLIs.
// It uses the cached result if available.
func ListAgentCLIDetectionStatuses() []AgentCLIDetectionStatus {
	return ListAgentCLIDetectionStatusesWithRefresh(false)
}

// ListAgentCLIDetectionStatusesWithRefresh returns detection statuses, optionally
// bypassing the cache when forceRefresh is true.
func ListAgentCLIDetectionStatusesWithRefresh(forceRefresh bool) []AgentCLIDetectionStatus {
	ttl := resolveAgentDetectionCacheTTL()
	if !forceRefresh {
		if statuses, ok := loadAnyCachedAgentDetectionStatuses(ttl); ok {
			return statuses
		}
	}

	options := agentDetectionOptions{
		PathValue:      resolveDetectionPathValue(),
		PathExtValue:   os.Getenv("PATHEXT"),
		IsWindows:      runtime.GOOS == "windows",
		ExcludedDirs:   resolveExcludedDirectories(),
		VersionTimeout: 2 * time.Second,
	}
	return ListAgentCLIDetectionStatusesWithRuntimeOptions(forceRefresh, options, ttl)
}

func ListAgentCLIDetectionStatusesWithRuntimeOptions(forceRefresh bool, options agentDetectionOptions, ttl time.Duration) []AgentCLIDetectionStatus {
	cacheKey := buildAgentDetectionCacheKey(options)

	if !forceRefresh {
		if statuses, ok := loadCachedAgentDetectionStatuses(cacheKey, ttl); ok {
			return statuses
		}
	}

	statuses := listAgentCLIDetectionStatusesWithOptions(options)
	storeCachedAgentDetectionStatuses(cacheKey, ttl, statuses)

	return statuses
}

func resolveAgentDetectionCacheTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv(agentDetectionCacheTTLEnvKey))
	if raw == "" {
		return defaultAgentDetectionCacheTTL
	}

	ttl, err := time.ParseDuration(raw)
	if err != nil || ttl <= 0 {
		return defaultAgentDetectionCacheTTL
	}

	return ttl
}

func buildAgentDetectionCacheKey(options agentDetectionOptions) string {
	excludedDirs := make([]string, 0, len(options.ExcludedDirs))
	for dir := range options.ExcludedDirs {
		excludedDirs = append(excludedDirs, dir)
	}
	slices.Sort(excludedDirs)

	return strings.Join([]string{
		options.PathValue,
		options.PathExtValue,
		strconv.FormatBool(options.IsWindows),
		strings.Join(excludedDirs, ";"),
	}, "|")
}

func loadCachedAgentDetectionStatuses(cacheKey string, ttl time.Duration) ([]AgentCLIDetectionStatus, bool) {
	if ttl <= 0 {
		return nil, false
	}

	now := time.Now()
	agentDetectionCacheMu.Lock()
	defer agentDetectionCacheMu.Unlock()

	if agentDetectionCache.CacheKey != cacheKey {
		return nil, false
	}
	if now.After(agentDetectionCache.ExpiresAt) {
		return nil, false
	}

	return cloneAgentDetectionStatuses(agentDetectionCache.Statuses), true
}

func loadAnyCachedAgentDetectionStatuses(ttl time.Duration) ([]AgentCLIDetectionStatus, bool) {
	if ttl <= 0 {
		return nil, false
	}

	now := time.Now()
	agentDetectionCacheMu.Lock()
	defer agentDetectionCacheMu.Unlock()

	if now.After(agentDetectionCache.ExpiresAt) {
		return nil, false
	}
	if len(agentDetectionCache.Statuses) == 0 {
		return nil, false
	}

	return cloneAgentDetectionStatuses(agentDetectionCache.Statuses), true
}

func storeCachedAgentDetectionStatuses(cacheKey string, ttl time.Duration, statuses []AgentCLIDetectionStatus) {
	if ttl <= 0 {
		return
	}

	agentDetectionCacheMu.Lock()
	defer agentDetectionCacheMu.Unlock()

	agentDetectionCache = cachedAgentDetectionResult{
		CacheKey:  cacheKey,
		ExpiresAt: time.Now().Add(ttl),
		Statuses:  cloneAgentDetectionStatuses(statuses),
	}
}

func cloneAgentDetectionStatuses(statuses []AgentCLIDetectionStatus) []AgentCLIDetectionStatus {
	cloned := make([]AgentCLIDetectionStatus, len(statuses))
	copy(cloned, statuses)
	return cloned
}

func resetAgentDetectionCacheForTest() {
	agentDetectionCacheMu.Lock()
	defer agentDetectionCacheMu.Unlock()
	agentDetectionCache = cachedAgentDetectionResult{}
}

func resolveDetectionPathValue() string {
	resolvedEnv := shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	return shellenv.EnvValueOrDefault(resolvedEnv, "PATH", os.Getenv("PATH"))
}

func resolveUserShell() string {
	return shellenv.ResolveUserShell(os.Getenv("SHELL"))
}

func listAgentCLIDetectionStatusesWithOptions(options agentDetectionOptions) []AgentCLIDetectionStatus {
	pathSegments := splitPathSegments(options.PathValue)
	statuses := make([]AgentCLIDetectionStatus, len(supportedAgentCLIs))

	var waitGroup sync.WaitGroup
	waitGroup.Add(len(supportedAgentCLIs))
	for index, agentCLI := range supportedAgentCLIs {
		go func(index int, agentCLI supportedAgentCLI) {
			defer waitGroup.Done()

			binaryPath, ok := findExecutableInPath(agentCLI.Commands, pathSegments, options)
			if !ok {
				statuses[index] = AgentCLIDetectionStatus{AgentKind: agentCLI.Kind, Detected: false}
				return
			}

			version, unusableWrapper := detectAgentCLIVersion(binaryPath, options.VersionTimeout)
			if unusableWrapper {
				statuses[index] = AgentCLIDetectionStatus{AgentKind: agentCLI.Kind, Detected: false}
				return
			}

			statuses[index] = AgentCLIDetectionStatus{
				AgentKind: agentCLI.Kind,
				Detected:  true,
				Version:   version,
			}
		}(index, agentCLI)
	}
	waitGroup.Wait()

	return statuses
}

func resolveExcludedDirectories() map[string]struct{} {
	excluded := map[string]struct{}{}
	if managedBinDir := strings.TrimSpace(os.Getenv(managedBinDirEnvKey)); managedBinDir != "" {
		excluded[normalizeDirectoryPath(managedBinDir)] = struct{}{}
	}

	return excluded
}

func splitPathSegments(pathValue string) []string {
	seen := map[string]struct{}{}
	segments := []string{}
	for segment := range strings.SplitSeq(pathValue, string(os.PathListSeparator)) {
		trimmed := strings.TrimSpace(segment)
		if trimmed == "" {
			continue
		}

		normalized := normalizeDirectoryPath(trimmed)
		if _, exists := seen[normalized]; exists {
			continue
		}

		seen[normalized] = struct{}{}
		segments = append(segments, trimmed)
	}

	return segments
}

func normalizeDirectoryPath(directoryPath string) string {
	normalized, err := filepath.Abs(directoryPath)
	if err != nil {
		return filepath.Clean(directoryPath)
	}

	return normalized
}

func findExecutableInPath(commandNames []string, pathSegments []string, options agentDetectionOptions) (string, bool) {
	for _, commandName := range commandNames {
		candidatesExts := resolveExecutableExtensions(options.IsWindows, options.PathExtValue, commandName)

		for _, segment := range pathSegments {
			normalizedSegment := normalizeDirectoryPath(segment)
			if _, excluded := options.ExcludedDirs[normalizedSegment]; excluded {
				continue
			}

			baseCandidate := filepath.Join(segment, commandName)
			for _, extension := range candidatesExts {
				candidate := baseCandidate + extension
				if isExecutableCandidate(candidate, options.IsWindows) {
					return candidate, true
				}
			}
		}
	}

	return "", false
}

func resolveExecutableExtensions(isWindows bool, pathExtValue string, commandName string) []string {
	if !isWindows || filepath.Ext(commandName) != "" {
		return []string{""}
	}

	if strings.TrimSpace(pathExtValue) == "" {
		pathExtValue = ".COM;.EXE;.BAT;.CMD"
	}

	seen := map[string]struct{}{}
	extensions := []string{}
	for _, extension := range strings.Split(pathExtValue, ";") {
		trimmed := strings.TrimSpace(extension)
		if trimmed == "" {
			continue
		}

		lower := strings.ToLower(trimmed)
		if _, exists := seen[lower]; exists {
			continue
		}

		seen[lower] = struct{}{}
		extensions = append(extensions, lower)
	}

	if len(extensions) == 0 {
		return []string{""}
	}

	return extensions
}

func isExecutableCandidate(candidatePath string, isWindows bool) bool {
	fileInfo, err := os.Stat(candidatePath)
	if err != nil || fileInfo.IsDir() {
		return false
	}

	if isWindows {
		return true
	}

	return fileInfo.Mode().Perm()&0o111 != 0
}

func detectAgentCLIVersion(binaryPath string, timeout time.Duration) (string, bool) {
	for _, args := range [][]string{{"--version"}, {"version"}, {"-v"}} {
		output := readVersionCommandOutput(binaryPath, args, timeout)
		if output == "" {
			continue
		}

		if isManagedWrapperMissingRealOutput(output) {
			return "", true
		}

		if matched := versionPattern.FindString(output); matched != "" {
			return matched, false
		}

		firstLine := strings.TrimSpace(strings.Split(output, "\n")[0])
		if firstLine != "" {
			return firstLine, false
		}
	}

	return "", false
}

func isManagedWrapperMissingRealOutput(output string) bool {
	normalized := strings.ToLower(output)
	return strings.Contains(normalized, "wrapper: real") && strings.Contains(normalized, "not found in path")
}

func readVersionCommandOutput(binaryPath string, args []string, timeout time.Duration) string {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, binaryPath, args...)
	output, err := command.CombinedOutput()
	if err != nil && len(output) == 0 {
		return ""
	}

	return strings.TrimSpace(string(output))
}
