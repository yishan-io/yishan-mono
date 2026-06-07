package modellist

import (
	"os/exec"
	"sort"
	"strings"
)

type piFetcher struct{}

func (f piFetcher) AgentKind() string { return "pi" }

func (f piFetcher) Fetch() ([]ModelInfo, error) {
	cmd := exec.Command("pi", "--list-models")
	var stderr strings.Builder
	cmd.Stderr = &stderr
	stdout, err := cmd.Output()
	if err != nil && len(stdout) == 0 && stderr.Len() == 0 {
		return nil, err
	}
	text := string(stdout)
	if strings.TrimSpace(text) == "" {
		text = stderr.String()
	}
	return parsePiModels(text), nil
}

func parsePiModels(raw string) []ModelInfo {
	lines := strings.Split(raw, "\n")
	models := make([]ModelInfo, 0)
	seen := make(map[string]struct{})
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if isPiNoise(trimmed) {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) == 0 {
			continue
		}
		first := fields[0]
		if strings.EqualFold(first, "provider") {
			continue
		}
		var id string
		if strings.ContainsAny(first, ":/") {
			id = strings.Replace(first, ":", "/", 1)
		} else if len(fields) >= 2 {
			id = first + "/" + fields[1]
		} else {
			continue
		}
		if slash := strings.Index(id, "/"); slash <= 0 || slash == len(id)-1 {
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

func isPiNoise(line string) bool {
	lower := strings.ToLower(line)
	if strings.Contains(lower, "no models match pattern") {
		return true
	}
	return strings.HasPrefix(lower, "warning:") ||
		strings.HasPrefix(lower, "error:") ||
		strings.HasPrefix(lower, "info:")
}

type cursorFetcher struct{}

func (f cursorFetcher) AgentKind() string { return "cursor" }

func (f cursorFetcher) Fetch() ([]ModelInfo, error) {
	cmd := exec.Command("cursor", "--list-models")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	return parseCursorModels(string(output)), nil
}

func parseCursorModels(raw string) []ModelInfo {
	lines := strings.Split(raw, "\n")
	models := make([]ModelInfo, 0)
	seen := make(map[string]struct{})
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		idx := strings.Index(trimmed, " - ")
		if idx <= 0 {
			continue
		}
		id := strings.TrimSpace(trimmed[:idx])
		if !isAgentIdentifier(id) {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		label := strings.TrimSpace(trimmed[idx+3:])
		if paren := strings.Index(label, "("); paren > 0 {
			label = strings.TrimSpace(label[:paren])
		}
		if label == "" {
			label = id
		}
		models = append(models, ModelInfo{ID: id, Name: label})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models
}

func isAgentIdentifier(s string) bool {
	if s == "" {
		return false
	}
	first := s[0]
	if !((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z')) {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_' || r == '.' || r == '/':
		default:
			return false
		}
	}
	return true
}
