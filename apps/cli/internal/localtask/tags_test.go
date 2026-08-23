package localtask

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeTags_NormalizesDeduplicatesAndPreservesFirstOrder(t *testing.T) {
	tags, err := NormalizeTags([]string{"\u00a0Straße\u00a0", "alpha", "STRASSE", "ALPHA"})
	if err != nil {
		t.Fatalf("normalize tags: %v", err)
	}
	want := []string{"Straße", "alpha"}
	if len(tags) != len(want) {
		t.Fatalf("normalized tag count = %d, want %d", len(tags), len(want))
	}
	for index, tag := range tags {
		if tag != want[index] {
			t.Fatalf("tag %d = %q, want %q", index, tag, want[index])
		}
	}
}

func TestNormalizeTags_NormalizesDisplayToNFC(t *testing.T) {
	tags, err := NormalizeTags([]string{"cafe\u0301"})
	if err != nil {
		t.Fatalf("normalize combining tag: %v", err)
	}
	if len(tags) != 1 || tags[0] != "café" {
		t.Fatalf("normalized tags = %#v, want []string{\"café\"}", tags)
	}
}

func TestNormalizeTagKey_UsesUnicodeCaseFoldAndNFC(t *testing.T) {
	tests := []struct {
		name    string
		left    string
		right   string
		isEqual bool
	}{
		{name: "sharp s", left: "Straße", right: "STRASSE", isEqual: true},
		{name: "sigma", left: "Σ", right: "ς", isEqual: true},
		{name: "dotted i remains distinct", left: "İ", right: "i", isEqual: false},
		{name: "canonical equivalents", left: "cafe\u0301", right: "café", isEqual: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			left, err := NormalizeTagKey(test.left)
			if err != nil {
				t.Fatalf("normalize left tag: %v", err)
			}
			right, err := NormalizeTagKey(test.right)
			if err != nil {
				t.Fatalf("normalize right tag: %v", err)
			}
			if (left == right) != test.isEqual {
				t.Fatalf("keys %q and %q equality = %t, want %t", left, right, left == right, test.isEqual)
			}
		})
	}
}

func TestNormalizeTags_EnforcesCodePointAndTagLimits(t *testing.T) {
	validAstral := strings.Repeat("😀", MaxTagCodePoints)
	if _, err := NormalizeTags([]string{validAstral}); err != nil {
		t.Fatalf("normalize %d astral code points: %v", MaxTagCodePoints, err)
	}
	if _, err := NormalizeTags([]string{strings.Repeat("😀", MaxTagCodePoints+1)}); !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("normalize overlong astral tag error = %v, want %v", err, ErrInvalidTask)
	}

	tags := make([]string, MaxTagsPerTask+1)
	for index := range tags {
		tags[index] = string(rune('a' + index))
	}
	if _, err := NormalizeTags(tags); !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("normalize too many tags error = %v, want %v", err, ErrInvalidTask)
	}
}

func TestNormalizeTags_RejectsWhitespaceOnlyTags(t *testing.T) {
	if _, err := NormalizeTags([]string{"\t\n\u00a0"}); !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("normalize whitespace tag error = %v, want %v", err, ErrInvalidTask)
	}
}

func TestValidateTaskAndUpdate_ValidateTags(t *testing.T) {
	task := Task{ID: "task-1", Title: "Task", Status: StatusActive, Priority: PriorityMedium, Tags: []string{"ok", ""}}
	if err := ValidateTask(task); !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("validate task error = %v, want %v", err, ErrInvalidTask)
	}

	tags := []string{strings.Repeat("a", MaxTagCodePoints+1)}
	if err := ValidateTaskUpdate(TaskUpdate{Tags: &tags}); !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("validate update error = %v, want %v", err, ErrInvalidTask)
	}
}

func TestValidateTagColor_AcceptsSupportedColorsAndClear(t *testing.T) {
	blue := TagColorBlue
	if err := ValidateTagColor(&blue); err != nil {
		t.Fatalf("validate supported color: %v", err)
	}
	if err := ValidateTagColor(nil); err != nil {
		t.Fatalf("validate clear color: %v", err)
	}
	invalid := "magenta"
	if !errors.Is(ValidateTagColor(&invalid), ErrInvalidTagColor) {
		t.Fatalf("validate invalid color = %v, want %v", ValidateTagColor(&invalid), ErrInvalidTagColor)
	}
}

func TestValidateTagKey_AcceptsNormalizeTagKeyOutput(t *testing.T) {
	tests := []struct {
		name string
		tag  string
	}{
		{name: "Cherokee fold", tag: "Ꭰ"},
		{name: "32 sharp s fold expansion", tag: strings.Repeat("ß", MaxTagCodePoints)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			key, err := NormalizeTagKey(test.tag)
			if err != nil {
				t.Fatalf("normalize display tag: %v", err)
			}
			if err := ValidateTagKey(key); err != nil {
				t.Fatalf("validate normalized key %q: %v", key, err)
			}
		})
	}
}

func TestValidateTagKey_RejectsInvalidWireShape(t *testing.T) {
	for _, key := range []string{"", " Alpha", "Alpha ", "\xff"} {
		if !errors.Is(ValidateTagKey(key), ErrInvalidTagKey) {
			t.Fatalf("validate key %q error = %v, want %v", key, ValidateTagKey(key), ErrInvalidTagKey)
		}
	}
	if err := ValidateTagKey("alpha"); err != nil {
		t.Fatalf("validate key: %v", err)
	}
}
