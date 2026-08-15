package pricing

import (
	"context"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func testModelPricingCatalog() *modelPricingCatalog {
	return newStaticModelPricingCatalog(map[string]modelPrice{
		"deepseek-v4-pro": {
			InputCostPerToken:      4.35e-07,
			OutputCostPerToken:     8.7e-07,
			CacheReadCostPerToken:  3.625e-09,
			CacheWriteCostPerToken: 4.35e-07,
		},
		"gpt-5.4-mini": {
			InputCostPerToken:      7.5e-07,
			OutputCostPerToken:     4.5e-06,
			CacheReadCostPerToken:  7.5e-08,
			CacheWriteCostPerToken: 7.5e-07,
		},
		"gpt-5.5": {
			InputCostPerToken:      5e-06,
			OutputCostPerToken:     3e-05,
			CacheReadCostPerToken:  5e-07,
			CacheWriteCostPerToken: 5e-06,
		},
		"claude-sonnet-4-5": {
			InputCostPerToken:      3e-06,
			OutputCostPerToken:     1.5e-05,
			CacheReadCostPerToken:  3e-07,
			CacheWriteCostPerToken: 3.75e-06,
		},
		"claude-sonnet-4-6": {
			InputCostPerToken:      3e-06,
			OutputCostPerToken:     1.5e-05,
			CacheReadCostPerToken:  3e-07,
			CacheWriteCostPerToken: 3.75e-06,
		},
		"claude-opus-4-6": {
			InputCostPerToken:      5e-06,
			OutputCostPerToken:     2.5e-05,
			CacheReadCostPerToken:  5e-07,
			CacheWriteCostPerToken: 6.25e-06,
		},
		"zai/glm-5.1": {
			InputCostPerToken:      1e-06,
			OutputCostPerToken:     2e-06,
			CacheReadCostPerToken:  1e-06,
			CacheWriteCostPerToken: 1e-06,
		},
	})
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestModelPricingCandidates_StripsProviderPrefixes(t *testing.T) {
	t.Parallel()

	candidates := modelPricingCandidates("openrouter/google/gemini-2.5-pro")
	for _, want := range []string{
		"openrouter/google/gemini-2-5-pro",
		"google/gemini-2-5-pro",
		"gemini-2-5-pro",
	} {
		if !containsString(candidates, want) {
			t.Fatalf("expected candidates %v to contain %q", candidates, want)
		}
	}
}

func TestModelPricingCandidates_NormalizeKnownAliases(t *testing.T) {
	t.Parallel()

	candidates := modelPricingCandidates("github-copilot/claude-sonnet-4.6")
	if !containsString(candidates, "claude-sonnet-4-6") {
		t.Fatalf("expected candidates %v to contain claude-sonnet-4-6", candidates)
	}
}

func TestBuildModelPricingAliases_PrefersMoreCanonicalKey(t *testing.T) {
	t.Parallel()

	aliases := buildModelPricingAliases(map[string]modelPrice{
		"zai/glm-5.1":                 {},
		"openrouter/z-ai/glm-5.1":     {},
		"anthropic.claude-sonnet-4-6": {},
		"claude-sonnet-4-6":           {},
	})

	if got := aliases["glm-5-1"]; got != "zai/glm-5.1" {
		t.Fatalf("expected glm-5-1 alias to prefer zai/glm-5.1, got %q", got)
	}
	if got := aliases["claude-sonnet-4-6"]; got != "claude-sonnet-4-6" {
		t.Fatalf("expected claude-sonnet-4-6 alias to prefer bare model, got %q", got)
	}
}

func TestEstimateModelCostMicros_UsesProvidedCatalog(t *testing.T) {
	t.Parallel()

	costMicros := estimateModelCostMicros(testModelPricingCatalog(), "deepseek/deepseek-v4-pro", 100, 20, 0, 0, 0)
	if costMicros != 61 {
		t.Fatalf("expected 61 micros, got %d", costMicros)
	}
}

func TestEstimateModelCostMicros_UsesProviderVariation(t *testing.T) {
	t.Parallel()

	costMicros := estimateModelCostMicros(testModelPricingCatalog(), "zai-coding-plan/glm-5.1", 100, 20, 0, 0, 0)
	if costMicros != 140 {
		t.Fatalf("expected 140 micros, got %d", costMicros)
	}
}

func TestEstimateModelCostMicros_UsesCustomEndpointBaseModelAlias(t *testing.T) {
	t.Parallel()

	costMicros := estimateModelCostMicros(testModelPricingCatalog(), "my/claude-opus-4.6", 100, 20, 0, 0, 0)
	if costMicros != 1_000 {
		t.Fatalf("expected 1000 micros, got %d", costMicros)
	}
}

func TestModelPricingCatalog_LookupDoesNotFetch(t *testing.T) {
	t.Parallel()

	var fetchCalls atomic.Int32
	catalog := NewCatalog("", func(context.Context) (map[string]modelPrice, error) {
		fetchCalls.Add(1)
		return map[string]modelPrice{"gemini-2.5-pro": {InputCostPerToken: 1e-06, OutputCostPerToken: 2e-06}}, nil
	}).(*modelPricingCatalog)

	if _, ok := catalog.lookup("deepseek/deepseek-v4-pro"); ok {
		t.Fatal("expected uncached lookup miss without fetch")
	}
	if fetchCalls.Load() != 0 {
		t.Fatalf("expected lookup not to fetch, got %d fetch calls", fetchCalls.Load())
	}
}

func TestModelPricingCatalog_LoadsCachedRemotePricing(t *testing.T) {
	t.Parallel()

	cachePath := filepath.Join(t.TempDir(), modelPricingCacheFileName)
	if err := saveModelPricingCacheFile(cachePath, modelPricingCacheFile{
		FetchedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Prices: map[string]modelPrice{
			"gemini-2.5-pro": {
				InputCostPerToken:      1e-06,
				OutputCostPerToken:     2e-06,
				CacheReadCostPerToken:  5e-07,
				CacheWriteCostPerToken: 1e-06,
			},
		},
	}); err != nil {
		t.Fatalf("save cache file: %v", err)
	}

	catalog := NewCatalog(cachePath, nil).(*modelPricingCatalog)
	pricing, ok := catalog.lookup("google/gemini-2.5-pro")
	if !ok {
		t.Fatal("expected cached remote model pricing lookup to succeed")
	}
	if pricing.OutputCostPerToken != 2e-06 {
		t.Fatalf("expected cached output cost 2e-06, got %v", pricing.OutputCostPerToken)
	}
}

func TestModelPricingCatalog_RefreshPersistsRemotePricing(t *testing.T) {
	t.Parallel()

	cachePath := filepath.Join(t.TempDir(), modelPricingCacheFileName)
	catalog := NewCatalog(cachePath, func(context.Context) (map[string]modelPrice, error) {
		return map[string]modelPrice{
			"gemini-2.5-pro": {
				InputCostPerToken:      1e-06,
				OutputCostPerToken:     2e-06,
				CacheReadCostPerToken:  5e-07,
				CacheWriteCostPerToken: 1e-06,
			},
		}, nil
	}).(*modelPricingCatalog)

	if err := catalog.refresh(context.Background()); err != nil {
		t.Fatalf("refresh catalog: %v", err)
	}
	pricing, ok := catalog.lookup("google/gemini-2.5-pro")
	if !ok {
		t.Fatal("expected refreshed remote model pricing lookup to succeed")
	}
	if pricing.InputCostPerToken != 1e-06 {
		t.Fatalf("expected refreshed input cost 1e-06, got %v", pricing.InputCostPerToken)
	}

	cacheFile, err := loadModelPricingCacheFile(cachePath)
	if err != nil {
		t.Fatalf("load cache file: %v", err)
	}
	if cacheFile.fetchedAtUTC().IsZero() {
		t.Fatal("expected cache file fetchedAt to be recorded")
	}
	if _, ok := cacheFile.Prices["gemini-2.5-pro"]; !ok {
		t.Fatal("expected cache file to persist refreshed model pricing")
	}
}
