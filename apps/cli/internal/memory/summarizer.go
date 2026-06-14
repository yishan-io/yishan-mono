package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

type Summarizer struct {
	enabled  bool
	dbReader *agentDBReader
}

func NewSummarizer(enabled bool) *Summarizer {
	return &Summarizer{
		enabled:  enabled,
		dbReader: newAgentDBReader(),
	}
}

func (s *Summarizer) Enabled() bool {
	return s.enabled
}

func (s *Summarizer) SummarizeSession(agent string, workspacePath string) error {
	if !s.enabled {
		return nil
	}

	session, err := s.dbReader.ReadRecentSession(agent, workspacePath)
	if err != nil {
		return fmt.Errorf("read agent session: %w", err)
	}

	if len(session.Messages) == 0 {
		return nil
	}

	conversation := buildConversationText(session.Messages)

	existingPath := filepath.Join(workspacePath, myContextDir, "MEMORY.md")
	existingContent := ""
	if data, err := os.ReadFile(existingPath); err == nil {
		existingContent = string(data)
	}

	extracted, err := s.summarizeViaCLI(agent, conversation, existingContent)
	if err != nil {
		return fmt.Errorf("llm summarization: %w", err)
	}

	return mergeAndWrite(existingPath, existingContent, extracted)
}

func buildConversationText(messages []sessionMessage) string {
	var buf strings.Builder
	recentMessages := messages
	if len(messages) > 40 {
		recentMessages = messages[len(messages)-40:]
	}
	for _, msg := range recentMessages {
		buf.WriteString(fmt.Sprintf("**%s**: %s\n\n", msg.Role, msg.Content))
	}
	return buf.String()
}

const summarizationPrompt = `Summarize the following AI coding conversation for a developer's project memory file. Extract only technical decisions, architecture choices, and non-obvious discoveries. Skip greetings, small talk, and raw tool outputs.

Return ONLY valid JSON (no markdown fences, no other text):
{
  "decisions": ["<decision> — <short rationale>"],
  "learned": ["<discovery about the codebase or tooling>"],
  "errors": ["<error encountered> — <how it was fixed>"],
  "leaveOff": "<1-2 line summary of what was being worked on>"
}

Rules:
- Each entry max 2 lines
- Omit sections with nothing to report (empty arrays)
- Do NOT repeat content already in the existing memory below
- Use normal English, not JSON-escaped newlines inside strings

Existing memory content:
%s

Conversation:
%s`

func (s *Summarizer) summarizeViaCLI(agent string, conversation string, existingMemory string) (ExtractedKnowledge, error) {
	prompt := fmt.Sprintf(summarizationPrompt, existingMemory, conversation)
	today := time.Now().UTC().Format("2006-01-02")
	_ = agent // All agents use the claude CLI for one-shot summarization.
	return s.callClaudeCLI(prompt, today)
}

