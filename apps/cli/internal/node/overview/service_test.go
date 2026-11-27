package overview

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

var testNow = time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)

type fakeStore struct {
	filter      sqlite.OverviewFilter
	granularity sqlite.OverviewGranularity
	calls       []string
}

func (f *fakeStore) GetTokenUsageSeries(_ context.Context, filter sqlite.OverviewFilter, granularity sqlite.OverviewGranularity) (sqlite.OverviewTokenUsageResult, error) {
	f.filter, f.granularity = filter, granularity
	f.calls = append(f.calls, "tokenUsage")
	return sqlite.OverviewTokenUsageResult{GrandTotal: 1}, nil
}

func (f *fakeStore) GetModelBreakdown(_ context.Context, filter sqlite.OverviewFilter) (sqlite.OverviewModelBreakdownResult, error) {
	f.filter = filter
	f.calls = append(f.calls, "modelBreakdown")
	return sqlite.OverviewModelBreakdownResult{}, nil
}

func (f *fakeStore) GetWorkspaceInsights(_ context.Context, filter sqlite.OverviewFilter) (sqlite.OverviewWorkspaceInsightsResult, error) {
	f.filter = filter
	f.calls = append(f.calls, "workspaceInsights")
	return sqlite.OverviewWorkspaceInsightsResult{}, nil
}

func newTestHandler() (*rpc.OverviewHandler, *fakeStore) {
	store := &fakeStore{}
	service := NewService(Deps{Store: store, Now: func() time.Time { return testNow }})
	return &rpc.OverviewHandler{Services: service}, store
}

func call(t *testing.T, handler *rpc.OverviewHandler, method, params string) error {
	t.Helper()
	_, err := handler.Call(context.Background(), nil, method, json.RawMessage(params))
	return err
}

func TestOverview_FilterFromRangeAndScope(t *testing.T) {
	handler, store := newTestHandler()
	err := call(t, handler, rpc.MethodOverviewTokenUsage, `{"range":"30d","projectId":" p1 ","organizationId":"o1","granularity":"hour"}`)
	if err != nil {
		t.Fatal(err)
	}
	want := sqlite.OverviewFilter{Since: testNow.AddDate(0, 0, -30), Until: testNow, ProjectID: "p1", OrganizationID: "o1"}
	if store.filter != want || store.granularity != sqlite.OverviewGranularityHour {
		t.Fatalf("filter = %+v granularity = %s", store.filter, store.granularity)
	}
}

func TestOverview_GranularityDefaultsToDay(t *testing.T) {
	handler, store := newTestHandler()
	if err := call(t, handler, rpc.MethodOverviewTokenUsage, `{"range":"7d"}`); err != nil {
		t.Fatal(err)
	}
	if store.granularity != sqlite.OverviewGranularityDay || store.filter.ProjectID != "" || store.filter.OrganizationID != "" {
		t.Fatalf("store = %+v", store)
	}
}

func TestOverview_RoutesEveryMethod(t *testing.T) {
	handler, store := newTestHandler()
	for _, method := range []string{rpc.MethodOverviewTokenUsage, rpc.MethodOverviewModelBreakdown, rpc.MethodOverviewWorkspaceInsights} {
		if err := call(t, handler, method, `{"range":"90d"}`); err != nil {
			t.Fatalf("%s: %v", method, err)
		}
	}
	if len(store.calls) != 3 || store.calls[1] != "modelBreakdown" || store.calls[2] != "workspaceInsights" {
		t.Fatalf("calls = %v", store.calls)
	}
}

func TestOverview_RejectsInvalidParams(t *testing.T) {
	handler, store := newTestHandler()
	cases := []struct{ method, params string }{
		{rpc.MethodOverviewTokenUsage, `{"range":"1d"}`},
		{rpc.MethodOverviewTokenUsage, `{"range":"7d","granularity":"week"}`},
		{rpc.MethodOverviewModelBreakdown, `{}`},
		{rpc.MethodOverviewWorkspaceInsights, `not json`},
		{"overview.agentKindBreakdown", `{"range":"7d"}`},
	}
	for _, tc := range cases {
		err := call(t, handler, tc.method, tc.params)
		var rpcErr *rpc.Error
		if !errors.As(err, &rpcErr) {
			t.Fatalf("%s %s: err = %v", tc.method, tc.params, err)
		}
	}
	if len(store.calls) != 0 {
		t.Fatalf("store called: %v", store.calls)
	}
}
