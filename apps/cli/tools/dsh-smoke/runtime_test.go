package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestVerifySourceRevision(t *testing.T) {
	sourceRoot := t.TempDir()
	runGit(t, sourceRoot, "init")
	runGit(t, sourceRoot, "config", "user.email", "smoke@example.com")
	runGit(t, sourceRoot, "config", "user.name", "DSH Smoke")
	fixturePath := filepath.Join(sourceRoot, "fixture.txt")
	if err := os.WriteFile(fixturePath, []byte("clean\n"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	runGit(t, sourceRoot, "add", "fixture.txt")
	runGit(t, sourceRoot, "commit", "-m", "fixture")
	revision := strings.TrimSpace(runGit(t, sourceRoot, "rev-parse", "HEAD"))
	if err := verifySourceRevision(sourceRoot, revision); err != nil {
		t.Fatalf("verify source revision: %v", err)
	}
	if err := verifySourceRevision(sourceRoot, strings.Repeat("0", 40)); err == nil {
		t.Fatal("verify source revision succeeded for a different revision")
	}
	if err := os.WriteFile(fixturePath, []byte("dirty\n"), 0o600); err != nil {
		t.Fatalf("modify fixture: %v", err)
	}
	if err := verifySourceRevision(sourceRoot, revision); err == nil {
		t.Fatal("verify source revision succeeded for a dirty checkout")
	}
}

func TestBuildSourceRuntime_UsesPinnedACPDemoEntrypoint(t *testing.T) {
	sourceRoot := "/tmp/deepseek-harness"
	runtime, err := buildSourceRuntime(sourceRoot)
	if err != nil {
		t.Fatalf("build source runtime: %v", err)
	}
	if runtime.command != "node" {
		t.Fatalf("command = %q, want node", runtime.command)
	}
	wantArgs := []string{
		"--import", "tsx",
		filepath.Join(sourceRoot, "packages/examples/acp-demo/src/bin.ts"),
		"--config", filepath.Join(sourceRoot, "examples/acp-agent/cordis.yml"),
	}
	if !slices.Equal(runtime.args, wantArgs) {
		t.Fatalf("args = %#v, want %#v", runtime.args, wantArgs)
	}
	if runtime.dir != sourceRoot {
		t.Fatalf("dir = %q, want %q", runtime.dir, sourceRoot)
	}
	if runtime.env["DSH_SNAPSHOT"] != "replay" {
		t.Fatalf("DSH_SNAPSHOT = %q, want replay", runtime.env["DSH_SNAPSHOT"])
	}
	wantFixture := filepath.Join(sourceRoot, "examples/acp-agent/tests/snapshots/handshake/session.jsonl")
	if runtime.env["DSH_SNAPSHOT_FILE"] != wantFixture {
		t.Fatalf("DSH_SNAPSHOT_FILE = %q, want %q", runtime.env["DSH_SNAPSHOT_FILE"], wantFixture)
	}
}

func TestBuildSourceRuntime_RejectsRelativeRoot(t *testing.T) {
	_, err := buildSourceRuntime("relative/deepseek-harness")
	if err == nil {
		t.Fatal("build source runtime succeeded for relative source root")
	}
}

func runGit(t *testing.T, sourceRoot string, args ...string) string {
	t.Helper()
	commandArgs := append([]string{"-C", sourceRoot}, args...)
	output, err := exec.Command("git", commandArgs...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, output)
	}
	return string(output)
}
