package localtask

import (
	"strings"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

const (
	// TagColorAmber is a supported global tag color.
	TagColorAmber = "amber"
	// TagColorBlue is a supported global tag color.
	TagColorBlue = "blue"
	// TagColorGreen is a supported global tag color.
	TagColorGreen = "green"
	// TagColorPurple is a supported global tag color.
	TagColorPurple = "purple"
	// TagColorRed is a supported global tag color.
	TagColorRed = "red"
	// TagColorTeal is a supported global tag color.
	TagColorTeal = "teal"

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

// ValidateTagColorUpdate validates a mutually exclusive preset or custom catalog color.
func ValidateTagColorUpdate(update TagColorUpdate) error {
	if update.Color != nil && update.CustomColor != nil {
		return ErrInvalidTagColor
	}
	if update.Color != nil {
		if _, isSupported := supportedTagColors[*update.Color]; !isSupported {
			return ErrInvalidTagColor
		}
		return nil
	}
	if update.CustomColor != nil && !isCustomTagColor(*update.CustomColor) {
		return ErrInvalidTagColor
	}
	return nil
}

// ValidateTagColor preserves the preset-only validation contract for existing callers.
func ValidateTagColor(color *string) error {
	return ValidateTagColorUpdate(TagColorUpdate{Color: color})
}

func isCustomTagColor(color string) bool {
	if len(color) != 7 || color[0] != '#' {
		return false
	}
	for _, character := range color[1:] {
		if !(character >= '0' && character <= '9') && !(character >= 'a' && character <= 'f') && !(character >= 'A' && character <= 'F') {
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

var supportedTagColors = map[string]struct{}{
	TagColorAmber: {}, TagColorBlue: {}, TagColorGreen: {},
	TagColorPurple: {}, TagColorRed: {}, TagColorTeal: {},
}
