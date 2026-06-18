package memory

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

type BudgetCheck struct {
	Exceeded       bool
	CurrentChars   int
	Limit          int
	TrimmedContent string
	// OverflowPaths lists any archive/ files written during overflow trimming.
	OverflowPaths []string
}

// checkBudget checks whether content exceeds the size limit for memoryPath.
// contextRoot is the canonical context directory (~/.yishan/contexts/<repoKey>/)
// used to derive the overflow archive path. Pass "" for global memory files
// (which have a lower limit but no overflow target).
func checkBudget(content string, memoryPath string, contextRoot string) BudgetCheck {
	limit := MaxProjectMemoryChars
	if strings.Contains(filepath.ToSlash(memoryPath), "/.yishan/memory/global/") {
		limit = MaxGlobalMemoryChars
	}

	currentChars := len([]rune(content))
	result := BudgetCheck{CurrentChars: currentChars, Limit: limit}

	if currentChars <= limit {
		result.TrimmedContent = content
		return result
	}

	result.Exceeded = true
	result.TrimmedContent, result.OverflowPaths = trimToBudget(content, limit, contextRoot)
	return result
}

func trimToBudget(content string, limit int, contextRoot string) (string, []string) {
	sections := parseMemorySections(content)
	var overflowPaths []string

	for len([]rune(buildMemoryMarkdown(sections))) > limit {
		trimmed := false
		if len(sections.OpenQuestions) > 0 {
			if p := overflowEntries(contextRoot, "open-questions", sections.OpenQuestions); p != "" {
				overflowPaths = append(overflowPaths, p)
			}
			sections.OpenQuestions = nil
			trimmed = true
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.DurableDiscoveries) > 3 {
				if p := overflowEntries(contextRoot, "durable-discoveries", sections.DurableDiscoveries[3:]); p != "" {
					overflowPaths = append(overflowPaths, p)
				}
				sections.DurableDiscoveries = sections.DurableDiscoveries[:3]
				trimmed = true
			}
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.LockedDecisions) > 3 {
				if p := overflowEntries(contextRoot, "locked-decisions", sections.LockedDecisions[3:]); p != "" {
					overflowPaths = append(overflowPaths, p)
				}
				sections.LockedDecisions = sections.LockedDecisions[:3]
				trimmed = true
			}
		}
		if !trimmed {
			break
		}
	}

	return buildMemoryMarkdown(sections), overflowPaths
}

// overflowEntries writes overflow entries to <contextRoot>/archive/<category>-<date>.md
// and returns the path written. Returns "" if contextRoot is empty (global memory)
// or the write fails.
func overflowEntries(contextRoot string, category string, entries []string) string {
	if len(entries) == 0 || contextRoot == "" {
		return ""
	}

	now := time.Now().UTC().Format("20060102")
	archiveRoot := filepath.Join(contextRoot, archiveDir)
	archFile := filepath.Join(archiveRoot, category+"-"+now+".md")

	existingContent := ""
	if data, err := os.ReadFile(archFile); err == nil {
		existingContent = string(data)
	}

	allEntries := parseArchiveEntries(existingContent)
	for _, entry := range entries {
		if !containsEntry(allEntries, entry) {
			allEntries = append(allEntries, entry)
		}
	}

	var buf strings.Builder
	buf.WriteString("# Overflow: " + archiveCategoryTitle(category) + "\n\n")
	for _, entry := range allEntries {
		buf.WriteString("- " + entry + "\n")
	}

	if err := os.MkdirAll(archiveRoot, 0o755); err != nil {
		return ""
	}
	if err := os.WriteFile(archFile, []byte(buf.String()), 0o644); err != nil {
		return ""
	}
	return archFile
}

func parseArchiveEntries(content string) []string {
	if content == "" {
		return nil
	}

	var entries []string
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- ") {
			entries = append(entries, strings.TrimPrefix(trimmed, "- "))
		}
	}
	return entries
}

func archiveCategoryTitle(category string) string {
	parts := strings.Split(category, "-")
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + part[1:]
	}
	return strings.Join(parts, " ")
}
