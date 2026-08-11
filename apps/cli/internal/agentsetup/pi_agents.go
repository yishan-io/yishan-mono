package setup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"yishan/apps/cli/internal/config"
)

// Agent management: pi agent definition files live in the managed pi agents
// dir (<agentDir>/agents/<name>.md). The runtime identifies an agent by its
// file name; official agents are the 6 managed names synced from
// @yishan-io/pi-subagents/agents on `yishan setup`.

var (
	// ErrInvalidAgentName is returned when an agent name cannot be a safe
	// file basename (empty, or containing path separators / parent refs).
	ErrInvalidAgentName = errors.New("invalid agent name")
	// ErrManagedAgentName is returned when creating an agent with one of the
	// official managed names (those go through update/overwrite instead).
	ErrManagedAgentName = errors.New("agent name is a managed official agent")
	// ErrAgentAlreadyExists is returned when creating an agent whose file
	// already exists.
	ErrAgentAlreadyExists = errors.New("agent already exists")
	// ErrAgentNotFound is returned for update/remove/detail on unknown names.
	ErrAgentNotFound = errors.New("agent not found")
	// ErrOfficialAgentCannotBeRemoved is returned when removing a managed
	// official agent (use restore instead).
	ErrOfficialAgentCannotBeRemoved = errors.New("official agents cannot be removed")
	// ErrAgentNotManaged is returned when restoring a name with no shipped
	// official source (user agents have no managed source to restore).
	ErrAgentNotManaged = errors.New("agent has no managed official source")
	// ErrInvalidAgentThinking is returned when the thinking level is not one
	// of the pi-supported values (off|minimal|low|medium|high|xhigh).
	ErrInvalidAgentThinking = errors.New("invalid agent thinking level")
)

// agentNamePattern is the slug allowed for new agent names: lowercase
// letters, digits, and dashes (also a safe file basename).
var agentNamePattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// PiAgentInfo is one agent definition's metadata. Name is the file basename
// without .md — the identity pi uses at runtime. Model and Thinking mirror
// the agent frontmatter's optional per-agent overrides.
type PiAgentInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Model       string `json:"model"`
	Thinking    string `json:"thinking"`
	Official    bool   `json:"official"`
}

// PiAgentDetail adds the full file content (frontmatter + body) to the
// metadata; content is fetched via detail so list payloads stay small.
type PiAgentDetail struct {
	PiAgentInfo
	Content string `json:"content"`
}

