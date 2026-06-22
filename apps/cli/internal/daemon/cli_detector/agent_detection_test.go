package clidetector

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestListAgentCLIDetectionStatusesWithOptionsDetectsVersion(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	writeExecutableScript(t, binDir, "opencode", "0.11.3")
	writeExecutableScript(t, binDir, "codex", "1.2.0")

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      binDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{},
		VersionTimeout: 500 * time.Millisecond,
	})

	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	if len(statuses) != len(SupportedAgentCLIKinds) {
		t.Fatalf("expected %d statuses, got %d", len(SupportedAgentCLIKinds), len(statuses))
	}

	opencodeStatus := statusByAgent["opencode"]
	if !opencodeStatus.Detected {
		t.Fatalf("expected opencode to be detected")
	}
	if opencodeStatus.Version != "0.11.3" {
		t.Fatalf("expected opencode version 0.11.3, got %q", opencodeStatus.Version)
	}

	codexStatus := statusByAgent["codex"]
	if !codexStatus.Detected {
		t.Fatalf("expected codex to be detected")
	}
	if codexStatus.Version != "1.2.0" {
		t.Fatalf("expected codex version 1.2.0, got %q", codexStatus.Version)
	}

	claudeStatus := statusByAgent["claude"]
	if claudeStatus.Detected {
		t.Fatalf("expected claude to be undetected")
	}
	if claudeStatus.Version != "" {
		t.Fatalf("expected claude version to be empty, got %q", claudeStatus.Version)
	}

	geminiStatus := statusByAgent["gemini"]
	if geminiStatus.Detected {
		t.Fatalf("expected gemini to be undetected")
	}
	if geminiStatus.Version != "" {
		t.Fatalf("expected gemini version to be empty, got %q", geminiStatus.Version)
	}

	piStatus := statusByAgent["pi"]
	if piStatus.Detected {
		t.Fatalf("expected pi to be undetected")
	}
	if piStatus.Version != "" {
		t.Fatalf("expected pi version to be empty, got %q", piStatus.Version)
	}

	copilotStatus := statusByAgent["copilot"]
	if copilotStatus.Detected {
		t.Fatalf("expected copilot to be undetected")
	}
	if copilotStatus.Version != "" {
		t.Fatalf("expected copilot version to be empty, got %q", copilotStatus.Version)
	}

	cursorStatus := statusByAgent["cursor-agent"]
	if cursorStatus.Detected {
		t.Fatalf("expected cursor to be undetected")
	}
	if cursorStatus.Version != "" {
		t.Fatalf("expected cursor version to be empty, got %q", cursorStatus.Version)
	}

}

func TestListAgentCLIDetectionStatusesWithOptionsDetectsAgentBinaryNames(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	writeExecutableScript(t, binDir, "copilot", "3.0.0")
	writeExecutableScript(t, binDir, "cursor", "1.0.0")

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      binDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{},
		VersionTimeout: 500 * time.Millisecond,
	})

	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	copilotStatus := statusByAgent["copilot"]
	if !copilotStatus.Detected {
		t.Fatalf("expected copilot to be detected by copilot binary")
	}
	if copilotStatus.Version != "3.0.0" {
		t.Fatalf("expected copilot version 3.0.0, got %q", copilotStatus.Version)
	}

	cursorStatus := statusByAgent["cursor-agent"]
	if !cursorStatus.Detected {
		t.Fatalf("expected cursor-agent to be detected by cursor binary")
	}
	if cursorStatus.Version != "1.0.0" {
		t.Fatalf("expected cursor version 1.0.0, got %q", cursorStatus.Version)
	}
}

func TestListAgentCLIDetectionStatusesWithOptionsUsesPiDashDashVersionOnly(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	piPath := filepath.Join(binDir, "pi")
	piScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"--version\" ]; then\n" +
		"  echo 'pi 1.2.3'\n" +
		"  exit 0\n" +
		"fi\n" +
		"echo 'wrong invocation' 1>&2\n" +
		"exit 1\n"
	if err := os.WriteFile(piPath, []byte(piScript), 0o755); err != nil {
		t.Fatalf("write pi script %q: %v", piPath, err)
	}

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      binDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{},
		VersionTimeout: 500 * time.Millisecond,
	})

	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	piStatus := statusByAgent["pi"]
	if !piStatus.Detected {
		t.Fatalf("expected pi to be detected")
	}
	if piStatus.Version != "1.2.3" {
		t.Fatalf("expected pi version 1.2.3, got %q", piStatus.Version)
	}
}

