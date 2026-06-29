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

// personaFilePath returns the canonical path to the user's global PERSONA.md file.
func personaFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".yishan", "memory", "PERSONA.md"), nil
}

// PersonaFilePath is the exported version of personaFilePath, for use by CLI commands.
func PersonaFilePath() (string, error) {
	return personaFilePath()
}

// AgentDBReader is the exported reader type for use by CLI commands.
// It wraps agentDBReader with exported method signatures.
type AgentDBReader struct {
	r *agentDBReader
}

// NewAgentDBReaderForCLI creates an AgentDBReader for use in CLI commands.
func NewAgentDBReaderForCLI() *AgentDBReader {
	return &AgentDBReader{r: newAgentDBReader()}
}

// ReadSessionsForDate returns all sessions from the given UTC date for the agent.
func (a *AgentDBReader) ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error) {
	return a.r.ReadSessionsForDate(agent, date)
}

// BuildEmptyPersonaMarkdown returns an empty PERSONA.md with all five section headings.
// Used by `yishan persona clear` and `yishan setup` to initialise the persona file.
func BuildEmptyPersonaMarkdown() string {
	return buildPersonaMarkdown(personaSections{})
}

// personaSections holds the parsed contents of each section in PERSONA.md.
type personaSections struct {
	CodeStyle          []string
	WorkflowHabits     []string
	DomainExpertise    []string
	ToolPreferences    []string
	CommunicationStyle []string
}

// PersonaSummarizer extracts and merges developer persona from session transcripts.
type PersonaSummarizer struct {
	enabled  bool
	model    string
	runAgent RunAgentFunc
}

// NewPersonaSummarizer creates a PersonaSummarizer with the given config.
func NewPersonaSummarizer(cfg SummarizerConfig, runAgent RunAgentFunc) *PersonaSummarizer {
	return &PersonaSummarizer{
		enabled:  cfg.Enabled,
		model:    cfg.Model,
		runAgent: runAgent,
	}
}

// Enabled reports whether the summarizer is configured and ready to run.
func (p *PersonaSummarizer) Enabled() bool {
	return p.enabled && p.runAgent != nil
}

// UpdateConfig refreshes the summarizer's config at runtime.
func (p *PersonaSummarizer) UpdateConfig(cfg SummarizerConfig) {
	p.enabled = cfg.Enabled
	p.model = cfg.Model
}

// maxPersonaSessions is the maximum number of sessions fed into a single
// persona extraction LLM call. With 30 messages per session and typical
// message lengths this keeps the prompt well within OS ARG_MAX and LLM
// context limits. The most recent sessions are used (best signal).
const maxPersonaSessions = 10

// SummarizeForPersona runs the persona extraction pipeline for the given agent
// and set of session transcripts (typically all sessions from the previous day).
// It reads the existing PERSONA.md, extracts signals via LLM, merges them using
// replace-on-contradiction semantics, and writes the result back.
func (p *PersonaSummarizer) SummarizeForPersona(agentKind string, sessions []*sessionMessages) (PersonaSummarizeResult, error) {
	if !p.Enabled() {
		return PersonaSummarizeResult{Skipped: true}, nil
	}
	if len(sessions) == 0 {
		return PersonaSummarizeResult{Skipped: true}, nil
	}

	// Cap to the most recent sessions — use the tail since ReadSessionsForDate
	// returns sessions in ascending time order.
	if len(sessions) > maxPersonaSessions {
		sessions = sessions[len(sessions)-maxPersonaSessions:]
	}

	conversation := buildCombinedTranscript(sessions)
	if conversation == "" {
		return PersonaSummarizeResult{Skipped: true}, nil
	}

	targetPath, err := personaFilePath()
	if err != nil {
		return PersonaSummarizeResult{}, fmt.Errorf("resolve persona path: %w", err)
	}

	existingContent := ""
	if data, err := os.ReadFile(targetPath); err == nil {
		existingContent = string(data)
	}

	prompt := fmt.Sprintf(personaExtractionPrompt, existingContent, conversation)

	log.Info().
		Str("agent", agentKind).
		Int("sessions", len(sessions)).
		Msg("starting persona extraction")

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	output, err := p.runAgent(ctx, agentKind, p.model, prompt, "")
	if err != nil {
		return PersonaSummarizeResult{}, fmt.Errorf("llm persona extraction via %s: %w", agentKind, err)
	}

	extracted, err := parseExtractedPersona(output)
	if err != nil {
		return PersonaSummarizeResult{}, fmt.Errorf("parse persona extraction output: %w", err)
	}

	existing := parsePersonaSections(existingContent)
	merged := mergePersona(existing, extracted)
	newContent := buildPersonaMarkdown(merged)

	// Enforce budget: trim oldest entries if over limit.
	if len(newContent) > MaxPersonaChars {
		newContent = trimPersonaToLimit(newContent, MaxPersonaChars)
	}

	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return PersonaSummarizeResult{}, fmt.Errorf("create persona dir: %w", err)
	}
	if err := os.WriteFile(targetPath, []byte(newContent), 0o644); err != nil {
		return PersonaSummarizeResult{}, fmt.Errorf("write persona file: %w", err)
	}

	log.Info().Str("path", targetPath).Msg("persona updated")
	return PersonaSummarizeResult{WrittenPath: targetPath}, nil
}

