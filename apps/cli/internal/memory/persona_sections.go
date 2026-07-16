package memory

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

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

func mergePersona(existing personaSections, extracted ExtractedPersona) personaSections {
	existing.CodeStyle = mergePersonaSection(existing.CodeStyle, extracted.CodeStyle)
	existing.WorkflowHabits = mergePersonaSection(existing.WorkflowHabits, extracted.WorkflowHabits)
	existing.DomainExpertise = mergePersonaSection(existing.DomainExpertise, extracted.DomainExpertise)
	existing.ToolPreferences = mergePersonaSection(existing.ToolPreferences, extracted.ToolPreferences)
	existing.CommunicationStyle = mergePersonaSection(existing.CommunicationStyle, extracted.CommunicationStyle)
	return existing
}

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

func wordSet(s string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, w := range strings.Fields(s) {
		set[w] = struct{}{}
	}
	return set
}

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
