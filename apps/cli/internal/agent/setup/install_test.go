package setup

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/platform/config"
)

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
