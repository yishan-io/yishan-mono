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

func checkBudget(content string, filePath string) BudgetCheck {
	limit := MaxProjectMemoryChars
	if strings.Contains(filepath.ToSlash(filePath), "/.yishan/memory/global/") {
		limit = MaxGlobalMemoryChars
	}

	currentChars := len([]rune(content))
	result := BudgetCheck{CurrentChars: currentChars, Limit: limit}

	if currentChars <= limit {
		result.TrimmedContent = content
		return result
	}

	result.Exceeded = true
	// Derive worktree root: MEMORY.md lives at <root>/.my-context/MEMORY.md.
	worktreeRoot := filepath.Dir(filepath.Dir(filePath))
	result.TrimmedContent = trimToBudget(content, limit, worktreeRoot)
	return result
}

func trimToBudget(content string, limit int, worktreeRoot string) string {
	sections := parseMemorySections(content)

	for len([]rune(buildMemoryMarkdown(sections))) > limit {
		trimmed := false
		if len(sections.Errors) > 0 {
			overflowEntries(worktreeRoot, "errors", sections.Errors)
			sections.Errors = nil
			trimmed = true
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.Learned) > 3 {
				overflowEntries(worktreeRoot, "learned", sections.Learned[3:])
				sections.Learned = sections.Learned[:3]
				trimmed = true
			}
		}
		if !trimmed || len([]rune(buildMemoryMarkdown(sections))) > limit {
			if len(sections.Decisions) > 3 {
				overflowEntries(worktreeRoot, "decisions", sections.Decisions[3:])
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

func overflowEntries(worktreeRoot string, category string, entries []string) {
	if len(entries) == 0 {
		return
	}

	now := time.Now().UTC().Format("20060102")
	archDir := filepath.Join(worktreeRoot, myContextDir, architectureDir)
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

