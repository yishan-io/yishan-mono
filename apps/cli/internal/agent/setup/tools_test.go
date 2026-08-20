package setup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestParsePiToolCatalog_DeduplicatesNamesInOrder(t *testing.T) {
	output := []byte("noise\n" + toolCatalogMarker + `["read","grep","read"]` + "\n")
	tools, err := parsePiToolCatalog(output)
	if err != nil {
		t.Fatalf("parsePiToolCatalog: %v", err)
	}
	if got := strings.Join(tools, ","); got != "read,grep" {
		t.Fatalf("tools = %q, want read,grep", got)
	}
}

func TestParsePiToolCatalog_RejectsEmptyOrMissingCatalog(t *testing.T) {
	for _, output := range [][]byte{[]byte("noise"), []byte(toolCatalogMarker + `[]`), []byte(toolCatalogMarker + `[""]`)} {
		if _, err := parsePiToolCatalog(output); err == nil {
			t.Fatalf("parsePiToolCatalog(%q) succeeded, want error", output)
		}
	}
}

func TestLoadPiToolCatalog_ClosesInputAndWaitsForSessionShutdown(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell collector fixture is unix-only")
	}
	homeDir := withPiHome(t)
	binDir := t.TempDir()
	argsPath, inputPath, collectorPath := filepath.Join(binDir, "args"), filepath.Join(binDir, "input"), filepath.Join(binDir, "collector")
	workingDirPath, lifecyclePath := filepath.Join(binDir, "working-dir"), filepath.Join(binDir, "lifecycle")
	writeCatalogPi(t, binDir, argsPath, inputPath, collectorPath, workingDirPath, lifecyclePath)
	original := managedPiEnvBase
	managedPiEnvBase = func() []string { return []string{"PATH=" + binDir} }
	t.Cleanup(func() { managedPiEnvBase = original })

	tools, err := loadPiToolCatalog(context.Background())
	if err != nil {
		t.Fatalf("loadPiToolCatalog: %v", err)
	}
	if strings.Join(tools, ",") != "read,grep" {
		t.Fatalf("tools = %v, want [read grep]", tools)
	}
	if got := string(mustReadFile(t, argsPath)); !strings.Contains(got, "--mode rpc --no-session --no-context-files --extension") {
		t.Fatalf("unexpected args: %q", got)
	}
	if got := string(mustReadFile(t, inputPath)); got != `{"type":"prompt","message":"/yishan-tool-catalog"}` {
		t.Fatalf("stdin = %q", got)
	}
	if got := string(mustReadFile(t, lifecyclePath)); got != "session_shutdown" {
		t.Fatalf("collector lifecycle = %q, want session_shutdown after stdin EOF", got)
	}
	if _, err := os.Stat(strings.TrimSpace(string(mustReadFile(t, collectorPath)))); !os.IsNotExist(err) {
		t.Fatalf("collector was not removed: %v", err)
	}
	wantWorkingDir, err := filepath.EvalSymlinks(filepath.Join(homeDir, ".yishan", "pi", "agent"))
	if err != nil {
		t.Fatalf("resolve managed Pi agent directory: %v", err)
	}
	gotWorkingDir, err := filepath.EvalSymlinks(strings.TrimSpace(string(mustReadFile(t, workingDirPath))))
	if err != nil {
		t.Fatalf("resolve collector working directory: %v", err)
	}
	if gotWorkingDir != wantWorkingDir {
		t.Fatalf("collector working directory = %q, want managed Pi agent directory %q", gotWorkingDir, wantWorkingDir)
	}
}

func TestListPiTools_CoalescesAndDoesNotCachePreInvalidationLoad(t *testing.T) {
	resetPiToolCatalogCache(t)
	started := make(chan struct{})
	release := make(chan struct{})
	var mu sync.Mutex
	loads := 0
	toolCatalogLoader = func(context.Context) ([]string, error) {
		mu.Lock()
		loads++
		call := loads
		mu.Unlock()
		if call == 1 {
			close(started)
			<-release
			return []string{"stale"}, nil
		}
		return []string{"fresh"}, nil
	}
	t.Cleanup(func() { toolCatalogLoader = loadPiToolCatalog })

	first := make(chan []string, 1)
	second := make(chan []string, 1)
	go loadToolsForTest(first)
	<-started
	go loadToolsForTest(second)
	InvalidatePiToolCatalog()
	close(release)
	for _, results := range []chan []string{first, second} {
		if got := <-results; strings.Join(got, ",") != "fresh" {
			t.Fatalf("tools = %v, want [fresh]", got)
		}
	}
	if loads != 2 {
		t.Fatalf("loader calls = %d, want 2", loads)
	}
}