// buildCombinedTranscript concatenates messages from multiple sessions.
// Sessions are separated by a marker line so the LLM can see session boundaries.
// Yishan-injected context blocks (persona, project memory, skill invocations) are
// stripped from user messages before concatenation so they don't pollute extraction.
func buildCombinedTranscript(sessions []*sessionMessages) string {
	var buf strings.Builder
	written := 0
	for _, s := range sessions {
		if len(s.Messages) == 0 {
			continue
		}
		if written > 0 {
			buf.WriteString("\n\n--- session boundary ---\n\n")
		}
		written++
		// Limit each session to the last 30 messages to stay within token budget.
		msgs := s.Messages
		if len(msgs) > 30 {
			msgs = msgs[len(msgs)-30:]
		}
		for _, msg := range msgs {
			content := msg.Content
			if msg.Role == "user" {
				content = stripYishanInjectedContent(content)
			}
			if strings.TrimSpace(content) == "" {
				continue
			}
			buf.WriteString(fmt.Sprintf("**%s**: %s\n\n", msg.Role, content))
		}
	}
	return buf.String()
}

// yishanInjectedPrefixes are markers for content injected by Yishan's plugin or
// skill commands that are not genuine user intent and must not influence persona.
// They appear prepended to user messages (plugin) or as standalone user messages
// (slash command expansions).
var yishanInjectedPrefixes = []string{
	// Plugin-injected persona block
	"## Developer Persona (.yishan/memory/PERSONA.md)",
	// Plugin-injected project context block
	"## Personal Project Context (.my-context/)",
	// Skill slash command expansions — either the legacy path-based form or the
	// current path-free command marker.
	"YISHAN_COMMAND:",
	"Read ~/.config/opencode/skills/",
	"Read ~/.claude/skills/",
	"Read ~/.agents/skills/",
}

// stripYishanInjectedContent removes Yishan-injected blocks from a user message,
// returning only the genuine user-authored content.
//
// Two cases:
//  1. The entire message is a skill invocation (starts with an injected prefix) →
//     return empty string so the message is dropped entirely.
//  2. The message has an injected block prepended before real user content →
//     find where the injected block ends and return only the tail.
//
// The plugin always prepends injected content as a leading text part, so the real
// user message follows after the last injected section.
func stripYishanInjectedContent(content string) string {
	trimmed := strings.TrimSpace(content)

	// Case 1: entire message is a skill invocation — drop it.
	for _, prefix := range yishanInjectedPrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			// Check if there's genuine user content after the injected block.
			// Skill invocations contain no real user content; plugin-prepended blocks
			// are followed by the actual user prompt after a blank line separator.
			// Skill invocations don't have a trailing real message — they end with
			// the skill instructions. Plugin blocks end with "---" then user content.
			if sep := strings.Index(trimmed, "\n---\n"); sep >= 0 {
				// Plugin-prepended persona + context block: real content follows "---".
				tail := strings.TrimSpace(trimmed[sep+5:])
				if tail != "" {
					return tail
				}
			}
			// Pure skill invocation or empty tail — drop entirely.
			return ""
		}
	}
	return content
}

// parsePersonaSections parses a PERSONA.md file into structured sections.
func parsePersonaSections(content string) personaSections {
	sections := personaSections{}
	lines := strings.Split(content, "\n")
	var current string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, string(PersonaSectionCodeStyle)):
			current = "codeStyle"
		case strings.HasPrefix(trimmed, string(PersonaSectionWorkflowHabits)):
			current = "workflow"
		case strings.HasPrefix(trimmed, string(PersonaSectionDomainExpertise)):
			current = "domain"
		case strings.HasPrefix(trimmed, string(PersonaSectionToolPreferences)):
			current = "tools"
		case strings.HasPrefix(trimmed, string(PersonaSectionCommunication)):
			current = "communication"
		case strings.HasPrefix(trimmed, "## "):
			current = ""
		}
		if strings.HasPrefix(trimmed, "- ") {
			entry := strings.TrimPrefix(trimmed, "- ")
			switch current {
			case "codeStyle":
				sections.CodeStyle = append(sections.CodeStyle, entry)
			case "workflow":
				sections.WorkflowHabits = append(sections.WorkflowHabits, entry)
			case "domain":
				sections.DomainExpertise = append(sections.DomainExpertise, entry)
			case "tools":
				sections.ToolPreferences = append(sections.ToolPreferences, entry)
			case "communication":
				sections.CommunicationStyle = append(sections.CommunicationStyle, entry)
			}
		}
	}
	return sections
}

