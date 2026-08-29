package dsh

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewCommandFactory_BuildsBundledRuntimeCommand(t *testing.T) {
	t.Setenv("yishan_dsh_test_replay", "1")
	nodePath := filepath.Join(t.TempDir(), "node")
	runtimePath := filepath.Join(t.TempDir(), "dsh-runtime.mjs")
	dataDir := filepath.Join(t.TempDir(), "account-dsh")

	command, err := NewCommandFactory(nodePath, runtimePath, dataDir, false)(context.Background())
	if err != nil {
		t.Fatalf("build command: %v", err)
	}
	if command.Path != nodePath {
		t.Fatalf("command path = %q, want %q", command.Path, nodePath)
	}
	if len(command.Args) != 2 || command.Args[1] != runtimePath {
		t.Fatalf("command args = %#v, want node plus runtime", command.Args)
	}
	if command.Dir != "" {
		t.Fatalf("command dir = %q, want empty", command.Dir)
	}
	if !hasEnvironment(command.Env, "ELECTRON_RUN_AS_NODE", "1") {
		t.Fatalf("command env = %#v, want ELECTRON_RUN_AS_NODE=1", command.Env)
	}
	if !hasEnvironment(command.Env, "YISHAN_DSH_DATA_DIR", dataDir) {
		t.Fatalf("command env = %#v, want account DSH data directory", command.Env)
	}
	if !hasEnvironment(command.Env, "YISHAN_DSH_DEVELOPER_MODE", "false") {
		t.Fatalf("command env = %#v, want explicit disabled developer mode", command.Env)
	}
	if hasEnvironmentKey(command.Env, dshTestReplayEnvKey) {
		t.Fatalf("command env = %#v, must not forward the test-only replay switch", command.Env)
	}
}

func TestNewCommandFactory_RejectsMissingExplicitPaths(t *testing.T) {
	pathRoot := t.TempDir()
	testCases := []struct {
		name        string
		nodePath    string
		runtimePath string
		dataDir     string
	}{
		{name: "node", runtimePath: filepath.Join(pathRoot, "runtime.mjs"), dataDir: filepath.Join(pathRoot, "data")},
		{name: "runtime", nodePath: filepath.Join(pathRoot, "node"), dataDir: filepath.Join(pathRoot, "data")},
		{name: "data", nodePath: filepath.Join(pathRoot, "node"), runtimePath: filepath.Join(pathRoot, "runtime.mjs")},
		{name: "node must not use PATH", nodePath: "node", runtimePath: filepath.Join(pathRoot, "runtime.mjs"), dataDir: filepath.Join(pathRoot, "data")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := NewCommandFactory(testCase.nodePath, testCase.runtimePath, testCase.dataDir, false)(context.Background())
			if err == nil {
				t.Fatal("factory accepted missing explicit path")
			}
		})
	}
}

func hasEnvironment(environment []string, key string, want string) bool {
	for _, variable := range environment {
		if variable == key+"="+want {
			return true
		}
	}
	return false
}

func hasEnvironmentKey(environment []string, key string) bool {
	for _, variable := range environment {
		environmentKey, _, _ := strings.Cut(variable, "=")
		if strings.EqualFold(environmentKey, key) {
			return true
		}
	}
	return false
}

func TestNewCommandFactory_NormalizesDeveloperModeAndStripsInheritedValue(t *testing.T) {
	t.Setenv("yishan_dsh_developer_mode", "true")
	pathRoot := t.TempDir()
	command, err := NewCommandFactory(
		filepath.Join(pathRoot, "node"),
		filepath.Join(pathRoot, "dsh-runtime.mjs"),
		filepath.Join(pathRoot, "data"),
		true,
	)(context.Background())
	if err != nil {
		t.Fatalf("build command: %v", err)
	}
	if !hasEnvironment(command.Env, "YISHAN_DSH_DEVELOPER_MODE", "true") {
		t.Fatalf("command env = %#v, want explicit enabled developer mode", command.Env)
	}
	if environmentKeyCount(command.Env, "YISHAN_DSH_DEVELOPER_MODE") != 1 {
		t.Fatalf("command env = %#v, want exactly one developer mode entry", command.Env)
	}
}

func environmentKeyCount(environment []string, key string) int {
	count := 0
	for _, variable := range environment {
		environmentKey, _, _ := strings.Cut(variable, "=")
		if strings.EqualFold(environmentKey, key) {
			count++
		}
	}
	return count
}
