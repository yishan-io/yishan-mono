// Package tokenusage is the facade for the token-usage domain. The domain is
// split into one-owner sub-packages: collection (periodic orchestration and
// scheduling), scanner (provider parsing), ingestion (source discovery),
// attribution (workspace/session ownership), pricing (token/cost calculation),
// and repository (persistence interfaces). This package exposes the Service
// interface and the collector wiring used by the composition root.
package tokenusage

import (
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/tokenusage/collection"
	"yishan/apps/cli/internal/tokenusage/pricing"
	"yishan/apps/cli/internal/tokenusage/repository"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace/instance"
)

// Service is the token-usage collector contract the composition root and RPC
// layer use: startup scan, sync triggers, recovery scans, debug state, close.
type Service interface {
	StartStartupScan()
	SyncNow(source string)
	Trigger(agentKind string, source string)
	RequestRecentRecoveryScan(source string)
	DebugState() collection.DebugState
	Close()
}

// modelPricingCacheFileName is the disk cache file for the remote model
// pricing catalog (profile-scoped).
const modelPricingCacheFileName = "token-usage-model-pricing.json"

// NewCollectorWithRepository builds the token-usage collector: the pricing
// catalog (remote fetch + local cache under profileDir), the hourly repository
// (SQLite-backed), and the registry of open workspaces for attribution.
func NewCollectorWithRepository(
	registry *instance.Registry,
	runtime *session.Session,
	repo repository.HourlyUsageRepository,
	profileDir string,
) Service {
	cachePath := ""
	if strings.TrimSpace(profileDir) != "" {
		cachePath = filepath.Join(profileDir, modelPricingCacheFileName)
	}
	catalog := pricing.NewCatalog(cachePath, pricing.FetchPublicModelPrices)
	return collection.NewCollector(registry, runtime, repo, catalog, scanner.DefaultRegistry())
}
