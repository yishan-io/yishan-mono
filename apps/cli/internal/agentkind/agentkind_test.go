package agentkind

import (
	"slices"
	"testing"
)

func TestPiHasActiveTokenScanner(t *testing.T) {
	t.Parallel()

	if !slices.Contains(WithActiveTokenScanners, Pi) {
		t.Fatalf("expected %q in WithActiveTokenScanners", Pi)
	}
}