// buildPersonaMarkdown renders persona sections back to markdown.
// All five section headings are always emitted (even if empty) so agents can
// identify the file structure reliably.
func buildPersonaMarkdown(s personaSections) string {
	var buf strings.Builder
	buf.WriteString("# Developer Persona\n\n")
	buf.WriteString("_Last updated: " + time.Now().UTC().Format("2006-01-02") + "_\n\n")

	writeSection := func(heading PersonaSection, entries []string) {
		buf.WriteString(string(heading) + "\n\n")
		for _, e := range entries {
			buf.WriteString("- " + e + "\n")
		}
		buf.WriteString("\n")
	}
	writeSection(PersonaSectionCodeStyle, s.CodeStyle)
	writeSection(PersonaSectionWorkflowHabits, s.WorkflowHabits)
	writeSection(PersonaSectionDomainExpertise, s.DomainExpertise)
	writeSection(PersonaSectionToolPreferences, s.ToolPreferences)
	writeSection(PersonaSectionCommunication, s.CommunicationStyle)
	return buf.String()
}

// mergePersona merges extracted persona signals into the existing sections using
// replace-on-contradiction semantics: if a new entry overlaps significantly with
// an existing entry (same topic), the new one replaces the old; otherwise it is
// appended. This prevents contradictory or stale preferences accumulating.
func mergePersona(existing personaSections, extracted ExtractedPersona) personaSections {
	existing.CodeStyle = mergePersonaSection(existing.CodeStyle, extracted.CodeStyle)
	existing.WorkflowHabits = mergePersonaSection(existing.WorkflowHabits, extracted.WorkflowHabits)
	existing.DomainExpertise = mergePersonaSection(existing.DomainExpertise, extracted.DomainExpertise)
	existing.ToolPreferences = mergePersonaSection(existing.ToolPreferences, extracted.ToolPreferences)
	existing.CommunicationStyle = mergePersonaSection(existing.CommunicationStyle, extracted.CommunicationStyle)
	return existing
}

// mergePersonaSection merges new entries into an existing section slice.
// For each new entry:
//   - If an existing entry has ≥60% word overlap → replace the existing entry
//   - If already identical (normalised) → skip
//   - Otherwise → append
func mergePersonaSection(existing []string, newEntries []string) []string {
	result := make([]string, len(existing))
	copy(result, existing)

	for _, newEntry := range newEntries {
		replaced := false
		newWords := wordSet(normalizeEntry(newEntry))
		for i, ex := range result {
			exWords := wordSet(normalizeEntry(ex))
			if wordOverlapRatio(newWords, exWords) >= 0.6 {
				result[i] = newEntry
				replaced = true
				break
			}
		}
		if !replaced && !containsEntry(result, newEntry) {
			result = append(result, newEntry)
		}
	}
	return result
}

// wordSet converts a normalised string into a set of unique words.
func wordSet(s string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, w := range strings.Fields(s) {
		set[w] = struct{}{}
	}
	return set
}

// wordOverlapRatio returns the Jaccard-like overlap ratio between two word sets:
// |intersection| / |smaller set|. A ratio of 1.0 means one set is a subset of the other.
func wordOverlapRatio(a, b map[string]struct{}) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0
	}
	smaller := len(a)
	if len(b) < smaller {
		smaller = len(b)
	}
	if smaller == 0 {
		return 0
	}
	intersection := 0
	for w := range a {
		if _, ok := b[w]; ok {
			intersection++
		}
	}
	return float64(intersection) / float64(smaller)
}

// trimPersonaToLimit removes entries from the least-essential sections until the
// content fits within maxChars. Priority order: Communication → Tool Preferences →
// Domain Expertise → Workflow Habits → Code Style (code style is preserved last).
func trimPersonaToLimit(content string, maxChars int) string {
	if len(content) <= maxChars {
		return content
	}
	s := parsePersonaSections(content)
	priority := []*[]string{
		&s.CommunicationStyle,
		&s.ToolPreferences,
		&s.DomainExpertise,
		&s.WorkflowHabits,
		&s.CodeStyle,
	}
	for _, section := range priority {
		for len(*section) > 0 && len(buildPersonaMarkdown(s)) > maxChars {
			*section = (*section)[:len(*section)-1]
		}
		if len(buildPersonaMarkdown(s)) <= maxChars {
			break
		}
	}
	return buildPersonaMarkdown(s)
}

