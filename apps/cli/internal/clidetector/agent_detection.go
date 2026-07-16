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

	"yishan/apps/cli/internal/agentkind"
	"yishan/apps/cli/internal/runtime/shellenv"
)

const managedBinDirEnvKey = "MANAGED_BIN_DIR"
const agentDetectionCacheTTLEnvKey = "AGENT_CLI_DETECTION_CACHE_TTL"
const defaultAgentDetectionCacheTTL = time.Hour

const loginShellPathTimeout = 3 * time.Second

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`)

// SupportedAgentCLIKinds contains all supported agent CLIs that can be detected on one node.
// "cursor-agent" is kept as a distinct detection kind because the cursor binary reports itself
// differently to the hook system.
var SupportedAgentCLIKinds = []string{
	agentkind.OpenCode, agentkind.Codex, agentkind.Claude,
	agentkind.Gemini, agentkind.Pi, agentkind.Copilot, "cursor-agent",
}

type supportedAgentCLI struct {
	Kind     string
	Commands []string
}

var supportedAgentCLIs = []supportedAgentCLI{
	{Kind: agentkind.OpenCode, Commands: []string{agentkind.OpenCode}},
	{Kind: agentkind.Codex, Commands: []string{agentkind.Codex}},
	{Kind: agentkind.Claude, Commands: []string{agentkind.Claude}},
	{Kind: agentkind.Gemini, Commands: []string{agentkind.Gemini}},
	{Kind: agentkind.Pi, Commands: []string{agentkind.Pi}},
	{Kind: agentkind.Copilot, Commands: []string{agentkind.Copilot}},
	{Kind: "cursor-agent", Commands: []string{agentkind.Cursor}},
}

type cachedAgentDetectionResult struct {
	CacheKey  string
	ExpiresAt time.Time
	Statuses  []AgentCLIDetectionStatus
}

type agentDetectionCache struct {
	mu    sync.RWMutex
	value cachedAgentDetectionResult
}

func newAgentDetectionCache() *agentDetectionCache {
	return &agentDetectionCache{}
}

func (c *agentDetectionCache) load(cacheKey string, ttl time.Duration) ([]AgentCLIDetectionStatus, bool) {
	if ttl <= 0 {
		return nil, false
	}

	now := time.Now()
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.value.CacheKey != cacheKey {
		return nil, false
	}
	if now.After(c.value.ExpiresAt) {
		return nil, false
	}

	return cloneAgentDetectionStatuses(c.value.Statuses), true
}

func (c *agentDetectionCache) loadAny(ttl time.Duration) ([]AgentCLIDetectionStatus, bool) {
	if ttl <= 0 {
		return nil, false
	}

	now := time.Now()
	c.mu.RLock()
	defer c.mu.RUnlock()

	if now.After(c.value.ExpiresAt) {
		return nil, false
	}
	if len(c.value.Statuses) == 0 {
		return nil, false
	}

	return cloneAgentDetectionStatuses(c.value.Statuses), true
}

func (c *agentDetectionCache) store(cacheKey string, ttl time.Duration, statuses []AgentCLIDetectionStatus) {
	if ttl <= 0 {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.value = cachedAgentDetectionResult{
		CacheKey:  cacheKey,
		ExpiresAt: time.Now().Add(ttl),
		Statuses:  cloneAgentDetectionStatuses(statuses),
	}
}

func (c *agentDetectionCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value = cachedAgentDetectionResult{}
}

var defaultAgentDetectionCache = newAgentDetectionCache()

// AgentCLIDetectionStatus captures one supported agent CLI detection result.
type AgentCLIDetectionStatus struct {
	AgentKind string `json:"agentKind"`
	Detected  bool   `json:"detected"`
	Version   string `json:"version,omitempty"`
}

type agentDetectionOptions struct {
	PathValue      string
	PathExtValue   string
	CommandEnv     []string
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
		if statuses, ok := defaultAgentDetectionCache.loadAny(ttl); ok {
			return statuses
		}
	}

	options := agentDetectionOptions{
		PathValue:      resolveDetectionPathValue(),
		PathExtValue:   os.Getenv("PATHEXT"),
		CommandEnv:     resolveDetectionCommandEnv(),
		IsWindows:      runtime.GOOS == "windows",
		ExcludedDirs:   resolveExcludedDirectories(),
		VersionTimeout: 2 * time.Second,
	}
	return ListAgentCLIDetectionStatusesWithRuntimeOptions(forceRefresh, options, ttl)
}

func ListAgentCLIDetectionStatusesWithRuntimeOptions(forceRefresh bool, options agentDetectionOptions, ttl time.Duration) []AgentCLIDetectionStatus {
	cacheKey := buildAgentDetectionCacheKey(options)

	if !forceRefresh {
		if statuses, ok := defaultAgentDetectionCache.load(cacheKey, ttl); ok {
			return statuses
		}
	}

	statuses := listAgentCLIDetectionStatusesWithOptions(options)
	defaultAgentDetectionCache.store(cacheKey, ttl, statuses)

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

func cloneAgentDetectionStatuses(statuses []AgentCLIDetectionStatus) []AgentCLIDetectionStatus {
	cloned := make([]AgentCLIDetectionStatus, len(statuses))
	copy(cloned, statuses)
	return cloned
}

func resetAgentDetectionCacheForTest() {
	defaultAgentDetectionCache.reset()
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

	// Limit concurrent subprocess spawns so a cold-cache detection run (7 agents
	// × up to 3 --version probes each) does not spawn 21 processes simultaneously.
	const maxConcurrentDetections = 4
	sem := make(chan struct{}, maxConcurrentDetections)

	var waitGroup sync.WaitGroup
	waitGroup.Add(len(supportedAgentCLIs))
	for index, agentCLI := range supportedAgentCLIs {
		go func(index int, agentCLI supportedAgentCLI) {
			defer waitGroup.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			binaryPath, ok := findExecutableInPath(agentCLI.Commands, pathSegments, options)
			if !ok {
				statuses[index] = AgentCLIDetectionStatus{AgentKind: agentCLI.Kind, Detected: false}
				return
			}

			version, unusableWrapper := detectAgentCLIVersion(agentCLI.Kind, binaryPath, options.CommandEnv, options.VersionTimeout)
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

func detectAgentCLIVersion(agentKind string, binaryPath string, commandEnv []string, timeout time.Duration) (string, bool) {
	for _, args := range versionCommandArgsForAgent(agentKind) {
		output := readVersionCommandOutput(binaryPath, args, commandEnv, timeout)
		if output == "" {
			continue
		}

		if isManagedWrapperMissingRealOutput(output) {
			return "", true
		}

		firstLine := strings.TrimSpace(strings.Split(output, "\n")[0])
		if matched := versionPattern.FindString(firstLine); matched != "" {
			return matched, false
		}
		if matched := versionPattern.FindString(output); matched != "" {
			return matched, false
		}

		if firstLine != "" {
			return firstLine, false
		}
	}

	return "", false
}

func versionCommandArgsForAgent(agentKind string) [][]string {
	if agentKind == "pi" {
		return [][]string{{"--version"}, {}}
	}

	// Try the most common version flags first, then fall back to a bare
	// invocation for CLIs that print their version when run with no args.
	return [][]string{{"--version"}, {"version"}, {"-v"}, {}}
}

func isManagedWrapperMissingRealOutput(output string) bool {
	normalized := strings.ToLower(output)
	return strings.Contains(normalized, "wrapper: real") && strings.Contains(normalized, "not found in path")
}

func resolveDetectionCommandEnv() []string {
	return shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
}

func readVersionCommandOutput(binaryPath string, args []string, commandEnv []string, timeout time.Duration) string {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, binaryPath, args...)
	if len(commandEnv) > 0 {
		command.Env = commandEnv
	}
	output, err := command.CombinedOutput()
	if err != nil && len(output) == 0 {
		return ""
	}

	return strings.TrimSpace(string(output))
}
