package tokenusage

import (
	"math"
	"regexp"
	"strings"
)

const usdMicrosPerUSD = 1_000_000

type modelPrice struct {
	InputCostPerToken      float64 `json:"inputCostPerToken"`
	OutputCostPerToken     float64 `json:"outputCostPerToken"`
	CacheReadCostPerToken  float64 `json:"cacheReadCostPerToken"`
	CacheWriteCostPerToken float64 `json:"cacheWriteCostPerToken"`
}

var modelVersionDotPattern = regexp.MustCompile(`(\d)\.(\d)`)

func estimateModelCostMicros(
	catalog *modelPricingCatalog,
	model string,
	inputTokens int64,
	outputTokens int64,
	cacheReadTokens int64,
	cacheWriteTokens int64,
	reasoningTokens int64,
) int64 {
	if catalog == nil {
		return 0
	}
	pricing, ok := catalog.lookup(model)
	if !ok {
		return 0
	}
	cacheReadCostPerToken := pricing.CacheReadCostPerToken
	if cacheReadCostPerToken <= 0 {
		cacheReadCostPerToken = pricing.InputCostPerToken
	}
	cacheWriteCostPerToken := pricing.CacheWriteCostPerToken
	if cacheWriteCostPerToken <= 0 {
		cacheWriteCostPerToken = pricing.InputCostPerToken
	}
	totalUSD := float64(inputTokens)*pricing.InputCostPerToken +
		float64(outputTokens+reasoningTokens)*pricing.OutputCostPerToken +
		float64(cacheReadTokens)*cacheReadCostPerToken +
		float64(cacheWriteTokens)*cacheWriteCostPerToken
	if totalUSD <= 0 {
		return 0
	}
	return int64(math.Round(totalUSD * usdMicrosPerUSD))
}

func modelPricingCandidates(model string) []string {
	normalizedModel := normalizeModelPricingKey(model)
	if normalizedModel == "" || normalizedModel == "unknown" {
		return nil
	}

	seen := make(map[string]struct{}, 12)
	candidates := make([]string, 0, 12)
	appendCandidate := func(candidate string) {
		candidate = normalizeModelPricingAlias(candidate)
		if candidate == "" {
			return
		}
		if _, ok := seen[candidate]; ok {
			return
		}
		seen[candidate] = struct{}{}
		candidates = append(candidates, candidate)
	}

	queue := []string{normalizedModel}
	seenQueue := map[string]struct{}{normalizedModel: {}}
	for len(queue) > 0 {
		candidate := queue[0]
		queue = queue[1:]
		appendCandidate(candidate)
		for _, stripped := range strippedModelPrefixes(candidate) {
			if _, ok := seenQueue[stripped]; ok {
				continue
			}
			seenQueue[stripped] = struct{}{}
			queue = append(queue, stripped)
		}
	}

	return candidates
}

func strippedModelPrefixes(model string) []string {
	stripped := make([]string, 0, 4)
	trimmed := model
	for {
		separatorIndex := strings.Index(trimmed, "/")
		if separatorIndex < 0 || separatorIndex == len(trimmed)-1 {
			break
		}
		trimmed = trimmed[separatorIndex+1:]
		stripped = append(stripped, trimmed)
	}

	dotTrimmed := model
	for {
		separatorIndex := strings.Index(dotTrimmed, ".")
		if separatorIndex < 0 || separatorIndex == len(dotTrimmed)-1 {
			break
		}
		next := dotTrimmed[separatorIndex+1:]
		if next == "" || !startsWithLetter(next) {
			break
		}
		dotTrimmed = next
		stripped = append(stripped, dotTrimmed)
	}

	return stripped
}

func startsWithLetter(value string) bool {
	if value == "" {
		return false
	}
	first := value[0]
	return first >= 'a' && first <= 'z'
}

func normalizeModelPricingAlias(model string) string {
	model = normalizeModelPricingKey(model)
	if model == "" {
		return ""
	}
	model = strings.TrimSuffix(model, "@default")
	model = strings.ReplaceAll(model, "_", "-")
	for {
		next := modelVersionDotPattern.ReplaceAllString(model, `$1-$2`)
		if next == model {
			break
		}
		model = next
	}
	return model
}

func normalizeModelPricingKey(model string) string {
	return strings.TrimSpace(strings.ToLower(model))
}
