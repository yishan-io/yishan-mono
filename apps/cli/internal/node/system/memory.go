package system

import (
	"context"

	"github.com/rs/zerolog/log"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/rpc"
)

// MemoryService implementation: each method performs one memory operation.
// A missing memory service is a server error for every memory method.

func (s *Service) memoryService() (*memory.Service, error) {
	if s.deps.Memory == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "memory service not available")
	}
	return s.deps.Memory, nil
}

func (s *Service) Search(ctx context.Context, req rpc.MemorySearchParams) (any, error) {
	memSvc, err := s.memoryService()
	if err != nil {
		return nil, err
	}
	if req.Query == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "query is required")
	}
	projectID := ""
	if req.WorkspaceID != "" {
		if ws, ok := s.deps.Registry.Get(req.WorkspaceID); ok {
			projectID = ws.ProjectID
		}
	}
	log.Debug().
		Str("query", req.Query).
		Str("workspaceId", req.WorkspaceID).
		Str("projectID", projectID).
		Str("scope", req.Scope).
		Int("limit", req.Limit).
		Msg("memory search requested")
	return memSvc.Search(s.deps.ServerCtx, req.Query, projectID, req.Scope, req.Limit)
}

func (s *Service) Reconcile(ctx context.Context) (any, error) {
	memSvc, err := s.memoryService()
	if err != nil {
		return nil, err
	}
	refs := make([]memory.WorkspaceRef, 0)
	for _, ws := range s.deps.Registry.List() {
		if ws.Path != "" {
			refs = append(refs, memory.WorkspaceRef{
				WorktreePath: ws.Path,
				ProjectID:    ws.ProjectID,
			})
		}
	}
	log.Debug().Int("workspaces", len(refs)).Msg("memory reconcile requested")
	return memSvc.ReconcileNow(refs)
}

func (s *Service) Status(ctx context.Context) (any, error) {
	memSvc, err := s.memoryService()
	if err != nil {
		return nil, err
	}
	log.Debug().
		Bool("enabled", memSvc.SummarizerEnabled()).
		Bool("personaEnabled", memSvc.PersonaEnabled()).
		Msg("memory status requested")
	return map[string]any{
		"enabled":        memSvc.SummarizerEnabled(),
		"personaEnabled": memSvc.PersonaEnabled(),
	}, nil
}

func (s *Service) Config(ctx context.Context) (any, error) {
	memSvc, err := s.memoryService()
	if err != nil {
		return nil, err
	}
	cfg := memSvc.GetConfig()
	log.Debug().
		Bool("enabled", cfg.Enabled).
		Bool("disableProjectMemory", cfg.DisableProjectMemory).
		Bool("disablePersona", cfg.DisablePersona).
		Str("agentKind", cfg.AgentKind).
		Str("model", cfg.Model).
		Msg("memory config requested")
	return map[string]any{
		"enabled":              cfg.Enabled,
		"disableProjectMemory": cfg.DisableProjectMemory,
		"disablePersona":       cfg.DisablePersona,
		"personaEnabled":       memSvc.PersonaEnabled(),
		"agentKind":            cfg.AgentKind,
		"model":                cfg.Model,
	}, nil
}

func (s *Service) SetConfig(ctx context.Context, req rpc.MemoryUpdateConfigParams) (any, error) {
	memSvc, err := s.memoryService()
	if err != nil {
		return nil, err
	}
	cfg := memSvc.GetConfig()
	cfg.Enabled = req.Enabled
	cfg.AgentKind = req.AgentKind
	cfg.Model = req.Model
	if s.deps.SettingsPath != "" {
		if err := config.UpdateSettings(s.deps.SettingsPath, func(v *viper.Viper) {
			v.Set("memory.summarizer.enabled", cfg.Enabled)
			v.Set("memory.summarizer.agent_kind", cfg.AgentKind)
			v.Set("memory.summarizer.model", cfg.Model)
		}); err != nil {
			return nil, rpc.NewRPCError(rpc.CodeServerError, "persist memory config: "+err.Error())
		}
	}
	memSvc.UpdateSummarizerConfig(cfg)
	log.Debug().
		Bool("enabled", cfg.Enabled).
		Str("agentKind", cfg.AgentKind).
		Str("model", cfg.Model).
		Msg("memory config updated")
	return map[string]bool{"ok": true}, nil
}
