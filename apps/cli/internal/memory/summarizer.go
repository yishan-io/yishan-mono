package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

type Summarizer struct {
	enabled   bool
	agentKind string // override agent; empty = use session's own agent
	model     string // optional model override
	runAgent  RunAgentFunc
	dbReader  sessionReader
}

func NewSummarizer(cfg SummarizerConfig, runAgent RunAgentFunc) *Summarizer {
	return &Summarizer{
		enabled:   cfg.Enabled,
		agentKind: cfg.AgentKind,
		model:     cfg.Model,
		runAgent:  runAgent,
		dbReader:  newAgentDBReader(),
	}
}

func (s *Summarizer) Enabled() bool {
	return s.enabled && s.runAgent != nil
}

func (s *Summarizer) UpdateConfig(cfg SummarizerConfig) {
	s.enabled = cfg.Enabled
	s.agentKind = cfg.AgentKind
	s.model = cfg.Model
}

func (s *Summarizer) resolveSummarizeAgent(sessionAgent string) string {
	if s.agentKind != "" {
		return s.agentKind
	}
	return sessionAgent
}

// SummarizeSession runs the full summarize pipeline for the given workspace.
// Skipped sessions are returned explicitly so callers can distinguish them
// from real summarize runs that wrote no files.
func (s *Summarizer) SummarizeSession(sessionAgent string, workspacePath string) (SummarizeResult, error) {
	summarizeAgent := s.resolveSummarizeAgent(sessionAgent)
	result := SummarizeResult{
		Skipped:         true,
		SourceAgent:     sessionAgent,
		SummarizerAgent: summarizeAgent,
	}
	if !s.Enabled() {
		return result, nil
	}

	session, err := s.dbReader.ReadRecentSession(sessionAgent, workspacePath)
	if err != nil {
		log.Debug().Err(err).
			Str("sourceAgent", sessionAgent).
			Str("summarizerAgent", summarizeAgent).
			Msg("skip memory summarization: cannot read session")
		return result, nil
	}
	if len(session.Messages) == 0 {
		return result, nil
	}

	conversation := buildConversationText(session.Messages)

	contextRoot := resolveContextRoot(workspacePath)
	var memoryPath string
	if contextRoot != "" {
		memoryPath = filepath.Join(contextRoot, "MEMORY.md")
	} else {
		memoryPath = filepath.Join(workspacePath, myContextDir, "MEMORY.md")
		contextRoot = filepath.Join(workspacePath, myContextDir)
	}

	existingContent := ""
	if data, err := os.ReadFile(memoryPath); err == nil {
		existingContent = string(data)
	}

	prompt := fmt.Sprintf(summarizationPrompt, existingContent, conversation)

	log.Info().
		Str("sourceAgent", sessionAgent).
		Str("summarizerAgent", summarizeAgent).
		Str("workspace", workspacePath).
		Int("messages", len(session.Messages)).
		Msg("starting memory summarization")

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	agentWorkDir := workspacePath
	if _, statErr := os.Stat(workspacePath); os.IsNotExist(statErr) {
		log.Debug().Str("workspace", workspacePath).
			Msg("worktree gone at summarize time; running agent without project CWD")
		agentWorkDir = ""
	}

	output, err := s.runAgent(ctx, summarizeAgent, s.model, prompt, agentWorkDir)
	if err != nil {
		return SummarizeResult{}, &SummarizeSessionError{
			SourceAgent:     sessionAgent,
			SummarizerAgent: summarizeAgent,
			Err:             fmt.Errorf("llm summarization via %s: %w", summarizeAgent, err),
		}
	}

	extracted, err := parseExtractedJSON(output)
	if err != nil {
		return SummarizeResult{}, &SummarizeSessionError{
			SourceAgent:     sessionAgent,
			SummarizerAgent: summarizeAgent,
			Err:             fmt.Errorf("parse summarization output: %w", err),
		}
	}

	writtenPaths, err := mergeAndWrite(memoryPath, existingContent, extracted, contextRoot)
	if err != nil {
		return SummarizeResult{}, &SummarizeSessionError{
			SourceAgent:     sessionAgent,
			SummarizerAgent: summarizeAgent,
			Err:             err,
		}
	}
	result.Skipped = false
	result.WrittenPaths = writtenPaths
	return result, nil
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

const summarizationPrompt = `Summarize the following AI coding conversation for a developer's project memory file. Extract only durable, high-value context that will matter in future sessions. Skip greetings, small talk, active work status, and raw tool outputs.

Return ONLY valid JSON (no markdown fences, no other text):
{
  "lockedDecisions": ["YYYY-MM-DD — <decision>. Why: <reason>."],
  "durableDiscoveries": ["[Root Cause] YYYY-MM-DD — <durable discovery>", "[Invariant] YYYY-MM-DD — <durable discovery>"],
  "openQuestions": ["YYYY-MM-DD — <unresolved question worth resurfacing>"]
}

Rules:
- Each entry max 2 lines
- Omit sections with nothing to report (empty arrays)
- Do NOT repeat content already in the existing memory below
- Use normal English, not JSON-escaped newlines inside strings
- Do NOT emit a handoff, task log, status note, or active thread summary
- Durable discoveries must start with one label: [Root Cause], [Invariant], [Workflow Trap], [Env Trap], or [Test Trap]
- Only include a durable discovery if it would likely save future debugging time, prevent a wrong fix, or avoid a repeated workflow mistake
- If an error was encountered, include it only when it produced a durable root cause or workflow/test/environment trap

Existing memory content:
%s

Conversation:
%s`

func parseExtractedJSON(text string) (ExtractedKnowledge, error) {
	text = strings.TrimSpace(text)

	if idx := strings.Index(text, "{"); idx >= 0 {
		if endIdx := strings.LastIndex(text, "}"); endIdx > idx {
			text = text[idx : endIdx+1]
		}
	}

	var raw struct {
		LockedDecisions    []string `json:"lockedDecisions"`
		DurableDiscoveries []string `json:"durableDiscoveries"`
		OpenQuestions      []string `json:"openQuestions"`

		// Transition fallback for older prompts.
		Decisions []string `json:"decisions"`
		Learned   []string `json:"learned"`
		Errors    []string `json:"errors"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return ExtractedKnowledge{}, fmt.Errorf("parse extracted json: %w (%s)", err, truncate(text, 200))
	}

	return ExtractedKnowledge{
		LockedDecisions:    firstNonEmptySlice(raw.LockedDecisions, raw.Decisions),
		DurableDiscoveries: firstNonEmptySlice(raw.DurableDiscoveries, append(raw.Learned, raw.Errors...)),
		OpenQuestions:      raw.OpenQuestions,
	}, nil
}

func firstNonEmptySlice(preferred []string, fallback []string) []string {
	if len(preferred) > 0 {
		return preferred
	}
	return fallback
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func mergeAndWrite(memoryPath string, existingContent string, extracted ExtractedKnowledge, contextRoot string) ([]string, error) {
	existing := parseMemorySections(existingContent)

	for _, d := range extracted.LockedDecisions {
		if !containsEntry(existing.LockedDecisions, d) {
			existing.LockedDecisions = append(existing.LockedDecisions, d)
		}
	}
	for _, discovery := range extracted.DurableDiscoveries {
		if !containsEntry(existing.DurableDiscoveries, discovery) {
			existing.DurableDiscoveries = append(existing.DurableDiscoveries, discovery)
		}
	}
	for _, question := range extracted.OpenQuestions {
		if !containsEntry(existing.OpenQuestions, question) {
			existing.OpenQuestions = append(existing.OpenQuestions, question)
		}
	}

	newContent := buildMemoryMarkdown(existing)

	if err := os.MkdirAll(filepath.Dir(memoryPath), 0o755); err != nil {
		return nil, fmt.Errorf("create memory dir: %w", err)
	}

	var writtenPaths []string

	budget := checkBudget(newContent, memoryPath, contextRoot)
	if budget.Exceeded {
		log.Warn().
			Str("path", memoryPath).
			Int("currentChars", budget.CurrentChars).
			Int("limit", budget.Limit).
			Msg("memory file exceeds budget, some entries will be moved to archive/")
		newContent = budget.TrimmedContent
		writtenPaths = append(writtenPaths, budget.OverflowPaths...)
	}

	if err := os.WriteFile(memoryPath, []byte(newContent), 0o644); err != nil {
		return nil, fmt.Errorf("write memory file: %w", err)
	}
	writtenPaths = append(writtenPaths, memoryPath)

	return writtenPaths, nil
}

type memorySections struct {
	LockedDecisions    []string
	DurableDiscoveries []string
	OpenQuestions      []string
}

func parseMemorySections(content string) memorySections {
	sections := memorySections{}
	lines := strings.Split(content, "\n")

	var currentSection string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, string(SectionLockedDecisions)), strings.HasPrefix(trimmed, "## My Decisions"):
			currentSection = "decisions"
			continue
		case strings.HasPrefix(trimmed, string(SectionDurableDiscoveries)), strings.HasPrefix(trimmed, "## What I Learned"), strings.HasPrefix(trimmed, "## Errors"):
			currentSection = "discoveries"
			continue
		case strings.HasPrefix(trimmed, string(SectionOpenQuestions)):
			currentSection = "questions"
			continue
		case strings.HasPrefix(trimmed, "## "):
			currentSection = ""
			continue
		}

		switch currentSection {
		case "decisions":
			if strings.HasPrefix(trimmed, "- ") {
				sections.LockedDecisions = append(sections.LockedDecisions, strings.TrimPrefix(trimmed, "- "))
			}
		case "discoveries":
			if strings.HasPrefix(trimmed, "- ") {
				sections.DurableDiscoveries = append(sections.DurableDiscoveries, strings.TrimPrefix(trimmed, "- "))
			}
		case "questions":
			if strings.HasPrefix(trimmed, "- ") {
				sections.OpenQuestions = append(sections.OpenQuestions, strings.TrimPrefix(trimmed, "- "))
			}
		}
	}

	return sections
}

func buildMemoryMarkdown(sections memorySections) string {
	var buf strings.Builder
	buf.WriteString("# Project Memory\n\n")
	buf.WriteString("_Last updated: " + time.Now().UTC().Format("2006-01-02") + "_\n\n")

	buf.WriteString(string(SectionLockedDecisions) + "\n\n")
	for _, d := range sections.LockedDecisions {
		buf.WriteString("- " + d + "\n")
	}
	buf.WriteString("\n")

	buf.WriteString(string(SectionDurableDiscoveries) + "\n\n")
	for _, l := range sections.DurableDiscoveries {
		buf.WriteString("- " + l + "\n")
	}
	buf.WriteString("\n")

	buf.WriteString(string(SectionOpenQuestions) + "\n\n")
	for _, q := range sections.OpenQuestions {
		buf.WriteString("- " + q + "\n")
	}

	return buf.String()
}

func containsEntry(entries []string, entry string) bool {
	normalized := normalizeEntry(entry)
	for _, e := range entries {
		existingNormalized := normalizeEntry(e)
		if existingNormalized == normalized {
			return true
		}
		if strings.Contains(existingNormalized, normalized) || strings.Contains(normalized, existingNormalized) {
			return true
		}
	}
	return false
}

func normalizeEntry(entry string) string {
	replacer := strings.NewReplacer(
		"`", "",
		"\"", "",
		"'", "",
		".", " ",
		",", " ",
		":", " ",
		";", " ",
		"(", " ",
		")", " ",
	)
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(replacer.Replace(entry)))), " ")
}
