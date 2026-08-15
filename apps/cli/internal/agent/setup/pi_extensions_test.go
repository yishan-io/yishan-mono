package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
)

func TestListPiExtensions_ClassifiesOfficialAndUser(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:" + piNotifyExtensionName, "npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, piNotifyExtensionName, nil, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	notify, ok := byName[piNotifyExtensionName]
	if !ok {
		t.Fatalf("expected official extension %s in list, got %v", piNotifyExtensionName, extensionNames(extensions))
	}
	if !notify.Official {
		t.Fatalf("expected %s to be official, got %#v", piNotifyExtensionName, notify)
	}
	if !notify.Installed || notify.Version != "1.2.3" {
		t.Fatalf("expected installed official extension with version 1.2.3, got %#v", notify)
	}

	user, ok := byName["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected user extension pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Official {
		t.Fatalf("expected pi-web-fetch to be user-installed, got %#v", user)
	}
	if !user.Installed || user.Version != "1.2.3" {
		t.Fatalf("expected installed user extension with version, got %#v", user)
	}
}

func TestListPiExtensions_OfficialMissingFromSettingsIsUninstalled(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, nil, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	if len(extensions) != len(defaultPiExtensionNames) {
		t.Fatalf("expected %d official extensions on clean settings, got %d: %v", len(defaultPiExtensionNames), len(extensions), extensionNames(extensions))
	}
	for _, ext := range extensions {
		if !ext.Official {
			t.Fatalf("expected only official extensions, got %#v", ext)
		}
		if ext.Installed {
			t.Fatalf("expected official extension %s to be uninstalled on clean home, got %#v", ext.Name, ext)
		}
	}
}

func TestListPiExtensions_ObjectPackageEntriesNormalized(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	settingsPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "settings.json")
	content := `{"packages": [{"source": "npm:pi-web-fetch", "filter": "**"}], "extensions": ["./local-ext.ts"]}`
	if err := os.WriteFile(settingsPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	user, ok := byName["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected normalized object entry pi-web-fetch, got %v", extensionNames(extensions))
	}
	if user.Source != "npm:pi-web-fetch" || user.Official || user.Installed {
		t.Fatalf("expected normalized user package entry, got %#v", user)
	}

	local, ok := byName["local-ext.ts"]
	if !ok {
		t.Fatalf("expected local-file extension entry, got %v", extensionNames(extensions))
	}
	if local.Source != PiExtensionSourceLocalFile || !local.Installed || local.Official {
		t.Fatalf("expected read-only local-file entry, got %#v", local)
	}
}

func TestListPiExtensions_ReadmeFallbackDescription(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "@yishan-io/pi-task", nil, nil)
	// Official packages ship no package.json description; the README summary
	// line must fill in.
	homeDir, _ := os.UserHomeDir()
	pkgDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-task")
	readme := "# @yishan-io/pi-task\n\nA Pi package for Yishan task workflow guidance.\n\nMore details...\n"
	if err := os.WriteFile(filepath.Join(pkgDir, "README.md"), []byte(readme), 0o644); err != nil {
		t.Fatalf("write README: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	task, ok := extensionsByName(extensions)["@yishan-io/pi-task"]
	if !ok {
		t.Fatalf("expected @yishan-io/pi-task in list, got %v", extensionNames(extensions))
	}
	if task.Description != "A Pi package for Yishan task workflow guidance." {
		t.Fatalf("expected README summary description, got %q", task.Description)
	}
}

func TestListPiExtensions_ReportsPackageDescription(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)
	// writeNPMPackage writes a package.json without a description; add one.
	homeDir, _ := os.UserHomeDir()
	pkgJSONPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "pi-web-fetch", "package.json")
	content, err := os.ReadFile(pkgJSONPath)
	if err != nil {
		t.Fatalf("read package.json: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(content, &metadata); err != nil {
		t.Fatalf("decode package.json: %v", err)
	}
	metadata["description"] = "Fetch web pages as markdown"
	updated, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("marshal package.json: %v", err)
	}
	if err := os.WriteFile(pkgJSONPath, updated, 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	user, ok := extensionsByName(extensions)["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Description != "Fetch web pages as markdown" {
		t.Fatalf("expected package description, got %q", user.Description)
	}
}

