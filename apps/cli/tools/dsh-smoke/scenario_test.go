package main

import (
	"path/filepath"
	"testing"
)

func TestBuildSourceRuntimeForScenario_UsesTextTurnFixture(t *testing.T) {
	sourceRoot := "/tmp/deepseek-harness"
	runtime, err := buildSourceRuntimeForScenario(sourceRoot, textTurnScenario)
	if err != nil {
		t.Fatalf("build source runtime: %v", err)
	}
	wantFixture := filepath.Join(sourceRoot, "examples/acp-agent/tests/snapshots/text-turn/session.jsonl")
	if runtime.env["DSH_SNAPSHOT_FILE"] != wantFixture {
		t.Fatalf("DSH_SNAPSHOT_FILE = %q, want %q", runtime.env["DSH_SNAPSHOT_FILE"], wantFixture)
	}
}

func TestBuildSourceRuntimeForScenario_RejectsUnknownScenario(t *testing.T) {
	_, err := buildSourceRuntimeForScenario("/tmp/deepseek-harness", "unknown")
	if err == nil {
		t.Fatal("build source runtime succeeded for unknown scenario")
	}
}
