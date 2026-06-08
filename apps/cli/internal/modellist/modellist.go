package modellist

import (
	"fmt"
	"sort"
	"time"
)

type Service struct {
	fetchers map[string]*agentFetcher
	cache    *cache
}

func NewService() *Service {
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
		fetchers: fetchers,
		cache:    newCache(DefaultCacheTTL),
	}
}

func (s *Service) ListModels(agentKind string, forceRefresh bool) (*AgentModelList, error) {
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
	}

	if af.static != nil {
		models, err := af.static.Fetch()
		if err == nil && len(models) > 0 {
			return models, SourceStatic, nil
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
	agentKinds := make([]string, 0, len(s.fetchers))
	for kind := range s.fetchers {
		agentKinds = append(agentKinds, kind)
	}
	sort.Strings(agentKinds)

	results := make([]AgentModelList, 0, len(agentKinds))
	for _, agentKind := range agentKinds {
		list, err := s.ListModels(agentKind, forceRefresh)
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