// resetExtensionUpdateCache clears the shared update cache so tests are
// order-independent.
func resetExtensionUpdateCache() {
	extensionUpdateCache.Lock()
	extensionUpdateCache.entries = map[string]extensionUpdateCacheEntry{}
	extensionUpdateCache.Unlock()
}

func TestCheckPiExtensionUpdates_FillsLatestVersion(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch", "npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)       // installed 1.2.3
	writeNPMPackage(t, "@yishan-io/pi-task", nil, nil) // installed 1.2.3

	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		if name == "pi-web-fetch" {
			return "2.0.0", nil // newer than installed
		}
		return "1.2.3", nil // same as installed
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions)

	byName := extensionsByName(extensions)
	fetch := byName["pi-web-fetch"]
	if !fetch.HasUpdate || fetch.LatestVersion != "2.0.0" {
		t.Fatalf("expected update info for pi-web-fetch, got %#v", fetch)
	}
	task := byName["@yishan-io/pi-task"]
	if task.HasUpdate || task.LatestVersion != "" {
		t.Fatalf("expected no update info when versions match, got %#v", task)
	}
}

func TestCheckPiExtensionUpdates_OnlyFlagsStrictlyNewerLatest(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil) // installed 1.2.3

	originalFetcher := latestVersionFetcher
	defer func() { latestVersionFetcher = originalFetcher }()

	cases := []struct {
		name       string
		latest     string
		wantUpdate bool
	}{
		{"higher", "2.0.0", true},
		{"equal", "1.2.3", false},
		{"lower", "1.2.2", false},
		{"unparseable", "not-a-version", false},
		{"empty", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resetExtensionUpdateCache()
			latestVersionFetcher = func(_ context.Context, name string) (string, error) {
				return tc.latest, nil
			}

			extensions, err := ListPiExtensions()
			if err != nil {
				t.Fatalf("ListPiExtensions: %v", err)
			}
			CheckPiExtensionUpdates(context.Background(), extensions)

			fetch := extensionsByName(extensions)["pi-web-fetch"]
			if fetch.HasUpdate != tc.wantUpdate {
				t.Fatalf("latest %q: HasUpdate = %v, want %v", tc.latest, fetch.HasUpdate, tc.wantUpdate)
			}
			if tc.wantUpdate {
				if fetch.LatestVersion != tc.latest {
					t.Fatalf("latest %q: LatestVersion = %q, want %q", tc.latest, fetch.LatestVersion, tc.latest)
				}
			} else if fetch.LatestVersion != "" {
				t.Fatalf("latest %q: LatestVersion = %q, want empty", tc.latest, fetch.LatestVersion)
			}
		})
	}
}

func TestIsNewerVersion(t *testing.T) {
	cases := []struct {
		latest    string
		installed string
		want      bool
	}{
		{"2.0.0", "1.2.3", true},
		{"1.3.0", "1.2.3", true},
		{"1.2.4", "1.2.3", true},
		{"1.2.3", "1.2.3", false},
		{"1.2.2", "1.2.3", false},
		{"1.0.0", "1.2.3", false},
		{"2.0.0", "2.0.0-beta.1", true},  // release > prerelease
		{"2.0.0-beta.1", "2.0.0", false}, // prerelease < release
		{"2.0.0-beta.2", "2.0.0-beta.1", true},
		{"2.0.0", "2.1.0-beta.1", false}, // installed prerelease ahead of registry stable
		{"1.9.9", "2.0.0-beta.1", false},
		{"not-a-version", "1.2.3", false},
		{"2.0.0", "not-a-version", false},
		{"", "1.2.3", false},
		{"2.0.0", "", false},
	}
	for _, tc := range cases {
		if got := isNewerVersion(tc.latest, tc.installed); got != tc.want {
			t.Fatalf("isNewerVersion(%q, %q) = %v, want %v", tc.latest, tc.installed, got, tc.want)
		}
	}
}