func loadToolsForTest(results chan<- []string) {
	tools, err := ListPiTools(context.Background())
	if err != nil {
		results <- nil
		return
	}
	results <- tools
}

func resetPiToolCatalogCache(t *testing.T) {
	t.Helper()
	piToolCatalogCache.Lock()
	piToolCatalogCache.tools = nil
	piToolCatalogCache.expiresAt = time.Time{}
	piToolCatalogCache.generation = 0
	piToolCatalogCache.loading = nil
	piToolCatalogCache.Unlock()
}

func writeCatalogPi(t *testing.T, binDir, argsPath, inputPath, collectorPath, workingDirPath, lifecyclePath string) {
	t.Helper()
	script := "#!/bin/sh\nprintf '%s' \"$*\" > " + shellQuote(argsPath) + "\nIFS= read -r input; printf '%s' \"$input\" > " + shellQuote(inputPath) + "\nif IFS= read -r extra; then echo 'stdin did not close' >&2; exit 1; fi\nprintf '%s' \"${!#}\" > " + shellQuote(collectorPath) + "\npwd > " + shellQuote(workingDirPath) + "\nprintf 'session_shutdown' > " + shellQuote(lifecyclePath) + "\nprintf '" + toolCatalogMarker + `["read","grep","read"]\n'
`
	if err := os.WriteFile(filepath.Join(binDir, "pi"), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
}

func shellQuote(value string) string { return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'" }

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return contents
}

func TestRunToolCatalogCollector_ReportsCommandFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell collector fixture is unix-only")
	}
	withPiHome(t)
	binDir := t.TempDir()
	collectorPath := filepath.Join(binDir, "collector")
	script := "#!/bin/sh\nprintf '%s' \"${!#}\" > " + shellQuote(collectorPath) + "\necho failed >&2\nexit 1\n"
	if err := os.WriteFile(filepath.Join(binDir, "pi"), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
	original := managedPiEnvBase
	managedPiEnvBase = func() []string { return []string{"PATH=" + binDir} }
	t.Cleanup(func() { managedPiEnvBase = original })
	if _, err := loadPiToolCatalog(context.Background()); err == nil || !strings.Contains(err.Error(), "run pi tool catalog") {
		t.Fatalf("error = %v, want contextual command failure", err)
	}
	if _, err := os.Stat(strings.TrimSpace(string(mustReadFile(t, collectorPath)))); !os.IsNotExist(err) {
		t.Fatalf("collector was not removed after failure: %v", err)
	}
}

func TestRunToolCatalogCollector_ReportsTimeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell collector fixture is unix-only")
	}
	withPiHome(t)
	binDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(binDir, "pi"), []byte("#!/bin/sh\nwhile :; do :; done\n"), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
	originalEnv, originalTimeout := managedPiEnvBase, toolCatalogTimeout
	managedPiEnvBase = func() []string { return []string{"PATH=" + binDir} }
	toolCatalogTimeout = 10 * time.Millisecond
	t.Cleanup(func() { managedPiEnvBase, toolCatalogTimeout = originalEnv, originalTimeout })
	if _, err := runToolCatalogCollector(context.Background(), "collector.ts"); err == nil || !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Fatalf("error = %v, want contextual timeout", err)
	}
}

func TestPiExtensionOperations_InvalidateToolCatalog(t *testing.T) {
	skipHermeticBinaryResolutionOnWindows(t)
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "pi")
	originalExec := execCommandContext
	execCommandContext = func(context.Context, string, ...string) *exec.Cmd { return exec.Command("true") }
	t.Cleanup(func() { execCommandContext = originalExec })

	for _, operation := range []func(context.Context, string) error{InstallPiExtension, UpdatePiExtension, RemovePiExtension} {
		resetPiToolCatalogCache(t)
		loads := 0
		toolCatalogLoader = func(context.Context) ([]string, error) {
			loads++
			return []string{fmt.Sprintf("tool-%d", loads)}, nil
		}
		if _, err := ListPiTools(context.Background()); err != nil {
			t.Fatalf("ListPiTools before mutation: %v", err)
		}
		if err := operation(context.Background(), "npm:test"); err != nil {
			t.Fatalf("mutation: %v", err)
		}
		if _, err := ListPiTools(context.Background()); err != nil {
			t.Fatalf("ListPiTools after mutation: %v", err)
		}
		if loads != 2 {
			t.Fatalf("loader calls = %d, want 2", loads)
		}
	}
	t.Cleanup(func() { toolCatalogLoader = loadPiToolCatalog })
}
