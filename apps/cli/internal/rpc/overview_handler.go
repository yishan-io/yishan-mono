package rpc

import (
	"context"
	"encoding/json"
)

const (
	MethodOverviewTokenUsage        = "overview.tokenUsage"
	MethodOverviewModelBreakdown    = "overview.modelBreakdown"
	MethodOverviewWorkspaceInsights = "overview.workspaceInsights"
)

// OverviewQueryParams scopes a local Overview aggregate. Range is one of
// 7d|30d|90d. Empty projectId/organizationId mean every project/organization
// recorded on this device.
type OverviewQueryParams struct {
	Range          string `json:"range"`
	ProjectID      string `json:"projectId,omitempty"`
	OrganizationID string `json:"organizationId,omitempty"`
}

// OverviewTokenUsageParams adds the series bucket size (hour|day, default day).
type OverviewTokenUsageParams struct {
	OverviewQueryParams
	Granularity string `json:"granularity,omitempty"`
}

type overviewService interface {
	TokenUsage(context.Context, OverviewTokenUsageParams) (any, error)
	ModelBreakdown(context.Context, OverviewQueryParams) (any, error)
	WorkspaceInsights(context.Context, OverviewQueryParams) (any, error)
}

// OverviewHandler owns overview.* decoding; aggregation lives in the service.
type OverviewHandler struct{ Services overviewService }

// Call implements Handler.
func (handler *OverviewHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodOverviewTokenUsage:
		var request OverviewTokenUsageParams
		if err := DecodeParams(params, &request); err != nil {
			return nil, err
		}
		return handler.Services.TokenUsage(ctx, request)
	case MethodOverviewModelBreakdown, MethodOverviewWorkspaceInsights:
		var request OverviewQueryParams
		if err := DecodeParams(params, &request); err != nil {
			return nil, err
		}
		if method == MethodOverviewModelBreakdown {
			return handler.Services.ModelBreakdown(ctx, request)
		}
		return handler.Services.WorkspaceInsights(ctx, request)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown overview method: "+method)
	}
}