func TestCheckPiExtensionUpdates_SkipsUninstalledAndLocalFile(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch", "npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil) // installed
	// @yishan-io/pi-task is listed but NOT installed.

	fetchCount := 0
	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		fetchCount++
		return "9.9.9", nil
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions)
	if fetchCount != 1 {
		t.Fatalf("expected exactly one registry fetch (installed package only), got %d", fetchCount)
	}
}

func TestCheckPiExtensionUpdates_FailureDegradesGracefully(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		return "", fmt.Errorf("registry unreachable")
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions) // must not error

	fetch := extensionsByName(extensions)["pi-web-fetch"]
	if fetch.HasUpdate || fetch.LatestVersion != "" {
		t.Fatalf("expected no update info on registry failure, got %#v", fetch)
	}
}

func TestCheckPiExtensionUpdates_CachesResultsWithinTTL(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	fetchCount := 0
	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		fetchCount++
		return "2.0.0", nil
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	for round := 0; round < 3; round++ {
		CheckPiExtensionUpdates(context.Background(), extensions)
	}
	if fetchCount != 1 {
		t.Fatalf("expected registry fetched once within TTL, got %d fetches", fetchCount)
	}
}

func TestFetchLatestVersionFromRegistry_EncodesScopedNameAndParsesVersion(t *testing.T) {
	originalBase := npmRegistryBase
	originalClient := registryClient
	defer func() {
		npmRegistryBase = originalBase
		registryClient = originalClient
	}()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/@yishan-io%2Fpi-task/latest" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"name":"@yishan-io/pi-task","version":"2.0.0"}`))
	}))
	defer server.Close()
	npmRegistryBase = server.URL
	registryClient = server.Client()

	version, err := fetchLatestVersionFromRegistry(context.Background(), "@yishan-io/pi-task")
	if err != nil {
		t.Fatalf("fetchLatestVersionFromRegistry: %v", err)
	}
	if version != "2.0.0" {
		t.Fatalf("expected version 2.0.0, got %q", version)
	}
}

func TestListPiExtensions_UserPackageNotInstalledInNodeModules(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	user, ok := extensionsByName(extensions)["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Installed || user.Version != "" {
		t.Fatalf("expected package absent from node_modules to be uninstalled with no version, got %#v", user)
	}
}

func TestPiExtensionOps_InvokePiWithManagedEnv(t *testing.T) {
	skipHermeticBinaryResolutionOnWindows(t)
	withPiHome(t)
	fakePiPath := stubManagedPiEnvWithFakeBinary(t, "pi")
	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()

	type recordedCall struct {
		name string
		args []string
		cmd  *exec.Cmd
	}
	calls := make([]recordedCall, 0, 5)
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		cmd := exec.Command("true")
		calls = append(calls, recordedCall{name: name, args: append([]string{}, args...), cmd: cmd})
		return cmd
	}

	for _, source := range []string{"npm:foo/bar", "git:owner/repo@main", "/tmp/local-ext"} {
		if err := InstallPiExtension(context.Background(), source); err != nil {
			t.Fatalf("InstallPiExtension(%q): %v", source, err)
		}
	}
	if err := UpdatePiExtension(context.Background(), "npm:foo/bar"); err != nil {
		t.Fatalf("UpdatePiExtension: %v", err)
	}
	if err := RemovePiExtension(context.Background(), "npm:pi-web-fetch"); err != nil {
		t.Fatalf("RemovePiExtension: %v", err)
	}

	wantArgs := [][]string{
		{"install", "npm:foo/bar"},
		{"install", "git:owner/repo@main"},
		{"install", "/tmp/local-ext"},
		{"install", "npm:foo/bar"},
		{"uninstall", "npm:pi-web-fetch"},
	}
	if len(calls) != len(wantArgs) {
		t.Fatalf("expected %d pi calls, got %d", len(wantArgs), len(calls))
	}
	expectedAgentDir := filepath.Join(os.Getenv("HOME"), ".yishan", "pi", "agent")
	for index, call := range calls {
		if call.name != fakePiPath {
			t.Fatalf("expected pi command resolved to %q, got %q", fakePiPath, call.name)
		}
		if strings.Join(call.args, "|") != strings.Join(wantArgs[index], "|") {
			t.Fatalf("call %d: expected args %v, got %v", index, wantArgs[index], call.args)
		}
		if !strings.Contains(strings.Join(call.cmd.Env, "\n"), config.PiAgentDirEnvKey+"="+expectedAgentDir) {
			t.Fatalf("call %d: expected managed pi env %s in %v", index, config.PiAgentDirEnvKey+"="+expectedAgentDir, call.cmd.Env)
		}
	}
}