// ListPiAgents enumerates the agent definition files in the managed pi agents
// dir, classified official vs user by the managed names list. Deterministic:
// official agents first, then name order.
func ListPiAgents() ([]PiAgentInfo, error) {
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(agentsDir)
	if os.IsNotExist(err) {
		return []PiAgentInfo{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read pi agents dir: %w", err)
	}

	agents := make([]PiAgentInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ".md")
		content, err := os.ReadFile(filepath.Join(agentsDir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read pi agent %s: %w", entry.Name(), err)
		}
		meta := parseAgentFrontMatter(content)
		model, thinking := meta.Model, meta.Thinking
		agents = append(agents, PiAgentInfo{
			Name:        name,
			Description: meta.Description,
			Model:       model,
			Thinking:    thinking,
			Official:    isManagedPiAgentName(name),
		})
	}

	sort.Slice(agents, func(i, j int) bool {
		if agents[i].Official != agents[j].Official {
			return agents[i].Official
		}
		return agents[i].Name < agents[j].Name
	})
	return agents, nil
}

// GetPiAgentDetail returns an agent's metadata and full file content.
func GetPiAgentDetail(name string) (*PiAgentDetail, error) {
	content, err := readPiAgentFile(name)
	if err != nil {
		return nil, err
	}
	meta := parseAgentFrontMatter(content)
	model, thinking := meta.Model, meta.Thinking
	return &PiAgentDetail{
		PiAgentInfo: PiAgentInfo{
			Name:        name,
			Description: meta.Description,
			Model:       model,
			Thinking:    thinking,
			Official:    isManagedPiAgentName(name),
		},
		Content: string(content),
	}, nil
}

// CreatePiAgent writes a new user agent definition: validated lowercase slug,
// not a managed official name, no existing file. The daemon builds the
// frontmatter (name, description, optional model/thinking, read_only: false)
// around the caller's prompt body. Model and thinking level are frontmatter
// fields of the agent definition, so they travel with the file.
func CreatePiAgent(name string, description string, content string, model string, thinking string) error {
	trimmedName := strings.TrimSpace(name)
	if !agentNamePattern.MatchString(trimmedName) {
		return fmt.Errorf("%w: %q (use lowercase letters, digits, and dashes)", ErrInvalidAgentName, trimmedName)
	}
	if isManagedPiAgentName(trimmedName) {
		return fmt.Errorf("%w: %q", ErrManagedAgentName, trimmedName)
	}
	if _, err := os.Stat(piAgentPath(trimmedName)); err == nil {
		return fmt.Errorf("%w: %q", ErrAgentAlreadyExists, trimmedName)
	}
	if err := ValidateAgentThinking(thinking); err != nil {
		return err
	}
	frontmatter := "---\nname: " + trimmedName + "\ndescription: " + yamlQuotedScalar(strings.TrimSpace(description))
	if model = strings.TrimSpace(model); model != "" {
		frontmatter += "\nmodel: " + yamlQuotedScalar(model)
	}
	if thinking = strings.TrimSpace(thinking); thinking != "" {
		frontmatter += "\nthinking: " + thinking
	}
	full := frontmatter + "\nread_only: false\n---\n\n" + content
	return writePiAgentFile(trimmedName, full)
}

// ValidateAgentThinking reports whether a thinking level is one of the
// pi-supported values (off|minimal|low|medium|high|xhigh|max). Empty is
// valid (no override).
func ValidateAgentThinking(thinking string) error {
	trimmed := strings.TrimSpace(thinking)
	if trimmed == "" {
		return nil
	}
	for _, level := range allowedAgentThinkingLevels {
		if trimmed == level {
			return nil
		}
	}
	return fmt.Errorf("%w: %q (use off|minimal|low|medium|high|xhigh|max)", ErrInvalidAgentThinking, trimmed)
}

// allowedAgentThinkingLevels mirrors pi's ALLOWED_THINKING_LEVELS.
var allowedAgentThinkingLevels = []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"}

// UpdatePiAgent overwrites an agent definition (official or user) with the
// given full file content — frontmatter plus body, exactly as returned by
// GetPiAgentDetail. A frontmatter name that diverges from the file name is
// rejected (pi identifies agents by file name). For official agents this is
// the overwrite-official flow the UI gates behind a confirmation.
func UpdatePiAgent(name string, content string) error {
	trimmedName := strings.TrimSpace(name)
	if err := validateAgentPathName(trimmedName); err != nil {
		return err
	}
	if _, err := piAgentFilePath(trimmedName); err != nil {
		return err
	}
	if frontMatterName := parseAgentFrontMatter([]byte(content)).Name; frontMatterName != "" && frontMatterName != trimmedName {
		return fmt.Errorf("%w: frontmatter name %q does not match agent file name %q", ErrInvalidAgentName, frontMatterName, trimmedName)
	}
	return writePiAgentFile(trimmedName, content)
}

// RemovePiAgent deletes a user agent definition. Official managed agents are
// rejected — restoring them is the supported flow.
func RemovePiAgent(name string) error {
	trimmedName := strings.TrimSpace(name)
	if err := validateAgentPathName(trimmedName); err != nil {
		return err
	}
	if isManagedPiAgentName(trimmedName) {
		return fmt.Errorf("%w: %q", ErrOfficialAgentCannotBeRemoved, trimmedName)
	}
	path, err := piAgentFilePath(trimmedName)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

// RestorePiAgent force-writes the shipped official content for a managed
// agent (bypassing the sync clobber guard) and refreshes its manifest entry,
// so a subsequent `yishan setup` no longer treats the file as user-modified.
func RestorePiAgent(name string) error {
	trimmedName := strings.TrimSpace(name)
	if err := validateAgentPathName(trimmedName); err != nil {
		return err
	}
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return err
	}
	sourceDir, err := managedPiSubagentsAgentsDir()
	if err != nil {
		return err
	}
	sourceContent, err := os.ReadFile(filepath.Join(sourceDir, trimmedName+".md"))
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w: %q", ErrAgentNotManaged, trimmedName)
		}
		return fmt.Errorf("read managed source for %s: %w", trimmedName, err)
	}
	targetPath := filepath.Join(agentsDir, trimmedName+".md")
	if err := os.WriteFile(targetPath, sourceContent, 0o644); err != nil {
		return fmt.Errorf("restore pi agent %s: %w", trimmedName, err)
	}
	manifest := loadManagedAgentManifest(agentsDir)
	manifest.Files[trimmedName+".md"] = fileSHA256(targetPath)
	return saveManagedAgentManifest(agentsDir, manifest)
}

