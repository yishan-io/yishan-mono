package setup

import "strings"

// YAML frontmatter scalar helpers shared by agent and skill frontmatter
// parsing. These functions know nothing about agents or skills: they decode
// and encode the YAML scalar shapes both frontmatter formats use (block
// scalars, quoted values, and their escapes).

// yamlQuotedScalar renders a value as a double-quoted YAML scalar, escaping
// quotes, backslashes, tabs, and newlines so arbitrary descriptions survive
// round-trips through the frontmatter parser.
func yamlQuotedScalar(value string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\t", `\t`, "\r", "").Replace(value)
	return `"` + escaped + `"`
}

// unescapeYAMLDoubleQuoted converts the escapes YAML double-quoted scalars
// use (\n, \", \\, …) back into their literal characters. It mirrors what
// yamlQuotedScalar emits, keeping descriptions round-trip safe.
func unescapeYAMLDoubleQuoted(value string) string {
	return strings.NewReplacer(`\\`, `\`, `\"`, `"`, `\n`, "\n", `\t`, "\t", `\r`, "").Replace(value)
}

// collectBlockScalar joins the indented continuation lines of a YAML
// block-scalar value starting after lines[startIdx]. Returns the joined value
// and the index of the last consumed line.
func collectBlockScalar(lines []string, startIdx int) (string, int) {
	var parts []string
	idx := startIdx
	for idx+1 < len(lines) {
		next := lines[idx+1]
		nextTrimmed := strings.TrimSpace(next)
		if nextTrimmed == "---" || (nextTrimmed != "" && next[0] != ' ' && next[0] != '\t') {
			break
		}
		if nextTrimmed != "" {
			parts = append(parts, nextTrimmed)
		}
		idx++
	}
	return strings.Join(parts, " "), idx
}

// trimQuotedValue strips surrounding single or double quotes from a YAML
// single-line scalar value.
func trimQuotedValue(value string) string {
	if len(value) < 2 {
		return value
	}
	if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
		return value[1 : len(value)-1]
	}
	return value
}

// isYAMLBlockScalarIndicator reports whether value is a YAML block-scalar
// indicator whose content follows on indented lines (|, >, and the chomping
// variants |- |+ >- >+).
func isYAMLBlockScalarIndicator(value string) bool {
	if value == "" {
		return false
	}
	if value[0] != '|' && value[0] != '>' {
		return false
	}
	rest := value[1:]
	return rest == "" || rest == "-" || rest == "+"
}
