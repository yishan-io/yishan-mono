package localtask

import (
	"strings"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

const (
	// MaxTagsPerTask is the maximum number of distinct tags allowed on one task.
	MaxTagsPerTask = 12
	// MaxTagCodePoints is the maximum Unicode code-point length of one tag.
	MaxTagCodePoints = 32
)

// NormalizeTags trims, NFC-normalizes, and case-folds tags for a task. It
// preserves the first display spelling and input order for duplicate folded keys.
func NormalizeTags(tags []string) ([]string, error) {
	normalizedTags := make([]string, 0, len(tags))
	seenKeys := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		normalizedTag, key, err := normalizeTag(tag)
		if err != nil {
			return nil, err
		}
		if _, ok := seenKeys[key]; ok {
			continue
		}
		seenKeys[key] = struct{}{}
		normalizedTags = append(normalizedTags, normalizedTag)
		if len(normalizedTags) > MaxTagsPerTask {
			return nil, ErrInvalidTask
		}
	}
	return normalizedTags, nil
}

// NormalizeTagKey returns the persisted, case-insensitive key for a valid tag.
func NormalizeTagKey(tag string) (string, error) {
	_, key, err := normalizeTag(tag)
	return key, err
}

func normalizeTag(tag string) (string, string, error) {
	normalizedTag := norm.NFC.String(strings.TrimSpace(tag))
	if normalizedTag == "" || utf8.RuneCountInString(normalizedTag) > MaxTagCodePoints {
		return "", "", ErrInvalidTask
	}
	return normalizedTag, cases.Fold().String(normalizedTag), nil
}
