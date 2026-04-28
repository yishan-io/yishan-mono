package daemon

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const managedBinDirEnvKey = "MANAGED_BIN_DIR"

const loginShellPathTimeout = 1 * time.Second

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`)

// SupportedAgentCLIKinds contains all supported agent CLIs that can be detected on one node.
var SupportedAgentCLIKinds = []string{"opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor"}

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
	{Kind: "copilot", Commands: []string{"copilot", "github-copilot"}},
	{Kind: "cursor", Commands: []string{"cursor", "cursor-agent"}},
}

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
func ListAgentCLIDetectionStatuses() []AgentCLIDetectionStatus {
	options := agentDetectionOptions{
		PathValue:      resolveDetectionPathValue(),
		PathExtValue:   os.Getenv("PATHEXT"),
		IsWindows:      runtime.GOOS == "windows",
		ExcludedDirs:   resolveExcludedDirectories(),
		VersionTimeout: 2 * time.Second,
	}

	return listAgentCLIDetectionStatusesWithOptions(options)
}

func resolveDetectionPathValue() string {
	pathValues := []string{os.Getenv("PATH")}

	if runtime.GOOS != "windows" {
		pathValues = append(pathValues, readLoginShellPath(loginShellPathTimeout))
		pathValues = append(pathValues, commonUserBinDirectories()...)
	}

	return strings.Join(pathValues, string(os.PathListSeparator))
}

func readLoginShellPath(timeout time.Duration) string {
	shellPath := strings.TrimSpace(os.Getenv("SHELL"))
	if shellPath == "" {
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, shellPath, "-l", "-c", `printf %s "$PATH"`)
	output, err := command.Output()
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(output))
}

func commonUserBinDirectories() []string {
	directories := []string{"/opt/homebrew/bin", "/usr/local/bin"}
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return directories
	}

	return append(directories,
		filepath.Join(homeDir, ".opencode", "bin"),
		filepath.Join(homeDir, ".local", "bin"),
		filepath.Join(homeDir, ".bun", "bin"),
		filepath.Join(homeDir, ".npm-global", "bin"),
		filepath.Join(homeDir, "go", "bin"),
	)
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

			statuses[index] = AgentCLIDetectionStatus{
				AgentKind: agentCLI.Kind,
				Detected:  true,
				Version:   detectAgentCLIVersion(binaryPath, options.VersionTimeout),
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

func detectAgentCLIVersion(binaryPath string, timeout time.Duration) string {
	for _, args := range [][]string{{"--version"}, {"version"}, {"-v"}} {
		output := readVersionCommandOutput(binaryPath, args, timeout)
		if output == "" {
			continue
		}

		if matched := versionPattern.FindString(output); matched != "" {
			return matched
		}

		firstLine := strings.TrimSpace(strings.Split(output, "\n")[0])
		if firstLine != "" {
			return firstLine
		}
	}

	return ""
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
