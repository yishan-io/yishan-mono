package pricing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	modelPricingCatalogURL    = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
	modelPricingCacheTTL      = 24 * time.Hour
	modelPricingFetchTimeout  = 2 * time.Second
	modelPricingCacheFileName = "token-usage-model-pricing.json"
)

type rawModelPrice struct {
	InputCostPerToken            float64 `json:"input_cost_per_token"`
	OutputCostPerToken           float64 `json:"output_cost_per_token"`
	CacheReadInputCostPerToken   float64 `json:"cache_read_input_token_cost"`
	CacheCreateInputCostPerToken float64 `json:"cache_creation_input_token_cost"`
}

type modelPricingCatalog struct {
	mu         sync.RWMutex
	fetchedAt  time.Time
	prices     map[string]modelPrice
	aliases    map[string]string
	cachePath  string
	fetch      func(context.Context) (map[string]modelPrice, error)
	refreshing bool
}

type modelPricingCacheFile struct {
	FetchedAt string                `json:"fetchedAt"`
	Prices    map[string]modelPrice `json:"prices"`
}

// NewCatalog builds a catalog with the given disk cache path and fetch
// function. A nil cachePath disables the local cache.
func NewCatalog(cachePath string, fetch func(context.Context) (map[string]modelPrice, error)) Catalog {
	catalog := &modelPricingCatalog{
		prices:    make(map[string]modelPrice),
		aliases:   make(map[string]string),
		cachePath: cachePath,
		fetch:     fetch,
	}
	if strings.TrimSpace(cachePath) == "" {
		return catalog
	}
	cacheFile, err := loadModelPricingCacheFile(cachePath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Warn().Err(err).Str("path", cachePath).Msg("failed to load token usage model pricing cache")
		}
		return catalog
	}
	catalog.fetchedAt = cacheFile.fetchedAtUTC()
	catalog.setPricesLocked(cloneModelPrices(cacheFile.Prices))
	return catalog
}

func cloneModelPrices(prices map[string]modelPrice) map[string]modelPrice {
	if len(prices) == 0 {
		return make(map[string]modelPrice)
	}
	cloned := make(map[string]modelPrice, len(prices))
	for key, pricing := range prices {
		cloned[key] = pricing
	}
	return cloned
}

func newStaticModelPricingCatalog(prices map[string]modelPrice) *modelPricingCatalog {
	catalog := &modelPricingCatalog{}
	catalog.setPricesLocked(cloneModelPrices(prices))
	return catalog
}

func (catalog *modelPricingCatalog) setPricesLocked(prices map[string]modelPrice) {
	catalog.prices = prices
	catalog.aliases = buildModelPricingAliases(prices)
}

func (catalog *modelPricingCatalog) lookup(model string) (modelPrice, bool) {
	catalog.mu.RLock()
	defer catalog.mu.RUnlock()
	for _, candidate := range modelPricingCandidates(model) {
		canonicalKey, ok := catalog.aliases[candidate]
		if !ok {
			continue
		}
		pricing, ok := catalog.prices[canonicalKey]
		if ok {
			return pricing, true
		}
	}
	return modelPrice{}, false
}

func (catalog *modelPricingCatalog) hasPrices() bool {
	catalog.mu.RLock()
	defer catalog.mu.RUnlock()
	return len(catalog.prices) > 0
}

func buildModelPricingAliases(prices map[string]modelPrice) map[string]string {
	aliases := make(map[string]string, len(prices)*4)
	for canonicalKey := range prices {
		for _, alias := range modelPricingCandidates(canonicalKey) {
			existing, hasExisting := aliases[alias]
			if !hasExisting || shouldPreferCanonicalModelKey(canonicalKey, existing) {
				aliases[alias] = canonicalKey
			}
		}
	}
	return aliases
}

func shouldPreferCanonicalModelKey(candidate string, existing string) bool {
	candidateDepth := strings.Count(candidate, "/") + strings.Count(candidate, ".")
	existingDepth := strings.Count(existing, "/") + strings.Count(existing, ".")
	if candidateDepth != existingDepth {
		return candidateDepth < existingDepth
	}
	if len(candidate) != len(existing) {
		return len(candidate) < len(existing)
	}
	return candidate < existing
}

