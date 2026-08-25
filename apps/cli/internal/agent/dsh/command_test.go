package dsh

import (
	"context"
	"path/filepath"
	"slices"
	"testing"
)

func TestNewCommandFactory_BuildsBundledRuntimeCommand(t *testing.T) {
	nodePath := filepath.Join(t.TempDir(), "node")
	runtimePath := filepath.Join(t.TempDir(), "dsh-runtime.mjs")
	dataDir := filepath.Join(t.TempDir(), "account-dsh")

	command, err := NewCommandFactory(nodePath, runtimePath, dataDir)(context.Background())
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
			_, err := NewCommandFactory(testCase.nodePath, testCase.runtimePath, testCase.dataDir)(context.Background())
			if err == nil {
				t.Fatal("factory accepted missing explicit path")
			}
		})
	}
}

func hasEnvironment(environment []string, key string, want string) bool {
	return slices.Contains(environment, key+"="+want)
}
