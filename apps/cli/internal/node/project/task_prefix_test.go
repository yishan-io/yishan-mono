package project

import (
	"slices"
	"testing"
)

// The expected values match api-service's buildLegacyTaskPrefixCandidates so
// a legacy project gets the same prefix it would have received remotely.
func TestLegacyTaskPrefixCandidates(t *testing.T) {
	candidates := legacyTaskPrefixCandidates("my-project", "project-1")
	if want := []string{"MYPRO", "MYPKZ", "MYPLA", "MYPLB", "MYPLC"}; !slices.Equal(candidates[:5], want) {
		t.Fatalf("got %v, want %v (api-service reference)", candidates[:5], want)
	}
	if got, want := legacyTaskPrefixCandidates("Personal", "id")[:3], []string{"PERSO", "PERZB", "PERZC"}; !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v (api-service reference)", got, want)
	}
	for _, candidate := range candidates {
		if candidate == reservedTaskPrefix || validateTaskPrefix(candidate) != nil {
			t.Fatalf("invalid candidate %q", candidate)
		}
	}
	if seed := taskPrefixSeed("a1"); seed != "APR" {
		t.Fatalf("expected short names to fall back to PRJ letters, got %q", seed)
	}
}
