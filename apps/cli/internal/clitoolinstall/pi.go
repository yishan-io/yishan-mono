package clitoolinstall

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// PiToolID is the tool ID of the pi coding agent CLI.
const PiToolID = "pi"

const (
	piNpmPackage           = "@earendil-works/pi-coding-agent"
	piInstallScriptURL     = "https://pi.dev/install.sh"
	piInstallTimeout       = 5 * time.Minute
	piMaxOutputChars       = 2_000
	piLatestVersionTTL     = time.Hour
	piLatestVersionTimeout = 3 * time.Second
	piMaxResponseBytes     = 64 * 1024
)

// piLatestVersionURL is a var so tests can point the check at a local server.
var piLatestVersionURL = "https://registry.npmjs.org/@earendil-works/pi-coding-agent/latest"

// PiInstaller installs the pi CLI globally via npm, falling back to the
// official pi.dev install script when npm is not available on this node.
type PiInstaller struct{}

// ToolID returns the stable tool identifier "pi".
func (PiInstaller) ToolID() string { return PiToolID }

// Install installs the pi CLI globally on this node.
func (PiInstaller) Install(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, piInstallTimeout)
	defer cancel()

	env := shellenv.ResolveEnvWithUserPath(os.Environ(), "")
	npmPath := resolveNpmPath(env)
	if npmPath != "" {
		if runtime.GOOS == "windows" {
			// npm ships as a .cmd shim on Windows; Go's exec cannot run batch
			// files directly, so delegate to cmd.exe which resolves npm via PATH.
			return runCommand(ctx, env, "cmd.exe", "/c", "npm", "install", "-g", "--ignore-scripts", piNpmPackage)
		}
		return runCommand(ctx, env, npmPath, "install", "-g", "--ignore-scripts", piNpmPackage)
	}

	if runtime.GOOS == "windows" {
		return fmt.Errorf("npm is required to install the %s CLI on Windows", PiToolID)
	}

	return runCommand(ctx, env, "sh", "-c", "curl -fsSL "+piInstallScriptURL+" | sh")
}

// Uninstall is not supported: removing the user's global npm package is destructive.
func (PiInstaller) Uninstall(ctx context.Context) error {
	return ErrUnsupportedUninstall
}

// SupportsUninstall reports that pi has no supported uninstall path.
func (PiInstaller) SupportsUninstall() bool { return false }

// PiLatestVersion returns the newest published pi version from the npm registry.
// Best-effort with a short cache; returns "" when the check fails.
func PiLatestVersion(ctx context.Context) string {
	return piLatestVersionWithClient(ctx, &http.Client{Timeout: piLatestVersionTimeout})
}

func piLatestVersionWithClient(ctx context.Context, client *http.Client) string {
	if version, ok := loadCachedPiLatestVersion(); ok {
		return version
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, piLatestVersionURL, nil)
	if err != nil {
		return ""
	}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, piMaxResponseBytes))
	if err != nil {
		return ""
	}
	version := parseNpmRegistryLatestVersion(body)
	if version != "" {
		storeCachedPiLatestVersion(version)
	}
	return version
}

// parseNpmRegistryLatestVersion extracts the `version` field from the npm
// registry "latest" dist-tag payload.
func parseNpmRegistryLatestVersion(body []byte) string {
	var payload struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Version)
}

type piLatestVersionCacheEntry struct {
	version   string
	expiresAt time.Time
}

var piLatestVersionCache struct {
	mu    sync.Mutex
	value piLatestVersionCacheEntry
}

func loadCachedPiLatestVersion() (string, bool) {
	piLatestVersionCache.mu.Lock()
	defer piLatestVersionCache.mu.Unlock()
	now := time.Now()
	if piLatestVersionCache.value.version == "" || now.After(piLatestVersionCache.value.expiresAt) {
		return "", false
	}
	return piLatestVersionCache.value.version, true
}

func storeCachedPiLatestVersion(version string) {
	piLatestVersionCache.mu.Lock()
	defer piLatestVersionCache.mu.Unlock()
	piLatestVersionCache.value = piLatestVersionCacheEntry{
		version:   version,
		expiresAt: time.Now().Add(piLatestVersionTTL),
	}
}

func resetPiLatestVersionCacheForTest() {
	piLatestVersionCache.mu.Lock()
	defer piLatestVersionCache.mu.Unlock()
	piLatestVersionCache.value = piLatestVersionCacheEntry{}
}

// resolveNpmPath finds npm using the resolved user PATH, or the process PATH
// on Windows where PATHEXT shims (npm.cmd) are handled by exec.LookPath.
func resolveNpmPath(env []string) string {
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("npm"); err == nil {
			return path
		}
		return ""
	}
	return shellenv.ResolveExecutablePathFromEnv("npm", env)
}

// runCommand executes one command and returns a wrapped error with bounded output.
func runCommand(ctx context.Context, env []string, command string, args ...string) error {
	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Env = env
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %s failed: %w: %s", command, strings.Join(args, " "), err, trimCommandOutput(output))
	}
	return nil
}

// trimCommandOutput keeps the tail of command output bounded for error messages.
func trimCommandOutput(output []byte) string {
	text := strings.TrimSpace(string(output))
	if len(text) > piMaxOutputChars {
		text = text[len(text)-piMaxOutputChars:]
	}
	return text
}
