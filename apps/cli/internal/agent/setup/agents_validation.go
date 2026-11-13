package setup

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

func invalidDefinition(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalidAgentDefinition, message)
}

func validateAgentDefinition(name, content string) error {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	if !strings.HasPrefix(normalized, "---\n") {
		return invalidDefinition("YAML frontmatter is required")
	}
	end := strings.Index(normalized[4:], "\n---\n")
	if end < 0 {
		return invalidDefinition("closing frontmatter delimiter is required")
	}
	if strings.TrimSpace(normalized[4+end+5:]) == "" {
		return invalidDefinition("prompt body is required")
	}
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(normalized[4:4+end]), &document); err != nil {
		return invalidDefinition("invalid YAML: " + err.Error())
	}
	normalizeAgentCoreScalars(&document)
	var metadata map[string]interface{}
	if err := document.Decode(&metadata); err != nil {
		return invalidDefinition("invalid YAML: " + err.Error())
	}
	explicit := make(map[string]bool)
	if len(document.Content) > 0 && document.Content[0].Kind == yaml.MappingNode {
		entries := document.Content[0].Content
		for i := 0; i+1 < len(entries); i += 2 {
			explicit[entries[i].Value] = true
		}
	}
	for _, key := range []string{"name", "description"} {
		value, ok := metadata[key].(string)
		if !explicit[key] || !ok || strings.TrimSpace(value) == "" {
			return invalidDefinition(key + " must be a non-empty string")
		}
	}
	if strings.TrimSpace(metadata["name"].(string)) != name {
		return fmt.Errorf("%w: frontmatter name must match %q", ErrInvalidAgentName, name)
	}
	return validateAgentRuntimeFields(metadata)
}

// yaml.v3 resolves timestamps and YAML 1.1 numeric forms differently from Pi's
// YAML core schema. Only normalize known metadata values, never extension data.
var agentCoreNumber = regexp.MustCompile(`^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+|[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$`)
var agentCoreDecimal = regexp.MustCompile(`^[-+]?[0-9]+$`)

func normalizeAgentCoreScalars(document *yaml.Node) {
	if len(document.Content) == 0 || document.Content[0].Kind != yaml.MappingNode {
		return
	}
	entries := document.Content[0].Content
	for i := 0; i+1 < len(entries); i += 2 {
		if entries[i].Tag == "!!merge" {
			entries[i].Tag = "!!str"
		}
		switch entries[i].Value {
		case "tools":
			normalizeAgentCoreValue(entries[i+1])
		case "name", "description", "model", "thinking", "read_only", "default_background", "max_turns", "timeout_seconds":
			normalizeAgentCoreScalar(entries[i+1])
		}
	}
}

func normalizeAgentCoreValue(node *yaml.Node) {
	if node.Kind == yaml.SequenceNode {
		children := make([]*yaml.Node, len(node.Content))
		for i, child := range node.Content {
			clone := *child
			children[i] = &clone
			normalizeAgentCoreScalar(children[i])
		}
		node.Content = children
		return
	}
	normalizeAgentCoreScalar(node)
}

func normalizeAgentCoreScalar(node *yaml.Node) {
	if node.Kind == yaml.AliasNode && node.Alias != nil && node.Alias.Kind == yaml.ScalarNode {
		*node = *node.Alias
	}
	if node.Kind != yaml.ScalarNode || node.Style != 0 {
		return
	}
	if node.Tag == "!!timestamp" || ((node.Tag == "!!int" || node.Tag == "!!float") && !agentCoreNumber.MatchString(node.Value)) {
		node.Tag = "!!str"
	} else if node.Tag == "!!int" && agentCoreDecimal.MatchString(node.Value) {
		sign := ""
		digits := node.Value
		if strings.HasPrefix(digits, "+") || strings.HasPrefix(digits, "-") {
			sign, digits = digits[:1], digits[1:]
		}
		digits = strings.TrimLeft(digits, "0")
		if digits == "" {
			digits = "0"
		}
		node.Value = sign + digits
	}
}

func validateAgentRuntimeFields(metadata map[string]interface{}) error {
	for _, key := range []string{"model", "thinking"} {
		if value, exists := metadata[key]; exists {
			text, ok := value.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return invalidDefinition(key + " must be a non-empty string")
			}
			if key == "thinking" && (text != strings.TrimSpace(text) || ValidateAgentThinking(text) != nil) {
				return invalidDefinition("thinking must be off|minimal|low|medium|high|xhigh|max")
			}
		}
	}
	for _, key := range []string{"read_only", "default_background"} {
		if value, exists := metadata[key]; exists {
			if _, ok := value.(bool); !ok {
				return invalidDefinition(key + " must be a boolean")
			}
		}
	}
	for _, key := range []string{"max_turns", "timeout_seconds"} {
		if value, exists := metadata[key]; exists {
			if !isPositiveAgentNumber(value, key == "max_turns") {
				return invalidDefinition(key + " must be a positive number")
			}
		}
	}
	if value, exists := metadata["tools"]; exists {
		return validateAgentTools(value)
	}
	return nil
}

func isPositiveAgentNumber(value interface{}, integer bool) bool {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case uint64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return false
	}
	return number > 0 && !math.IsInf(number, 0) && !math.IsNaN(number) && (!integer || number == math.Trunc(number))
}

func validateAgentTools(value interface{}) error {
	var tools []string
	switch typed := value.(type) {
	case string:
		tools = strings.Split(typed, ",")
	case []interface{}:
		for _, entry := range typed {
			text, ok := entry.(string)
			if !ok || strings.TrimSpace(text) == "" || strings.Contains(text, ",") {
				return invalidDefinition("tools must contain individual names")
			}
			tools = append(tools, text)
		}
	default:
		return invalidDefinition("tools must be a comma-separated string or string array")
	}
	count := 0
	for _, tool := range tools {
		tool = strings.TrimSpace(tool)
		if tool == "" {
			continue
		}
		count++
	}
	if count == 0 {
		return invalidDefinition("tools must not be empty")
	}
	return nil
}