func isManagedPiAgentName(name string) bool {
	for _, fileName := range managedPiAgentFileNames {
		if strings.TrimSuffix(fileName, ".md") == name {
			return true
		}
	}
	return false
}

// piAgentPath resolves <agentsDir>/<name>.md without requiring existence.
func piAgentPath(name string) string {
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return ""
	}
	return filepath.Join(agentsDir, name+".md")
}

// piAgentFilePath resolves <agentsDir>/<name>.md, erroring when the agent
// does not exist.
func piAgentFilePath(name string) (string, error) {
	path := piAgentPath(name)
	if path == "" {
		return "", fmt.Errorf("resolve pi agents dir: %w", ErrAgentNotFound)
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %q", ErrAgentNotFound, name)
		}
		return "", fmt.Errorf("stat pi agent %s: %w", name, err)
	}
	return path, nil
}

// writePiAgentFile writes <agentsDir>/<name>.md, creating the dir as needed.
func writePiAgentFile(name string, content string) error {
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		return fmt.Errorf("create pi agents dir: %w", err)
	}
	path := filepath.Join(agentsDir, name+".md")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write pi agent %s: %w", name, err)
	}
	return nil
}

func readPiAgentFile(name string) ([]byte, error) {
	path, err := piAgentFilePath(name)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read pi agent %s: %w", name, err)
	}
	return content, nil
}

// validateAgentPathName guards agent file paths: the name becomes a file
// basename in the agents dir, so it must not contain separators, parent
// references, the .md suffix, Windows drive characters, or control chars.
// (Create applies the stricter slug pattern on top.)
func validateAgentPathName(name string) error {
	if name == "" {
		return fmt.Errorf("%w: empty name", ErrInvalidAgentName)
	}
	if strings.ContainsAny(name, `/:\`) || strings.ContainsFunc(name, unicode.IsControl) || name == "." || name == ".." || strings.HasSuffix(name, ".md") {
		return fmt.Errorf("%w: %q", ErrInvalidAgentName, name)
	}
	return nil
}

// yamlQuotedScalar renders a value as a double-quoted YAML scalar, escaping
// quotes, backslashes, tabs, and newlines so arbitrary descriptions survive
// round-trips through the frontmatter parser.
func yamlQuotedScalar(value string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\t", `\t`, "\r", "").Replace(value)
	return `"` + escaped + `"`
}

// agentFrontMatter mirrors the subset of an agent definition's frontmatter
// the management surface needs.
type agentFrontMatter struct {
	Name        string
	Description string
	Model       string
	Thinking    string
}

// parseAgentFrontMatter extracts name and description from an agent file's
// YAML frontmatter (same shape as skill frontmatter, with block scalars and
// quoted values supported).
func parseAgentFrontMatter(content []byte) agentFrontMatter {
	lines := strings.Split(string(content), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return agentFrontMatter{}
	}
	meta := agentFrontMatter{}
	for i := 1; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "---" {
			break
		}
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		wasDoubleQuoted := strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) && len(value) >= 2
		if value == "" || isYAMLBlockScalarIndicator(value) {
			value, i = collectBlockScalar(lines, i)
			wasDoubleQuoted = false
		}
		value = trimQuotedValue(value)
		if wasDoubleQuoted {
			value = unescapeYAMLDoubleQuoted(value)
		}
		switch key {
		case "name":
			meta.Name = value
		case "description":
			meta.Description = value
		case "model":
			meta.Model = value
		case "thinking":
			meta.Thinking = value
		}
	}
	return meta
}

// unescapeYAMLDoubleQuoted converts the escapes YAML double-quoted scalars
// use (\n, \", \\, …) back into their literal characters. It mirrors what
// yamlQuotedScalar emits, keeping descriptions round-trip safe.
func unescapeYAMLDoubleQuoted(value string) string {
	return strings.NewReplacer(`\\`, `\`, `\"`, `"`, `\n`, "\n", `\t`, "\t", `\r`, "").Replace(value)
}

// configManagedPiAgentsDir resolves the managed pi agents dir via config.
func configManagedPiAgentsDir() (string, error) {
	return config.ManagedPiAgentsDir()
}