func TestListAgentCLIDetectionStatusesWithOptionsUsesCommandEnvForVersionCheck(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	nodePath := filepath.Join(binDir, "node")
	nodeScript := "#!/bin/sh\necho 'node 20.1.0'\n"
	if err := os.WriteFile(nodePath, []byte(nodeScript), 0o755); err != nil {
		t.Fatalf("write node script %q: %v", nodePath, err)
	}

	piPath := filepath.Join(binDir, "pi")
	piScript := "#!/bin/sh\n" +
		"node --version\n"
	if err := os.WriteFile(piPath, []byte(piScript), 0o755); err != nil {
		t.Fatalf("write pi script %q: %v", piPath, err)
	}

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      binDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		CommandEnv:     []string{"PATH=" + binDir},
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{},
		VersionTimeout: 500 * time.Millisecond,
	})

	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	piStatus := statusByAgent["pi"]
	if !piStatus.Detected {
		t.Fatalf("expected pi to be detected when command env PATH includes node")
	}
	if piStatus.Version != "20.1.0" {
		t.Fatalf("expected pi version 20.1.0 from nested node command, got %q", piStatus.Version)
	}
}

func TestListAgentCLIDetectionStatusesWithOptionsSkipsExcludedDirectories(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	excludedBinDir := t.TempDir()
	writeExecutableScript(t, excludedBinDir, "claude", "2.0.1")

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      excludedBinDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{normalizeDirectoryPath(excludedBinDir): {}},
		VersionTimeout: 500 * time.Millisecond,
	})

	for _, status := range statuses {
		if status.AgentKind != "claude" {
			continue
		}

		if status.Detected {
			t.Fatalf("expected claude in excluded directory to be undetected")
		}
		if status.Version != "" {
			t.Fatalf("expected claude version to be empty, got %q", status.Version)
		}
	}
}

func TestListAgentCLIDetectionStatusesWithOptionsTreatsBrokenWrapperAsUndetected(t *testing.T) {
	t.Setenv("PATH", "")

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	brokenWrapperPath := filepath.Join(binDir, "gemini")
	brokenWrapper := "#!/bin/sh\necho 'yishan wrapper: real gemini not found in PATH' 1>&2\nexit 1\n"
	if err := os.WriteFile(brokenWrapperPath, []byte(brokenWrapper), 0o755); err != nil {
		t.Fatalf("write broken wrapper %q: %v", brokenWrapperPath, err)
	}

	statuses := listAgentCLIDetectionStatusesWithOptions(agentDetectionOptions{
		PathValue:      binDir,
		PathExtValue:   ".COM;.EXE;.BAT;.CMD",
		IsWindows:      false,
		ExcludedDirs:   map[string]struct{}{},
		VersionTimeout: 500 * time.Millisecond,
	})

	for _, status := range statuses {
		if status.AgentKind != "gemini" {
			continue
		}

		if status.Detected {
			t.Fatalf("expected gemini broken wrapper to be treated as undetected")
		}
		if status.Version != "" {
			t.Fatalf("expected gemini version to be empty, got %q", status.Version)
		}
	}
}

func TestResolveUserShellUsesEnvVariable(t *testing.T) {
	t.Setenv("SHELL", "/bin/custom-shell")

	result := resolveUserShell()

	if result != "/bin/custom-shell" {
		t.Fatalf("expected /bin/custom-shell, got %q", result)
	}
}

func TestResolveUserShellFallsBackToKnownShells(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test targets unix-style shells")
	}

	t.Setenv("SHELL", "")

	result := resolveUserShell()

	// On any unix system at least /bin/sh should exist.
	if result == "" {
		t.Fatal("expected a fallback shell path, got empty string")
	}

	knownShells := map[string]bool{"/bin/zsh": true, "/bin/bash": true, "/bin/sh": true}
	if !knownShells[result] {
		t.Fatalf("expected one of /bin/zsh, /bin/bash, /bin/sh, got %q", result)
	}
}

func TestResolveUserShellReturnsEmptyWhenNothingAvailable(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("on unix systems fallback shells always exist")
	}

	t.Setenv("SHELL", "")

	result := resolveUserShell()

	if result != "" {
		t.Fatalf("expected empty string on windows, got %q", result)
	}
}

func TestListAgentCLIDetectionStatusesCachesWithinTTL(t *testing.T) {
	t.Setenv("PATH", "")
	t.Setenv(agentDetectionCacheTTLEnvKey, "5m")
	resetAgentDetectionCacheForTest()
	t.Cleanup(resetAgentDetectionCacheForTest)
	stubDetectionRuntimeResolvers(t)

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	t.Setenv("PATH", binDir)
	writeExecutableScript(t, binDir, "opencode", "0.11.3")

	firstStatuses := ListAgentCLIDetectionStatuses()
	firstByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range firstStatuses {
		firstByAgent[status.AgentKind] = status
	}
	if firstByAgent["opencode"].Version != "0.11.3" {
		t.Fatalf("expected first detection to read opencode version 0.11.3, got %q", firstByAgent["opencode"].Version)
	}

	writeExecutableScript(t, binDir, "opencode", "9.9.9")
	secondStatuses := ListAgentCLIDetectionStatuses()
	secondByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range secondStatuses {
		secondByAgent[status.AgentKind] = status
	}

	if secondByAgent["opencode"].Version != "0.11.3" {
		t.Fatalf("expected cached opencode version 0.11.3 within TTL, got %q", secondByAgent["opencode"].Version)
	}
}