func (catalog *modelPricingCatalog) RefreshIfStaleAsync(onSuccess func()) {
	catalog.mu.Lock()
	if catalog.refreshing || !catalog.shouldRefreshLocked(time.Now().UTC()) {
		catalog.mu.Unlock()
		return
	}
	catalog.refreshing = true
	catalog.mu.Unlock()

	go func() {
		defer func() {
			catalog.mu.Lock()
			catalog.refreshing = false
			catalog.mu.Unlock()
		}()

		ctx, cancel := context.WithTimeout(context.Background(), modelPricingFetchTimeout)
		defer cancel()
		if err := catalog.refresh(ctx); err != nil {
			log.Warn().Err(err).Str("url", modelPricingCatalogURL).Msg("failed to refresh token usage model pricing cache")
			return
		}
		if onSuccess != nil {
			onSuccess()
		}
	}()
}

func (catalog *modelPricingCatalog) shouldRefreshLocked(now time.Time) bool {
	if catalog.cachePath == "" || catalog.fetch == nil {
		return false
	}
	if catalog.fetchedAt.IsZero() {
		return true
	}
	return now.Sub(catalog.fetchedAt) >= modelPricingCacheTTL
}

func (catalog *modelPricingCatalog) refresh(ctx context.Context) error {
	if catalog.fetch == nil {
		return nil
	}
	prices, err := catalog.fetch(ctx)
	if err != nil {
		return err
	}
	if len(prices) == 0 {
		return fmt.Errorf("empty model pricing catalog response")
	}

	now := time.Now().UTC()
	normalizedPrices := cloneModelPrices(prices)
	if catalog.cachePath != "" {
		if err := saveModelPricingCacheFile(catalog.cachePath, modelPricingCacheFile{
			FetchedAt: now.Format(time.RFC3339Nano),
			Prices:    normalizedPrices,
		}); err != nil {
			catalog.mu.Lock()
			catalog.setPricesLocked(normalizedPrices)
			catalog.mu.Unlock()
			return err
		}
	}

	catalog.mu.Lock()
	catalog.fetchedAt = now
	catalog.setPricesLocked(normalizedPrices)
	catalog.mu.Unlock()
	return nil
}

func (file modelPricingCacheFile) fetchedAtUTC() time.Time {
	if file.FetchedAt == "" {
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339Nano, file.FetchedAt)
	if err != nil {
		return time.Time{}
	}
	return parsed.UTC()
}

func loadModelPricingCacheFile(path string) (modelPricingCacheFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return modelPricingCacheFile{}, err
	}
	if len(raw) == 0 {
		return modelPricingCacheFile{}, nil
	}
	var parsed modelPricingCacheFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return modelPricingCacheFile{}, fmt.Errorf("parse pricing cache %q: %w", path, err)
	}
	return parsed, nil
}

func saveModelPricingCacheFile(path string, cacheFile modelPricingCacheFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create pricing cache dir for %q: %w", path, err)
	}
	raw, err := json.MarshalIndent(cacheFile, "", "  ")
	if err != nil {
		return fmt.Errorf("encode pricing cache: %w", err)
	}
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o600); err != nil {
		return fmt.Errorf("write pricing cache temp file %q: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("replace pricing cache file %q: %w", path, err)
	}
	return nil
}

func FetchPublicModelPrices(ctx context.Context) (map[string]modelPrice, error) {
	return fetchModelPricesFromURL(ctx, http.DefaultClient, modelPricingCatalogURL)
}

func fetchModelPricesFromURL(ctx context.Context, client *http.Client, url string) (map[string]modelPrice, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build model pricing request: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch model pricing catalog: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch model pricing catalog: unexpected status %d", response.StatusCode)
	}
	var raw map[string]rawModelPrice
	if err := json.NewDecoder(response.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode model pricing catalog: %w", err)
	}
	prices := make(map[string]modelPrice, len(raw))
	for model, pricing := range raw {
		prices[normalizeModelPricingKey(model)] = modelPrice{
			InputCostPerToken:      pricing.InputCostPerToken,
			OutputCostPerToken:     pricing.OutputCostPerToken,
			CacheReadCostPerToken:  pricing.CacheReadInputCostPerToken,
			CacheWriteCostPerToken: pricing.CacheCreateInputCostPerToken,
		}
	}
	return prices, nil
}

// EstimateCost implements Catalog.
func (catalog *modelPricingCatalog) EstimateCost(model string, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens int64) int64 {
	return estimateModelCostMicros(catalog, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens)
}

// HasPrices implements Catalog.
func (catalog *modelPricingCatalog) HasPrices() bool {
	return catalog.hasPrices()
}
