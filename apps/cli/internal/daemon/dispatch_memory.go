package daemon

import (
	"encoding/json"

	"github.com/rs/zerolog/log"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/workspace"
)

type memorySearchParams struct {
	Query       string `json:"query"`
	WorkspaceID string `json:"workspaceId"`
	Scope       string `json:"scope"`
	Limit       int    `json:"limit"`
}

func (h *JSONRPCHandler) dispatchMemory(method string, params json.RawMessage) (any, error) {
	if h.memory == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "memory service not available")
	}

	switch method {
	case MethodMemorySearch:
		var req memorySearchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if req.Query == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "query is required")
		}
		projectID := ""
		if req.WorkspaceID != "" {
			if handle, err := h.manager.WorkspaceHandle(req.WorkspaceID); err == nil {
				projectID = handle.Workspace().ProjectID
			}
		}
		log.Debug().
			Str("query", req.Query).
			Str("workspaceId", req.WorkspaceID).
			Str("projectID", projectID).
			Str("scope", req.Scope).
			Int("limit", req.Limit).
			Msg("memory search requested")
		return h.memory.Search(h.serverCtx, req.Query, projectID, req.Scope, req.Limit)

	case MethodMemoryReconcile:
		refs := make([]memory.WorkspaceRef, 0)
		for _, ws := range h.manager.List() {
			if ws.Path != "" {
				refs = append(refs, memory.WorkspaceRef{
					WorktreePath: ws.Path,
					ProjectID:    ws.ProjectID,
				})
			}
		}
		log.Debug().Int("workspaces", len(refs)).Msg("memory reconcile requested")
		result, err := h.memory.ReconcileNow(refs)
		if err != nil {
			return nil, err
		}
		return result, nil

	case MethodMemoryStatus:
		log.Debug().Bool("enabled", h.memory.SummarizerEnabled()).Msg("memory status requested")
		return map[string]any{
			"enabled": h.memory.SummarizerEnabled(),
		}, nil

	case MethodMemoryGetConfig:
		cfg := h.memory.GetConfig()
		log.Debug().
			Bool("enabled", cfg.Enabled).
			Str("agentKind", cfg.AgentKind).
			Str("model", cfg.Model).
			Msg("memory config requested")
		return map[string]any{
			"enabled":   cfg.Enabled,
			"agentKind": cfg.AgentKind,
			"model":     cfg.Model,
		}, nil

	case MethodMemoryUpdateConfig:
		var req struct {
			Enabled   bool   `json:"enabled"`
			AgentKind string `json:"agentKind"`
			Model     string `json:"model"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		cfg := memory.SummarizerConfig{
			Enabled:   req.Enabled,
			AgentKind: req.AgentKind,
			Model:     req.Model,
		}
		if h.settingsPath != "" {
			if err := config.UpdateSettings(h.settingsPath, func(v *viper.Viper) {
				v.Set("memory.summarizer.enabled", cfg.Enabled)
				v.Set("memory.summarizer.agent_kind", cfg.AgentKind)
				v.Set("memory.summarizer.model", cfg.Model)
			}); err != nil {
				return nil, workspace.NewRPCError(rpcCodeServerError, "persist memory config: "+err.Error())
			}
		}
		h.memory.UpdateSummarizerConfig(cfg)
		log.Debug().
			Bool("enabled", cfg.Enabled).
			Str("agentKind", cfg.AgentKind).
			Str("model", cfg.Model).
			Msg("memory config updated")
		return map[string]bool{"ok": true}, nil

	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown memory method: "+method)
	}
}
