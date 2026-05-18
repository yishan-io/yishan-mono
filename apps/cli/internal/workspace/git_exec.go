package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"yishan/apps/cli/internal/workspace/shellenv"
)

func gitCommand(ctx context.Context, cwd string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", cwd}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", NewRPCError(-32010, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", err
	}
	return string(out), nil
}

func gitCommandCombined(ctx context.Context, cwd string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", cwd}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", NewRPCError(-32010, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func ghCommand(ctx context.Context, cwd string, args ...string) (string, error) {
	env := shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	ghPath := shellenv.ResolveExecutablePathFromEnv("gh", env)
	if ghPath == "" {
		return "", NewRPCError(-32010, "GitHub CLI (gh) is not installed")
	}

	cmd := exec.CommandContext(ctx, ghPath, args...)
	cmd.Dir = cwd
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return "", NewRPCError(-32010, "GitHub CLI (gh) is not installed")
		}
		return "", NewRPCError(-32010, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func ghJSON(ctx context.Context, cwd string, target any, args ...string) error {
	out, err := ghCommand(ctx, cwd, args...)
	if err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(out), target); err != nil {
		return NewRPCError(-32010, "failed to parse gh output")
	}
	return nil
}

func parseStatusOutput(raw string) GitStatusResponse {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return GitStatusResponse{Branch: "", Files: nil, Raw: ""}
	}

	lines := make([]string, 0)
	for line := range strings.SplitSeq(raw, "\n") {
		lines = append(lines, line)
	}
	resp := GitStatusResponse{Raw: raw}
	if len(lines) > 0 && strings.HasPrefix(lines[0], "##") {
		resp.Branch = strings.TrimSpace(strings.TrimPrefix(lines[0], "##"))
		lines = lines[1:]
	}

	files := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) > 3 {
			files = append(files, strings.TrimSpace(line[3:]))
		} else {
			files = append(files, line)
		}
	}
	resp.Files = files
	return resp
}

func parseNumstat(raw string) map[string][2]int {
	out := map[string][2]int{}
	for line := range strings.SplitSeq(strings.TrimSpace(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		var add, del int
		fmt.Sscanf(parts[0], "%d", &add)
		fmt.Sscanf(parts[1], "%d", &del)
		out[parts[2]] = [2]int{add, del}
	}
	return out
}

func statValue(v [2]int) (int, int) {
	return v[0], v[1]
}

func normalizeStatusPath(path string) string {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return ""
	}

	arrowIndex := strings.LastIndex(trimmedPath, " -> ")
	if arrowIndex <= 0 {
		return strings.Trim(trimmedPath, "\"")
	}

	renameDestinationPath := strings.TrimSpace(trimmedPath[arrowIndex+4:])
	return strings.Trim(renameDestinationPath, "\"")
}

func mapStatusToKind(status byte) string {
	switch status {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	default:
		return "modified"
	}
}

func coalesceNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func splitNonEmptyLines(input string) []string {
	out := make([]string, 0)
	for line := range strings.SplitSeq(input, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}