func TestRemoveDefaultPiExtensions_UninstallsWithNpmPrefix(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "pi")
	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()

	var allArgs [][]string
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		allArgs = append(allArgs, append([]string{}, args...))
		return exec.Command("true")
	}

	if err := RemoveDefaultPiExtensions(); err != nil {
		t.Fatalf("RemoveDefaultPiExtensions: %v", err)
	}
	if len(allArgs) != len(defaultPiExtensionNames) {
		t.Fatalf("expected %d uninstall calls, got %d", len(defaultPiExtensionNames), len(allArgs))
	}
	for index, args := range allArgs {
		if len(args) != 2 || args[0] != "uninstall" {
			t.Fatalf("call %d: expected uninstall, got %v", index, args)
		}
		// pi matches removals by source identity — the npm: prefix is required.
		want := "npm:" + defaultPiExtensionNames[index]
		if args[1] != want {
			t.Fatalf("call %d: expected uninstall target %q (source identity), got %q", index, want, args[1])
		}
	}
}

// skipHermeticBinaryResolutionOnWindows skips tests that inject a fake
// extension binary without a PATHEXT extension (pi.exe, npx.cmd): on Windows
// resolution falls through to the real binary on the process PATH, so the
// hermetic path/error assertions cannot hold. (Windows GUI processes keep the
// full user PATH, so the GUI-launch bug class this guards against is rare
// there.)
func skipHermeticBinaryResolutionOnWindows(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("hermetic fake-binary resolution is unix-only")
	}
}

// stubManagedPiEnvWithFakeBinary swaps managedPiEnvBase for a controlled PATH
// containing a fake <binary> executable, so commands resolve binaries
// hermetically without spawning a login shell. It returns the resolved fake
// binary path.
func stubManagedPiEnvWithFakeBinary(t *testing.T, binary string) string {
	t.Helper()
	binDir := t.TempDir()
	fakePath := filepath.Join(binDir, binary)
	if err := os.WriteFile(fakePath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake %s binary: %v", binary, err)
	}
	original := managedPiEnvBase
	managedPiEnvBase = func() []string { return []string{"PATH=" + binDir} }
	t.Cleanup(func() { managedPiEnvBase = original })
	return fakePath
}

func TestNewPiCommand_ResolvesPiAgainstManagedEnvPath(t *testing.T) {
	skipHermeticBinaryResolutionOnWindows(t)
	withPiHome(t)
	fakePiPath := stubManagedPiEnvWithFakeBinary(t, "pi")

	cmd, err := newPiCommand(context.Background(), "install", "npm:foo/bar")
	if err != nil {
		t.Fatalf("newPiCommand: %v", err)
	}
	if cmd.Path != fakePiPath {
		t.Fatalf("cmd.Path = %q, want resolved fake pi %q", cmd.Path, fakePiPath)
	}
	if got := strings.Join(cmd.Args[1:], " "); got != "install npm:foo/bar" {
		t.Fatalf("args = %q, want %q", got, "install npm:foo/bar")
	}
	expectedAgentDir := filepath.Join(os.Getenv("HOME"), ".yishan", "pi", "agent")
	if !strings.Contains(strings.Join(cmd.Env, "\n"), config.PiAgentDirEnvKey+"="+expectedAgentDir) {
		t.Fatalf("expected managed pi env %s in %v", config.PiAgentDirEnvKey+"="+expectedAgentDir, cmd.Env)
	}
}

