package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	pinnedDSHRevision       = "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"
	dshACPDemoRelativePath  = "packages/examples/acp-demo/src/bin.ts"
	dshACPConfigRelative    = "examples/acp-agent/cordis.yml"
	dshHandshakeFixturePath = "examples/acp-agent/tests/snapshots/handshake/session.jsonl"
	dshTextTurnFixturePath  = "examples/acp-agent/tests/snapshots/text-turn/session.jsonl"

	handshakeScenario = "handshake"
	textTurnScenario  = "text-turn"
)

type sourceRuntime struct {
	command string
	args    []string
	dir     string
	env     map[string]string
}

func verifySourceRevision(sourceRoot, expectedRevision string) error {
	command := exec.Command("git", "-C", sourceRoot, "rev-parse", "HEAD")
	output, err := command.Output()
	if err != nil {
		return fmt.Errorf("read DSH source revision: %w", err)
	}
	actualRevision := strings.TrimSpace(string(output))
	if actualRevision != expectedRevision {
		return fmt.Errorf("DSH source revision = %s, want %s", actualRevision, expectedRevision)
	}
	status := exec.Command("git", "-C", sourceRoot, "status", "--porcelain", "--untracked-files=no")
	statusOutput, err := status.Output()
	if err != nil {
		return fmt.Errorf("read DSH source status: %w", err)
	}
	if len(statusOutput) > 0 {
		return fmt.Errorf("DSH source has tracked changes")
	}
	return nil
}

func buildSourceRuntime(sourceRoot string) (sourceRuntime, error) {
	return buildSourceRuntimeForScenario(sourceRoot, handshakeScenario)
}

func buildSourceRuntimeForScenario(sourceRoot, scenario string) (sourceRuntime, error) {
	if !filepath.IsAbs(sourceRoot) {
		return sourceRuntime{}, fmt.Errorf("DSH source root must be absolute")
	}
	fixturePath, err := getScenarioFixturePath(scenario)
	if err != nil {
		return sourceRuntime{}, err
	}
	environment := map[string]string{
		"DSH_SNAPSHOT":      "replay",
		"DSH_SNAPSHOT_FILE": filepath.Join(sourceRoot, fixturePath),
	}
	return sourceRuntime{
		command: "node",
		args: []string{
			"--import", "tsx",
			filepath.Join(sourceRoot, dshACPDemoRelativePath),
			"--config", filepath.Join(sourceRoot, dshACPConfigRelative),
		},
		dir: sourceRoot,
		env: environment,
	}, nil
}

func getScenarioFixturePath(scenario string) (string, error) {
	switch scenario {
	case handshakeScenario:
		return dshHandshakeFixturePath, nil
	case textTurnScenario:
		return dshTextTurnFixturePath, nil
	default:
		return "", fmt.Errorf("unsupported DSH smoke scenario %q", scenario)
	}
}
