package memory

import (
	"context"
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
