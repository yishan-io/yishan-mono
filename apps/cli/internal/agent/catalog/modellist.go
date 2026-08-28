package catalog

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/rs/zerolog/log"
)

type Service struct {
	fetchers       map[string]*agentFetcher
	cache          *cache
	runtimeCatalog RuntimeCatalogSource
}

func NewService(runtimeCatalog ...RuntimeCatalogSource) *Service {
	var source RuntimeCatalogSource
	if len(runtimeCatalog) > 0 {
		source = runtimeCatalog[0]
	}
	fetchers := map[string]*agentFetcher{
		"opencode": {
			cli:    opencodeFetcher{},
			static: nil,
		},
		"claude": {
			cli:    nil,
			static: newStaticFetcher("claude", claudeStaticModels),
		},
		"codex": {
			cli:    nil,
			static: newStaticFetcher("codex", codexStaticModels),
		},
		"gemini": {
			cli:    nil,
			static: newStaticFetcher("gemini", geminiStaticModels),
		},
		"pi": {
			cli:    piFetcher{},
			static: newStaticFetcher("pi", piStaticModels),
		},
		"copilot": {
			cli:    copilotFetcher{},
			static: newStaticFetcher("copilot", copilotStaticModels),
		},
		"cursor": {
			cli:    cursorFetcher{},
			static: newStaticFetcher("cursor", cursorStaticModels),
		},
	}
	return &Service{
		fetchers:       fetchers,
		cache:          newCache(DefaultCacheTTL),
		runtimeCatalog: source,
	}
}

func (s *Service) ListModels(agentKind string, forceRefresh bool) (*AgentModelList, error) {
	return s.ListModelsContext(context.Background(), agentKind, forceRefresh)
}

// ListModelsContext lists models, querying DSH only through its safe runtime catalog.
func (s *Service) ListModelsContext(ctx context.Context, agentKind string, forceRefresh bool) (*AgentModelList, error) {
	if agentKind == "dsh" {
		return s.listDSHModels(ctx, forceRefresh)
	}
	if !forceRefresh {
		if cached, ok := s.cache.get(agentKind); ok {
			return &cached, nil
		}
	}

	af, ok := s.fetchers[agentKind]
	if !ok {
		return nil, fmt.Errorf("unknown agent kind: %s", agentKind)
	}

	models, source, err := s.fetchWithFallback(af)
	if err != nil {
		return nil, fmt.Errorf("fetch models for %q: %w", agentKind, err)
	}

	if len(models) == 0 {
		return &AgentModelList{
			AgentKind: agentKind,
			Models:    nil,
			Source:    string(source),
		}, nil
	}

	now := time.Now()
	entry := AgentModelList{
		AgentKind:   agentKind,
		Models:      models,
		Source:      string(source),
		FetchedAt:   now.UnixMilli(),
		CacheExpiry: now.Add(DefaultCacheTTL).UnixMilli(),
	}
	s.cache.set(agentKind, entry)
	return &entry, nil
}

func (s *Service) fetchWithFallback(af *agentFetcher) ([]ModelInfo, FetchSource, error) {
	if af.cli != nil {
		models, err := af.cli.Fetch()
		if err == nil && len(models) > 0 {
			return models, SourceCLI, nil
		}
		if err != nil {
			log.Warn().Err(err).Str("agentKind", af.cli.AgentKind()).Msg("CLI model fetch failed, trying static fallback")
		} else {
			log.Warn().Str("agentKind", af.cli.AgentKind()).Msg("CLI model fetch returned empty list, trying static fallback")
		}
	}

	if af.static != nil {
		models, err := af.static.Fetch()
		if err == nil && len(models) > 0 {
			return models, SourceStatic, nil
		}
		if err != nil {
			log.Warn().Err(err).Str("agentKind", af.static.AgentKind()).Msg("static model fetch failed")
		}
	}

	agentKind := "unknown"
	switch {
	case af.static != nil:
		agentKind = af.static.AgentKind()
	case af.cli != nil:
		agentKind = af.cli.AgentKind()
	}
	return nil, SourceError, fmt.Errorf("no models available for %q", agentKind)
}

func (s *Service) ListAllModels(forceRefresh bool) []AgentModelList {
	return s.ListAllModelsContext(context.Background(), forceRefresh)
}

// ListAllModelsContext lists all agent catalogs using the DSH runtime catalog when configured.
func (s *Service) ListAllModelsContext(ctx context.Context, forceRefresh bool) []AgentModelList {
	agentKinds := make([]string, 0, len(s.fetchers))
	for kind := range s.fetchers {
		agentKinds = append(agentKinds, kind)
	}
	agentKinds = append(agentKinds, "dsh")
	sort.Strings(agentKinds)

	results := make([]AgentModelList, 0, len(agentKinds))
	for _, agentKind := range agentKinds {
		list, err := s.ListModelsContext(ctx, agentKind, forceRefresh)
		if err != nil {
			results = append(results, AgentModelList{
				AgentKind: agentKind,
				Models:    nil,
				Source:    string(SourceError),
			})
			continue
		}
		results = append(results, *list)
	}
	return results
}

func (s *Service) listDSHModels(ctx context.Context, forceRefresh bool) (*AgentModelList, error) {
	if !forceRefresh {
		if cached, ok := s.cache.get("dsh"); ok {
			return &cached, nil
		}
	}
	if s.runtimeCatalog == nil {
		return nil, fmt.Errorf("DSH provider catalog is unavailable")
	}
	catalog, err := s.runtimeCatalog.ListProviderCatalog(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetch DSH provider catalog: %w", err)
	}
	models := make([]ModelInfo, 0)
	for _, provider := range catalog.Providers {
		for _, model := range provider.Models {
			models = append(models, ModelInfo{ID: model.ID, Name: model.Name, Provider: provider.ID})
		}
	}
	now := time.Now()
	entry := AgentModelList{AgentKind: "dsh", Models: models, Source: "runtime", FetchedAt: now.UnixMilli(), CacheExpiry: now.Add(DefaultCacheTTL).UnixMilli()}
	s.cache.set("dsh", entry)
	return &entry, nil
}
