package modellist

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"

	"yishan/apps/cli/internal/runtime/shellenv"
)

const opencodeAgentKind = "opencode"

type opencodeFetcher struct{}

func (f opencodeFetcher) AgentKind() string { return opencodeAgentKind }

func (f opencodeFetcher) Fetch() ([]ModelInfo, error) {
	env := shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	opencodePath := shellenv.ResolveExecutablePathFromEnv("opencode", env)
	if opencodePath == "" {
		return nil, fmt.Errorf("opencode not found in resolved PATH")
	}

	cmd := exec.Command(opencodePath, "models")
	isolateCmd(cmd)
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf
	output, err := cmd.Output()
	if err != nil {
		if stderrBuf.Len() > 0 {
			return nil, fmt.Errorf("opencode models: %w (stderr: %s)", err, stderrBuf.String())
		}
		return nil, fmt.Errorf("opencode models: %w", err)
	}
	return parseOpenCodeModels(string(output)), nil
}

func parseOpenCodeModels(output string) []ModelInfo {
	lines := strings.Split(output, "\n")
	models := make([]ModelInfo, 0)
	seen := make(map[string]struct{})
	for _, line := range lines {
		id := parseOpenCodeModelLine(strings.TrimSpace(line))
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		models = append(models, ModelInfo{ID: id, Name: id})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models
}

func parseOpenCodeModelLine(line string) string {
	if line == "" {
		return ""
	}
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return ""
	}
	id := fields[0]
	if strings.HasPrefix(id, "\"") || strings.HasPrefix(id, "{") || strings.HasPrefix(id, "[") {
		return ""
	}
	if !strings.Contains(id, "/") {
		return ""
	}
	if id == strings.ToUpper(id) {
		return ""
	}
	return id
}
