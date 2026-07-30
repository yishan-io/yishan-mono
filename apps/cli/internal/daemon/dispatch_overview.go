package daemon

import (
	"context"
	"encoding/json"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchOverview(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodOverviewTokenUsage:
		return h.handleOverviewTokenUsage(ctx, params)
	case MethodOverviewModelBreakdown:
		return h.handleOverviewModelBreakdown(ctx, params)
	case MethodOverviewAgentKindBreakdown:
		return h.handleOverviewAgentKindBreakdown(ctx, params)
	case MethodOverviewWorkspaceInsights:
		return h.handleOverviewWorkspaceInsights(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown overview method: "+method)
	}
}

func (h *JSONRPCHandler) overviewStore() *localdb.OverviewStore {
	return localdb.NewOverviewStore(h.localDatabase)
}

const (
	range7d  = 7
	range30d = 30
	range90d = 90
)

func parseRangeDays(rangeStr string) (int, error) {
	switch rangeStr {
	case "7d":
		return range7d, nil
	case "30d":
		return range30d, nil
	case "90d":
		return range90d, nil
	default:
		return 0, workspace.NewRPCError(rpcCodeInvalidParams, "invalid range: "+rangeStr)
	}
}

type overviewTokenUsageParams struct {
	Range       string `json:"range"`
	ProjectID   string `json:"projectId,omitempty"`
	Granularity string `json:"granularity"`
}

func (h *JSONRPCHandler) handleOverviewTokenUsage(ctx context.Context, params json.RawMessage) (any, error) {
	var req overviewTokenUsageParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	rangeDays, err := parseRangeDays(req.Range)
	if err != nil {
		return nil, err
	}
	return h.overviewStore().GetTokenUsageSeries(ctx, rangeDays, req.ProjectID, req.Granularity)
}

type overviewBreakdownParams struct {
	Range     string `json:"range"`
	ProjectID string `json:"projectId,omitempty"`
}

func (h *JSONRPCHandler) handleOverviewModelBreakdown(ctx context.Context, params json.RawMessage) (any, error) {
	var req overviewBreakdownParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	rangeDays, err := parseRangeDays(req.Range)
	if err != nil {
		return nil, err
	}
	return h.overviewStore().GetModelBreakdown(ctx, rangeDays, req.ProjectID)
}

func (h *JSONRPCHandler) handleOverviewAgentKindBreakdown(ctx context.Context, params json.RawMessage) (any, error) {
	var req overviewBreakdownParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	rangeDays, err := parseRangeDays(req.Range)
	if err != nil {
		return nil, err
	}
	return h.overviewStore().GetAgentKindBreakdown(ctx, rangeDays, req.ProjectID)
}

type overviewWorkspaceInsightsParams struct {
	Range     string `json:"range"`
	ProjectID string `json:"projectId,omitempty"`
}

func (h *JSONRPCHandler) handleOverviewWorkspaceInsights(ctx context.Context, params json.RawMessage) (any, error) {
	var req overviewWorkspaceInsightsParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	rangeDays, err := parseRangeDays(req.Range)
	if err != nil {
		return nil, err
	}
	return h.overviewStore().GetWorkspaceInsights(ctx, rangeDays, req.ProjectID)
}

// handleTokenUsageMigrationStatus reports whether the API-to-local migrations are complete.
func (h *JSONRPCHandler) handleTokenUsageMigrationStatus(ctx context.Context, _ json.RawMessage) (any, error) {
	projectsDone, _ := localdb.MetadataKeyExists(ctx, h.localDatabase, "migration_api_completed")
	usageDone, _ := localdb.MetadataKeyExists(ctx, h.localDatabase, "migration_usage_api_completed")
	return map[string]any{
		"projectsMigrated": projectsDone,
		"usageMigrated":    usageDone,
	}, nil
}