func TestNewPiCommand_FailsWhenPiNotResolvable(t *testing.T) {
	skipHermeticBinaryResolutionOnWindows(t)
	withPiHome(t)
	original := managedPiEnvBase
	managedPiEnvBase = func() []string { return []string{"PATH="} }
	t.Cleanup(func() { managedPiEnvBase = original })

	if _, err := newPiCommand(context.Background(), "install", "npm:foo"); err == nil {
		t.Fatal("expected error when pi is not resolvable")
	}
}

func TestListPiExtensions_GitSourceInstalledState(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	settingsPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"packages": ["git:owner/repo@main", "git:gitlab.com/group/project", "git:https://example.com/org/ext"]}`), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}

	// Only the github.com one is installed on disk.
	gitRoot := filepath.Join(homeDir, ".yishan", "pi", "agent", "git")
	writePkgJSON(t, filepath.Join(gitRoot, "github.com", "owner", "repo"), "1.0.0")

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	installed, ok := byName["repo"]
	if !ok {
		t.Fatalf("expected git shorthand entry repo, got %v", extensionNames(extensions))
	}
	if !installed.Installed || installed.Version != "1.0.0" {
		t.Fatalf("expected installed github shorthand with version, got %#v", installed)
	}

	notInstalled, ok := byName["project"]
	if !ok {
		t.Fatalf("expected gitlab entry project, got %v", extensionNames(extensions))
	}
	if notInstalled.Installed || notInstalled.Version != "" {
		t.Fatalf("expected uninstalled gitlab entry, got %#v", notInstalled)
	}

	httpsEntry, ok := byName["ext"]
	if !ok {
		t.Fatalf("expected https entry ext, got %v", extensionNames(extensions))
	}
	if httpsEntry.Installed || httpsEntry.Version != "" {
		t.Fatalf("expected uninstalled https entry, got %#v", httpsEntry)
	}
}

func TestExtensionNameFromSource_HandlesAllSpecForms(t *testing.T) {
	cases := []struct {
		source string
		want   string
	}{
		{"npm:pi-web-fetch", "pi-web-fetch"},
		{"npm:@yishan-io/pi-notify@1.2.3", "@yishan-io/pi-notify"},
		{"git:owner/repo@main", "repo"},
		{"git:git@github.com:user/repo", "repo"},
		{"git:https://github.com/org/ext", "ext"},
		{"git:gitlab.com/group/project", "project"},
		{"/tmp/local-ext.ts", "local-ext.ts"},
	}
	for _, tc := range cases {
		if got := extensionNameFromSource(tc.source); got != tc.want {
			t.Fatalf("extensionNameFromSource(%q) = %q, want %q", tc.source, got, tc.want)
		}
	}
}

func TestParseGitSourceParts_AllSpecForms(t *testing.T) {
	cases := []struct {
		spec string
		host string
		path string
	}{
		{"owner/repo@main", "github.com", "owner/repo"},
		{"git@github.com:user/repo", "github.com", "user/repo"},
		{"git@github.com:user/repo@main", "github.com", "user/repo"},
		{"https://github.com/org/ext", "github.com", "org/ext"},
		{"ssh://git@gitlab.com/group/project", "gitlab.com", "group/project"},
		{"gitlab.com/group/project", "gitlab.com", "group/project"},
		{"local-path", "", ""},
	}
	for _, tc := range cases {
		host, path := parseGitSourceParts(tc.spec)
		if host != tc.host || path != tc.path {
			t.Fatalf("parseGitSourceParts(%q) = (%q, %q), want (%q, %q)", tc.spec, host, path, tc.host, tc.path)
		}
	}
}

func writePkgJSON(t *testing.T, dir string, version string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"test","version":"`+version+`"}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
}

func extensionsByName(extensions []PiExtensionInfo) map[string]PiExtensionInfo {
	byName := make(map[string]PiExtensionInfo, len(extensions))
	for _, ext := range extensions {
		byName[ext.Name] = ext
	}
	return byName
}

func extensionNames(extensions []PiExtensionInfo) []string {
	names := make([]string, 0, len(extensions))
	for _, ext := range extensions {
		names = append(names, ext.Name)
	}
	return names
}
