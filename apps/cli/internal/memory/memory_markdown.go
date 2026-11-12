package memory

import (
	"fmt"
	"strings"
)

// updateMemoryMarkdown appends one entry at the end of its section, refreshing
// the timestamp and migrating legacy headings in place.
func updateMemoryMarkdown(content string, section MemorySection, entry string, date string) (string, error) {
	heading := memorySectionHeadings[section]
	lines := strings.Split(normalizeMemoryMarkdown(content, date), "\n")
	headingIndex := indexOfTrimmedLine(lines, heading)
	if headingIndex < 0 {
		return "", fmt.Errorf("%w: missing section heading %q", ErrInvalidMemoryEntry, heading)
	}
	formattedEntry := formatMemoryEntry(section, entry, date)
	nextHeadingIndex := nextSectionHeadingIndex(lines, headingIndex+1)
	if !containsLineInRange(lines, formattedEntry, headingIndex+1, nextHeadingIndex) {
		lines = insertMemoryEntry(lines, nextHeadingIndex, formattedEntry)
	}
	return finalizeMemoryMarkdown(lines), nil
}

func normalizeMemoryMarkdown(content string, date string) string {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return emptyMemoryMarkdown(date)
	}
	lines := strings.Split(trimmed, "\n")
	lines = upsertTimestampLine(lines, date)
	lines = migrateMemoryHeadings(lines)
	for _, heading := range []string{"## Decisions", "## Durable Discoveries"} {
		if indexOfTrimmedLine(lines, heading) < 0 {
			lines = append(lines, "", heading, "")
		}
	}
	return strings.Join(lines, "\n")
}

func upsertTimestampLine(lines []string, date string) []string {
	timestampLine := "_Last updated: " + date + "_"
	for index, line := range lines {
		if strings.HasPrefix(line, "_Last updated: ") {
			lines[index] = timestampLine
			return lines
		}
	}
	updated := make([]string, 0, len(lines)+3)
	updated = append(updated, lines[0])
	updated = append(updated, "", timestampLine, "")
	return append(updated, lines[1:]...)
}

func migrateMemoryHeadings(lines []string) []string {
	migrated := make([]string, 0, len(lines))
	for _, line := range lines {
		switch strings.TrimSpace(line) {
		case "## Locked Decisions":
			migrated = append(migrated, "## Decisions")
		case "## Open Questions":
			continue
		default:
			migrated = append(migrated, line)
		}
	}
	return migrated
}

func emptyMemoryMarkdown(date string) string {
	return strings.Join([]string{
		"# Project Memory", "", "_Last updated: " + date + "_", "",
		"## Decisions", "", "## Durable Discoveries", "",
	}, "\n")
}

func formatMemoryEntry(section MemorySection, entry string, date string) string {
	if section == MemorySectionDecisions {
		return "- " + date + " - " + entry
	}
	return "- " + entry
}

// insertMemoryEntry appends one entry at the end of a section, keeping the
// previous entry adjacent so repeated stores produce one list block.
func insertMemoryEntry(lines []string, boundaryIndex int, formattedEntry string) []string {
	insertIndex := boundaryIndex
	for insertIndex > 0 && strings.TrimSpace(lines[insertIndex-1]) == "" {
		insertIndex--
	}
	insertion := []string{formattedEntry, ""}
	if insertIndex > 0 && strings.HasPrefix(lines[insertIndex-1], "## ") {
		insertion = append([]string{""}, insertion...)
	}
	return insertLine(lines, insertIndex, insertion...)
}

func indexOfTrimmedLine(lines []string, want string) int {
	for index, line := range lines {
		if strings.TrimSpace(line) == want {
			return index
		}
	}
	return -1
}

func nextSectionHeadingIndex(lines []string, startIndex int) int {
	for index := startIndex; index < len(lines); index++ {
		if strings.HasPrefix(lines[index], "## ") {
			return index
		}
	}
	return len(lines)
}

func containsLineInRange(lines []string, want string, startIndex int, endIndex int) bool {
	for index := startIndex; index < endIndex; index++ {
		if strings.TrimSpace(lines[index]) == want {
			return true
		}
	}
	return false
}

func insertLine(lines []string, index int, extraLines ...string) []string {
	updated := make([]string, 0, len(lines)+len(extraLines))
	updated = append(updated, lines[:index]...)
	updated = append(updated, extraLines...)
	return append(updated, lines[index:]...)
}

func finalizeMemoryMarkdown(lines []string) string {
	joined := strings.Join(lines, "\n")
	for strings.Contains(joined, "\n\n\n") {
		joined = strings.ReplaceAll(joined, "\n\n\n", "\n\n")
	}
	return strings.TrimRight(joined, "\n") + "\n"
}
