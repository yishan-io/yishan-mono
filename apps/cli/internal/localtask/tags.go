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

// NormalizeTag returns the daemon-normalized display spelling for a valid tag.
func NormalizeTag(tag string) (string, error) {
	normalizedTag, _, err := normalizeTag(tag)
	return normalizedTag, err
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

// ValidateTagColor validates a nullable canonical uppercase #RRGGBB hex color.
// Nil clears the color. Non-nil must be exactly "#" followed by six uppercase
// hex digits (0-9, A-F).
func ValidateTagColor(color *string) error {
	if color == nil {
		return nil
	}
	if !isCanonicalHexColor(*color) {
		return ErrInvalidTagColor
	}
	return nil
}

// isCanonicalHexColor returns true for exactly "#RRGGBB" with uppercase A-F.
func isCanonicalHexColor(color string) bool {
	if len(color) != 7 || color[0] != '#' {
		return false
	}
	for _, c := range color[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// ValidateTagKey validates a daemon-normalized tag catalog key.
func ValidateTagKey(key string) error {
	if key == "" || !utf8.ValidString(key) || strings.TrimSpace(key) != key {
		return ErrInvalidTagKey
	}
	return nil
}
