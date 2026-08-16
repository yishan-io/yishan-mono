package output

import (
	"strings"
	"unicode"
)

func formatHeaderLabel(column string) string {
	if strings.TrimSpace(column) == "" {
		return "-"
	}

	parts := splitHeaderParts(column)
	for idx, part := range parts {
		upper := strings.ToUpper(part)
		if upper == "ID" || upper == "URL" || upper == "API" || upper == "JWT" {
			parts[idx] = upper
			continue
		}

		runes := []rune(part)
		if len(runes) == 0 {
			continue
		}
		parts[idx] = strings.ToUpper(string(runes[0])) + strings.ToLower(string(runes[1:]))
	}

	return strings.Join(parts, " ")
}

func splitHeaderParts(column string) []string {
	normalized := strings.NewReplacer("_", " ", "-", " ").Replace(column)
	words := strings.Fields(normalized)
	parts := make([]string, 0, len(words))

	for _, word := range words {
		parts = append(parts, splitCamelWord(word)...)
	}

	return parts
}

func splitCamelWord(word string) []string {
	if word == "" {
		return nil
	}

	runes := []rune(word)
	start := 0
	parts := make([]string, 0, 4)

	for i := 1; i < len(runes); i++ {
		prev := runes[i-1]
		curr := runes[i]

		boundary := unicode.IsLower(prev) && unicode.IsUpper(curr)
		boundary = boundary || (unicode.IsLetter(prev) && unicode.IsDigit(curr))
		boundary = boundary || (unicode.IsDigit(prev) && unicode.IsLetter(curr))
		boundary = boundary || (unicode.IsUpper(prev) && unicode.IsUpper(curr) && i+1 < len(runes) && unicode.IsLower(runes[i+1]))
		if !boundary {
			continue
		}

		parts = append(parts, string(runes[start:i]))
		start = i
	}

	parts = append(parts, string(runes[start:]))
	return parts
}
