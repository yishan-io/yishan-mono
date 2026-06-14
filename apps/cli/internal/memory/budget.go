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
	result.TrimmedContent = trimToBudget(content, limit, contextRoot)
	return result
}

func trimToBudget(content string, limit int, contextRoot string) string {
	sections := parseMemorySections(content)

	for len([]rune(buildMemoryMarkdown(sections))) > limit {
		trimmed := false
		if len(sections.Errors) > 0 {
			overflowEntries(contextRoot, "errors", sections.Errors)
			sections.Errors = nil
			trimmed = true
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.Learned) > 3 {
				overflowEntries(contextRoot, "learned", sections.Learned[3:])
				sections.Learned = sections.Learned[:3]
				trimmed = true
			}
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.Decisions) > 3 {
				overflowEntries(contextRoot, "decisions", sections.Decisions[3:])
				sections.Decisions = sections.Decisions[:3]
				trimmed = true
			}
		}
		if !trimmed {
			break
		}
	}

	return buildMemoryMarkdown(sections)
}

// overflowEntries writes overflow entries to <contextRoot>/architecture/<category>-<date>.md.
// If contextRoot is empty (global memory), overflow is skipped — global memory
// is managed manually without an architecture overflow target.
func overflowEntries(contextRoot string, category string, entries []string) {
	if len(entries) == 0 || contextRoot == "" {
		return
	}

	now := time.Now().UTC().Format("20060102")
	archDir := filepath.Join(contextRoot, architectureDir)
	archFile := filepath.Join(archDir, category+"-"+now+".md")

	existingContent := ""
	if data, err := os.ReadFile(archFile); err == nil {
		existingContent = string(data)
	}

	title := strings.ToUpper(category[:1]) + category[1:]
	var buf strings.Builder
	if existingContent != "" {
		buf.WriteString(existingContent)
		buf.WriteString("\n")
	}
	buf.WriteString("# Overflow: " + title + "\n\n")
	for _, entry := range entries {
		buf.WriteString("- " + entry + "\n")
	}

	_ = os.MkdirAll(archDir, 0o755)
	_ = os.WriteFile(archFile, []byte(buf.String()), 0o644)
}