func (s *Summarizer) callClaudeCLI(prompt string, today string) (ExtractedKnowledge, error) {
	_ = today
	if _, err := exec.LookPath("claude"); err != nil {
		return ExtractedKnowledge{}, fmt.Errorf("claude CLI not found in PATH — install claude CLI or disable memory.summarizer.enabled: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "claude", "-p", prompt, "--print", "--output-format", "text")
	output, err := cmd.Output()
	if err != nil {
		return ExtractedKnowledge{}, fmt.Errorf("claude CLI failed: %w (output: %s)", err, truncate(string(output), 500))
	}

	return parseExtractedJSON(string(output))
}

func parseExtractedJSON(text string) (ExtractedKnowledge, error) {
	text = strings.TrimSpace(text)

	if idx := strings.Index(text, "{"); idx >= 0 {
		if endIdx := strings.LastIndex(text, "}"); endIdx > idx {
			text = text[idx : endIdx+1]
		}
	}

	var raw struct {
		Decisions []string `json:"decisions"`
		Learned   []string `json:"learned"`
		Errors    []string `json:"errors"`
		LeaveOff  string   `json:"leaveOff"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return ExtractedKnowledge{}, fmt.Errorf("parse extracted json: %w (%s)", err, truncate(text, 200))
	}

	return ExtractedKnowledge{
		Decisions: raw.Decisions,
		Learned:   raw.Learned,
		Errors:    raw.Errors,
		LeaveOff:  raw.LeaveOff,
	}, nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func mergeAndWrite(memoryPath string, existingContent string, extracted ExtractedKnowledge) error {
	existing := parseMemorySections(existingContent)

	if extracted.LeaveOff != "" {
		existing.LeaveOff = extracted.LeaveOff
	}
	for _, d := range extracted.Decisions {
		if !containsEntry(existing.Decisions, d) {
			existing.Decisions = append(existing.Decisions, d)
		}
	}
	for _, l := range extracted.Learned {
		if !containsEntry(existing.Learned, l) {
			existing.Learned = append(existing.Learned, l)
		}
	}
	for _, e := range extracted.Errors {
		if !containsEntry(existing.Errors, e) {
			existing.Errors = append(existing.Errors, e)
		}
	}

	sort.Strings(existing.Decisions)
	sort.Strings(existing.Learned)
	sort.Strings(existing.Errors)

	newContent := buildMemoryMarkdown(existing)

	if err := os.MkdirAll(filepath.Dir(memoryPath), 0o755); err != nil {
		return fmt.Errorf("create memory dir: %w", err)
	}

	budget := checkBudget(newContent, memoryPath)
	if budget.Exceeded {
		log.Warn().
			Str("path", memoryPath).
			Int("currentChars", budget.CurrentChars).
			Int("limit", budget.Limit).
			Msg("memory file exceeds budget, some entries will be moved to architecture/")
		newContent = budget.TrimmedContent
	}

	if err := os.WriteFile(memoryPath, []byte(newContent), 0o644); err != nil {
		return fmt.Errorf("write memory file: %w", err)
	}

	return nil
}

type memorySections struct {
	LeaveOff  string
	Decisions []string
	Learned   []string
	Errors    []string
}

func parseMemorySections(content string) memorySections {
	sections := memorySections{}
	lines := strings.Split(content, "\n")

	var currentSection string
	var leaveOffLines []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "## Where I Left Off"):
			currentSection = "leaveoff"
			continue
		case strings.HasPrefix(trimmed, "## My Decisions"):
			currentSection = "decisions"
			continue
		case strings.HasPrefix(trimmed, "## What I Learned"):
			currentSection = "learned"
			continue
		case strings.HasPrefix(trimmed, "## Errors"):
			currentSection = "errors"
			continue
		case strings.HasPrefix(trimmed, "## "):
			currentSection = ""
			continue
		}

		switch currentSection {
		case "leaveoff":
			if trimmed != "" {
				leaveOffLines = append(leaveOffLines, trimmed)
			}
		case "decisions":
			if strings.HasPrefix(trimmed, "- ") {
				sections.Decisions = append(sections.Decisions, strings.TrimPrefix(trimmed, "- "))
			}
		case "learned":
			if strings.HasPrefix(trimmed, "- ") {
				sections.Learned = append(sections.Learned, strings.TrimPrefix(trimmed, "- "))
			}
		case "errors":
			if strings.HasPrefix(trimmed, "- ") {
				sections.Errors = append(sections.Errors, strings.TrimPrefix(trimmed, "- "))
			}
		}
	}

	sections.LeaveOff = strings.Join(leaveOffLines, "\n")
	return sections
}

func buildMemoryMarkdown(sections memorySections) string {
	var buf strings.Builder
	buf.WriteString("# Project Memory\n\n")
	buf.WriteString("_Last updated: " + time.Now().UTC().Format("2006-01-02") + "_\n\n")

	buf.WriteString("## Where I Left Off\n\n")
	if sections.LeaveOff != "" {
		buf.WriteString(sections.LeaveOff + "\n\n")
	}

	buf.WriteString("## My Decisions\n\n")
	for _, d := range sections.Decisions {
		buf.WriteString("- " + d + "\n")
	}
	buf.WriteString("\n")

	buf.WriteString("## What I Learned\n\n")
	for _, l := range sections.Learned {
		buf.WriteString("- " + l + "\n")
	}

	return buf.String()
}

func containsEntry(entries []string, entry string) bool {
	normalized := strings.TrimSpace(strings.ToLower(entry))
	for _, e := range entries {
		if strings.TrimSpace(strings.ToLower(e)) == normalized {
			return true
		}
	}
	return false
}
