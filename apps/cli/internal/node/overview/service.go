// Package overview is the Node application service for the overview.* RPC
// namespace: per-device usage analytics read from the daemon's local SQLite.
// It validates request scope and delegates aggregation to the store.
package overview

import (
	"context"
	"strings"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

// Store is the read port for local Overview aggregates.
type Store interface {
	GetTokenUsageSeries(context.Context, sqlite.OverviewFilter, sqlite.OverviewGranularity) (sqlite.OverviewTokenUsageResult, error)
	GetModelBreakdown(context.Context, sqlite.OverviewFilter) (sqlite.OverviewModelBreakdownResult, error)
	GetWorkspaceInsights(context.Context, sqlite.OverviewFilter) (sqlite.OverviewWorkspaceInsightsResult, error)
}

// Deps are the explicit dependencies of the overview service. Now defaults to
// time.Now and exists for deterministic tests.
type Deps struct {
	Store Store
	Now   func() time.Time
}

// Service implements the overview.* RPC namespace.
type Service struct {
	deps Deps
}

// NewService builds the overview application service.
func NewService(deps Deps) *Service {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Service{deps: deps}
}

var rangeDays = map[string]int{"7d": 7, "30d": 30, "90d": 90}

// TokenUsage returns the usage series and totals for the requested scope.
func (s *Service) TokenUsage(ctx context.Context, request rpc.OverviewTokenUsageParams) (any, error) {
	filter, err := s.filter(request.OverviewQueryParams)
	if err != nil {
		return nil, err
	}
	granularity, err := parseGranularity(request.Granularity)
	if err != nil {
		return nil, err
	}
	return s.deps.Store.GetTokenUsageSeries(ctx, filter, granularity)
}

// ModelBreakdown returns per-model usage for the requested scope.
func (s *Service) ModelBreakdown(ctx context.Context, request rpc.OverviewQueryParams) (any, error) {
	filter, err := s.filter(request)
	if err != nil {
		return nil, err
	}
	return s.deps.Store.GetModelBreakdown(ctx, filter)
}

// WorkspaceInsights returns closed/primary workspace statistics.
func (s *Service) WorkspaceInsights(ctx context.Context, request rpc.OverviewQueryParams) (any, error) {
	filter, err := s.filter(request)
	if err != nil {
		return nil, err
	}
	return s.deps.Store.GetWorkspaceInsights(ctx, filter)
}

func (s *Service) filter(request rpc.OverviewQueryParams) (sqlite.OverviewFilter, error) {
	days, ok := rangeDays[request.Range]
	if !ok {
		return sqlite.OverviewFilter{}, rpc.NewRPCError(rpc.CodeInvalidParams, "invalid range: "+request.Range)
	}
	now := s.deps.Now().UTC()
	return sqlite.OverviewFilter{
		Since:          now.Add(-time.Duration(days) * 24 * time.Hour),
		Until:          now,
		ProjectID:      strings.TrimSpace(request.ProjectID),
		OrganizationID: strings.TrimSpace(request.OrganizationID),
	}, nil
}

func parseGranularity(value string) (sqlite.OverviewGranularity, error) {
	switch sqlite.OverviewGranularity(value) {
	case "", sqlite.OverviewGranularityDay:
		return sqlite.OverviewGranularityDay, nil
	case sqlite.OverviewGranularityHour:
		return sqlite.OverviewGranularityHour, nil
	default:
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "invalid granularity: "+value)
	}
}
