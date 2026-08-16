package setup

import "strings"

// Agent frontmatter parsing: extract the subset of an agent definition's
// YAML frontmatter the management surface needs, and render frontmatter
// values back for writing. Shared YAML scalar helpers live in frontmatter.go;
// no file I/O and no official-agent policy live here.

// agentFrontMatter mirrors the subset of an agent definition's frontmatter
// the management surface needs.
type agentFrontMatter struct {
	Name        string
	Description string
	Model       string
	Thinking    string
	Tools       []string
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
		if key == "tools" {
			meta.Tools, i = parseToolsValue(value, lines, i)
			continue
		}
		value, i = decodeScalarValue(lines, value, i)
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

// decodeScalarValue resolves a frontmatter scalar value whose key line sits
// at lines[startIdx]: block scalars consume their indented continuation
// lines, and double-quoted values are unescaped. Returns the decoded value
// and the index of the last consumed line.
func decodeScalarValue(lines []string, value string, startIdx int) (string, int) {
	wasDoubleQuoted := strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) && len(value) >= 2
	if value == "" || isYAMLBlockScalarIndicator(value) {
		value, startIdx = collectBlockScalar(lines, startIdx)
		wasDoubleQuoted = false
	}
	value = trimQuotedValue(value)
	if wasDoubleQuoted {
		value = unescapeYAMLDoubleQuoted(value)
	}
	return value, startIdx
}

// parseToolsValue resolves the tools key of a frontmatter line: flow style
// ("[read, grep]") directly, or a block list whose "- item" lines start at
// lines[startIdx]. Returns the tools and the index of the last consumed line.
func parseToolsValue(value string, lines []string, startIdx int) ([]string, int) {
	if value != "" {
		return parseInlineToolList(value), startIdx
	}
	return collectAgentToolsBlock(lines, startIdx)
}

// collectAgentToolsBlock collects the "- item" lines of a YAML tools block
// starting after lines[startIdx]. Returns the tool names and the index of
// the last consumed line.
func collectAgentToolsBlock(lines []string, startIdx int) ([]string, int) {
	var tools []string
	idx := startIdx
	for idx+1 < len(lines) {
		next := lines[idx+1]
		nextTrimmed := strings.TrimSpace(next)
		if nextTrimmed == "" || nextTrimmed == "---" || !strings.HasPrefix(nextTrimmed, "-") {
			break
		}
		tools = append(tools, strings.TrimSpace(strings.TrimPrefix(nextTrimmed, "-")))
		idx++
	}
	return tools, idx
}

// parseInlineToolList splits a flow-style YAML list value ("[read, grep]") into
// its items, trimming brackets, quotes, and whitespace.
func parseInlineToolList(value string) []string {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.TrimPrefix(trimmed, "[")
	trimmed = strings.TrimSuffix(trimmed, "]")
	if trimmed == "" {
		return nil
	}
	parts := strings.Split(trimmed, ",")
	tools := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.Trim(strings.TrimSpace(part), `"'`)
		if item != "" {
			tools = append(tools, item)
		}
	}
	return tools
}

// formatAgentToolsBlock renders a tools list as YAML block-list lines with
// two-space indentation ("  - read"). Empty or whitespace-only entries are
// dropped so they cannot produce bare "-" items.
func formatAgentToolsBlock(tools []string) string {
	var builder strings.Builder
	for _, tool := range tools {
		if trimmed := strings.TrimSpace(tool); trimmed != "" {
			builder.WriteString("  - ")
			builder.WriteString(trimmed)
			builder.WriteString("\n")
		}
	}
	return builder.String()
}
