package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/runtime/shellenv"
)

type piFetcher struct{}

func (f piFetcher) AgentKind() string { return "pi" }

func (f piFetcher) Fetch() ([]ModelInfo, error) {
	env := enrichedCLIEnv()
	piPath, err := resolveCLIBinary("pi", env)
	if err != nil {
		return nil, err
	}
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	env = shellenv.UpsertEnv(env, config.PiAgentDirEnvKey, piAgentDir)
	cmd := exec.Command(piPath, "--list-models")
	isolateCmd(cmd)
	cmd.Env = env
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
	models := parsePiModels(text)
	applyPiModelCapabilities(models, piAgentDir)
	return models, nil
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
		// pi --list-models prints "provider  model  context  max-out  thinking  images".
		// The thinking column (yes/no) sits at index 4 for two-column lines and at
		// index 3 when the provider and model are merged into one field.
		var id string
		var thinkingColumn string
		if strings.ContainsAny(first, ":/") {
			id = strings.Replace(first, ":", "/", 1)
			if len(fields) >= 4 {
				thinkingColumn = fields[3]
			}
		} else if len(fields) >= 2 {
			id = first + "/" + fields[1]
			if len(fields) >= 5 {
				thinkingColumn = fields[4]
			}
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
		models = append(models, ModelInfo{ID: id, Name: id, Reasoning: thinkingColumn == "yes"})
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

// piModelsStoreEntry is one model entry in the managed agent dir's
// models-store.json, the catalog pi itself uses at runtime.
type piModelsStoreEntry struct {
	ID string `json:"id"`
	// Reasoning is a pointer so a store entry that omits the key does not
	// downgrade the CLI-column-derived value to false.
	Reasoning        *bool              `json:"reasoning"`
	ThinkingLevelMap map[string]*string `json:"thinkingLevelMap"`
}

// applyPiModelCapabilities enriches parsed models with capability info. The
// --list-models "thinking" column already set Reasoning; when the managed
// agent dir has models-store.json, the catalog's authoritative reasoning and
// thinkingLevelMap override the column for matching models (they are what pi
// actually clamps against at session creation). Models absent from the store
// keep the column-derived reasoning.
func applyPiModelCapabilities(models []ModelInfo, agentDir string) {
	store := loadPiModelsStore(agentDir)
	for i := range models {
		provider, key, ok := splitModelID(models[i].ID)
		if !ok {
			continue
		}
		entry, found := store[provider][key]
		if !found {
			continue
		}
		if entry.Reasoning != nil {
			models[i].Reasoning = *entry.Reasoning
		}
		models[i].ThinkingLevelMap = entry.ThinkingLevelMap
	}
}

// loadPiModelsStore reads models-store.json from the managed agent dir. A
// missing or malformed file yields an empty store so callers fall back to the
// CLI-derived capabilities. Top-level keys are provider ids; each provider
// group has a models array whose entries carry bare ids.
func loadPiModelsStore(agentDir string) map[string]map[string]piModelsStoreEntry {
	store := map[string]map[string]piModelsStoreEntry{}
	data, err := os.ReadFile(filepath.Join(agentDir, "models-store.json"))
	if err != nil {
		return store
	}
	var providers map[string]struct {
		Models []piModelsStoreEntry `json:"models"`
	}
	if err := json.Unmarshal(data, &providers); err != nil {
		return store
	}
	for provider, group := range providers {
		byID := make(map[string]piModelsStoreEntry, len(group.Models))
		for _, entry := range group.Models {
			byID[entry.ID] = entry
		}
		store[provider] = byID
	}
	return store
}

// splitModelID splits a parsed "provider/model-key" id into its provider
// prefix and the model key (the part after the first slash, which is also the
// bare id used in models-store.json entries).
func splitModelID(id string) (provider string, key string, ok bool) {
	slash := strings.Index(id, "/")
	if slash <= 0 || slash == len(id)-1 {
		return "", "", false
	}
	return id[:slash], id[slash+1:], true
}

type cursorFetcher struct{}

func (f cursorFetcher) AgentKind() string { return "cursor" }

func (f cursorFetcher) Fetch() ([]ModelInfo, error) {
	cursorPath, err := resolveCLIBinary("cursor", enrichedCLIEnv())
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(cursorPath, "--list-models")
	isolateCmd(cmd)
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