// parseExtractedPersona parses the LLM's JSON output into an ExtractedPersona.
func parseExtractedPersona(text string) (ExtractedPersona, error) {
	text = strings.TrimSpace(text)
	if idx := strings.Index(text, "{"); idx >= 0 {
		if end := strings.LastIndex(text, "}"); end > idx {
			text = text[idx : end+1]
		}
	}

	var raw struct {
		CodeStyle          []string `json:"codeStyle"`
		WorkflowHabits     []string `json:"workflowHabits"`
		DomainExpertise    []string `json:"domainExpertise"`
		ToolPreferences    []string `json:"toolPreferences"`
		CommunicationStyle []string `json:"communicationStyle"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return ExtractedPersona{}, fmt.Errorf("parse persona json: %w (%s)", err, truncate(text, 200))
	}
	return ExtractedPersona{
		CodeStyle:          raw.CodeStyle,
		WorkflowHabits:     raw.WorkflowHabits,
		DomainExpertise:    raw.DomainExpertise,
		ToolPreferences:    raw.ToolPreferences,
		CommunicationStyle: raw.CommunicationStyle,
	}, nil
}

// personaExtractionPrompt is the LLM prompt used to extract persona signals from
// session transcripts. It uses a high-confidence bar and explicitly excludes
// project-specific knowledge and Yishan workflow noise.
//
// Format args: %s = existing persona content, %s = combined session transcript.
const personaExtractionPrompt = `You are extracting developer persona signals from AI coding session transcripts.
These signals personalise future AI assistant sessions for this specific developer.

SECTION DEFINITIONS — only extract signals that fit the definition exactly:

codeStyle: Language, formatting, naming, and quality preferences that apply in ANY codebase.
  GOOD examples: "Prefers strict TypeScript — no implicit any", "Uses Zod for input validation",
                 "Writes tests before implementation", "No trailing semicolons in TypeScript"
  BAD examples (do NOT include): product behavior rules, project architectural decisions,
                 workflow procedures, tool usage patterns

workflowHabits: Repeated personal behaviors observed in 3+ separate sessions OR explicitly stated.
  GOOD examples: "Always runs typecheck before pushing", "Opens a task ticket before starting work",
                 "Reviews git diff before committing"
  BAD examples (do NOT include): one-off actions, behaviors that follow from a skill/tool instruction
                 rather than personal choice, project-specific procedures

domainExpertise: Tech areas where the user demonstrated confident, fluent knowledge (not just usage).
  GOOD examples: "Go concurrency patterns — goroutines, channels, sync primitives",
                 "React performance optimisation — useMemo, useCallback, reconciliation"
  BAD examples (do NOT include): areas merely touched in one session, tools simply used

toolPreferences: Tools, editors, frameworks the user actively chose or explicitly prefers.
  GOOD examples: "Prefers bun over npm for package management", "Uses Zed as primary editor"
  BAD examples (do NOT include): tools that are simply part of the project stack (not a personal choice),
                 tools used because the project requires them

communicationStyle: How the user prefers agents to communicate with them.
  GOOD examples: "Prefers terse responses — no preamble or summaries", "Wants options before action",
                 "Prefers Chinese for UI, English for code"
  BAD examples (do NOT include): task-specific instructions, one-off requests

DO NOT extract:
- Project-specific decisions or rules (belongs in project MEMORY.md, not persona)
- Any credential, API key, company name, or personal identifiable information
- Behaviors caused by Yishan skill instructions (ys-research, ys-build etc.) — these are tool prompts, not personal habits
- Task status, work-in-progress notes, or session-specific context
- Anything about Yishan itself (using opencode, yishan CLI) — these are the tool being used, not a preference

Return ONLY valid JSON (no markdown fences, no other text):
{
  "codeStyle": ["<one concise line per preference>"],
  "workflowHabits": ["<one concise line — only if seen 3+ times or explicitly stated>"],
  "domainExpertise": ["<one concise line — only deep fluency, not just usage>"],
  "toolPreferences": ["<one concise line — only genuine choices, not project requirements>"],
  "communicationStyle": ["<one concise line>"]
}

Rules:
- Each entry: one line, specific and actionable, not vague
- Empty array = nothing high-confidence to extract — that is correct behaviour, do not force entries
- Contradiction handling: if existing says "prefers X" and sessions show "prefers Y", output "prefers Y"
- Confidence threshold: HIGH — when in doubt, omit

Existing persona (do not repeat unchanged entries):
%s

Session transcripts:
%s`
