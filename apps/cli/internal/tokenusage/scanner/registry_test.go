package scanner

import (
	"context"
	"errors"
	"testing"

	agentkind "yishan/apps/cli/internal/agent/kind"
	"yishan/apps/cli/internal/tokenusage/record"
)

// TestRegistryRegisterAndLookup covers the registry contract: Register maps a
// kind to a scanner, Scanner returns it, and an unregistered kind is absent.
func TestRegistryRegisterAndLookup(t *testing.T) {
	registry := NewRegistry()
	called := false
	registry.Register("custom", ScannerFunc(func(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
		called = true
		return nil, nil
	}))

	provider, ok := registry.Scanner("custom")
	if !ok {
		t.Fatal("expected registered scanner to be found")
	}
	if _, err := provider.ScanHourlyUsage(context.Background(), ScanInput{}); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if !called {
		t.Fatal("expected registered scanner to be invoked")
	}

	if _, ok := registry.Scanner("missing"); ok {
		t.Fatal("expected unregistered kind to be absent")
	}
}

// TestRegistryReplaceSameKind covers the override rule: registering the same
// kind twice replaces the earlier scanner.
func TestRegistryReplaceSameKind(t *testing.T) {
	registry := NewRegistry()
	registry.Register("custom", ScannerFunc(func(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
		return nil, errors.New("first")
	}))
	registry.Register("custom", ScannerFunc(func(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
		return nil, errors.New("second")
	}))

	provider, _ := registry.Scanner("custom")
	_, err := provider.ScanHourlyUsage(context.Background(), ScanInput{})
	if err == nil || err.Error() != "second" {
		t.Fatalf("expected replaced scanner to win, got %v", err)
	}
}

// TestRegistryKindsSorted covers the Kinds contract: registered kinds come
// back in stable sorted order.
func TestRegistryKindsSorted(t *testing.T) {
	registry := NewRegistry()
	registry.Register("zebra", ScannerFunc(func(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
		return nil, nil
	}))
	registry.Register("alpha", ScannerFunc(func(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
		return nil, nil
	}))

	kinds := registry.Kinds()
	if len(kinds) != 2 || kinds[0] != "alpha" || kinds[1] != "zebra" {
		t.Fatalf("expected sorted kinds, got %v", kinds)
	}
}

// TestDefaultRegistryCoversAllTrackedKinds pins the built-in provider set:
// every kind with token tracking has a registered scanner, so the collector
// never dispatches into the empty fallback.
func TestDefaultRegistryCoversAllTrackedKinds(t *testing.T) {
	registry := DefaultRegistry()
	for _, kind := range agentkind.WithTokenTracking {
		if _, ok := registry.Scanner(kind); !ok {
			t.Fatalf("expected default registry to cover %q", kind)
		}
	}
}