func TestListAgentCLIDetectionStatusesRefreshesAfterTTLExpiry(t *testing.T) {
	t.Setenv("PATH", "")
	t.Setenv(agentDetectionCacheTTLEnvKey, "50ms")
	resetAgentDetectionCacheForTest()
	t.Cleanup(resetAgentDetectionCacheForTest)
	stubDetectionRuntimeResolvers(t)

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	t.Setenv("PATH", binDir)
	writeExecutableScript(t, binDir, "opencode", "0.11.3")

	_ = ListAgentCLIDetectionStatuses()
	writeExecutableScript(t, binDir, "opencode", "9.9.9")
	time.Sleep(80 * time.Millisecond)

	statuses := ListAgentCLIDetectionStatuses()
	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	if statusByAgent["opencode"].Version != "9.9.9" {
		t.Fatalf("expected refreshed opencode version 9.9.9 after TTL expiry, got %q", statusByAgent["opencode"].Version)
	}
}

func TestListAgentCLIDetectionStatusesUsesCachedResultWhenPathChangesWithinTTL(t *testing.T) {
	t.Setenv(agentDetectionCacheTTLEnvKey, "5m")
	resetAgentDetectionCacheForTest()
	t.Cleanup(resetAgentDetectionCacheForTest)
	stubDetectionRuntimeResolvers(t)

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	firstBinDir := t.TempDir()
	secondBinDir := t.TempDir()
	writeExecutableScript(t, firstBinDir, "opencode", "0.11.3")
	writeExecutableScript(t, secondBinDir, "opencode", "2.0.0")

	t.Setenv("PATH", firstBinDir)
	_ = ListAgentCLIDetectionStatuses()

	t.Setenv("PATH", secondBinDir)
	statuses := ListAgentCLIDetectionStatuses()
	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	if statusByAgent["opencode"].Version != "0.11.3" {
		t.Fatalf("expected cached result to be reused within TTL and stay at 0.11.3, got %q", statusByAgent["opencode"].Version)
	}
}

func TestListAgentCLIDetectionStatusesForceRefreshBypassesTTLCache(t *testing.T) {
	t.Setenv("PATH", "")
	t.Setenv(agentDetectionCacheTTLEnvKey, "5m")
	resetAgentDetectionCacheForTest()
	t.Cleanup(resetAgentDetectionCacheForTest)
	stubDetectionRuntimeResolvers(t)

	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	t.Setenv("PATH", binDir)
	writeExecutableScript(t, binDir, "opencode", "0.11.3")

	_ = ListAgentCLIDetectionStatusesWithRefresh(false)
	writeExecutableScript(t, binDir, "opencode", "8.8.8")

	statuses := ListAgentCLIDetectionStatusesWithRefresh(true)
	statusByAgent := map[string]AgentCLIDetectionStatus{}
	for _, status := range statuses {
		statusByAgent[status.AgentKind] = status
	}

	if statusByAgent["opencode"].Version != "8.8.8" {
		t.Fatalf("expected force refresh to bypass cache and return 8.8.8, got %q", statusByAgent["opencode"].Version)
	}
}

func writeExecutableScript(t *testing.T, dir string, commandName string, version string) {
	t.Helper()

	scriptPath := filepath.Join(dir, commandName)
	script := fmt.Sprintf("#!/bin/sh\necho \"%s %s\"\n", commandName, version)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write executable script %q: %v", scriptPath, err)
	}
}

func stubDetectionRuntimeResolvers(t *testing.T) {
	t.Helper()

	previousResolveDetectionPathValueFunc := resolveDetectionPathValueFunc
	previousResolveDetectionCommandEnvFunc := resolveDetectionCommandEnvFunc

	resolveDetectionPathValueFunc = func() string {
		return os.Getenv("PATH")
	}
	resolveDetectionCommandEnvFunc = func() []string {
		return []string{"PATH=" + os.Getenv("PATH")}
	}

	t.Cleanup(func() {
		resolveDetectionPathValueFunc = previousResolveDetectionPathValueFunc
		resolveDetectionCommandEnvFunc = previousResolveDetectionCommandEnvFunc
	})
}
