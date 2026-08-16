package collection

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/platform/config"
)

func dirtyRow(orgID string, bucket time.Time) sqlite.HourlyUsageRow {
	return sqlite.HourlyUsageRow{
		ProjectID:          "proj-1",
		WorkspaceID:        "ws-" + orgID,
		WorkspacePath:      "/tmp/ws-" + orgID,
		AgentKind:          "pi",
		Model:              "gpt-4o",
		ModelNormalized:    "gpt-4o",
		OrganizationID:     orgID,
		BucketStartHourUTC: bucket.UnixMilli(),
		InputTokens:        10,
		OutputTokens:       20,
		TotalTokens:        30,
		TotalCostMicrosUSD: 100,
	}
}

// testRuntime builds a session.Session pointed at the test HTTP server so
// syncPending reaches the cloud API path.
func testRuntime(server *httptest.Server) *session.Session {
	return session.New(&config.Config{
		API: config.APIConfig{
			BaseURL:      server.URL,
			Token:        "access-token",
			RefreshToken: "refresh-token",
		},
	})
}

// TestSyncPendingPartialOrgFailureLeavesFailedOrgDirty covers the partial
// sync exit criterion: one org failing must not stop the other orgs from
// syncing, and the failed org's rows stay unmarked.
func TestSyncPendingPartialOrgFailureLeavesFailedOrgDirty(t *testing.T) {
	var orgCalls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orgCalls = append(orgCalls, r.URL.Path)
		if r.URL.Path == "/orgs/org-fail/token-usage/hourly" {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"boom"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}))
	defer server.Close()

	repo := &dirtyRowRepository{
		dirtyRows: []sqlite.HourlyUsageRow{
			dirtyRow("org-fail", time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)),
			dirtyRow("org-ok", time.Date(2026, 8, 16, 11, 0, 0, 0, time.UTC)),
		},
	}
	collector := newTestCollector(repo)
	collector.runtime = testRuntime(server)

	collector.syncPending("test")

	if len(orgCalls) != 2 {
		t.Fatalf("expected both orgs attempted, got %v", orgCalls)
	}
	if len(repo.syncedOrgs) != 1 || repo.syncedOrgs[0] != "org-ok" {
		t.Fatalf("expected only org-ok marked synced, got %v", repo.syncedOrgs)
	}
	if repo.syncedCount != 1 {
		t.Fatalf("expected 1 row marked synced, got %d", repo.syncedCount)
	}
}

// TestSyncPendingSkipsEmptyAndUnknownOrgs covers attribution-skip rules:
// rows with no usable org id are not uploaded and never marked synced.
func TestSyncPendingSkipsEmptyAndUnknownOrgs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}))
	defer server.Close()

	repo := &dirtyRowRepository{
		dirtyRows: []sqlite.HourlyUsageRow{
			dirtyRow("", time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)),
			dirtyRow("unknown", time.Date(2026, 8, 16, 11, 0, 0, 0, time.UTC)),
		},
	}
	collector := newTestCollector(repo)
	collector.runtime = testRuntime(server)

	collector.syncPending("test")

	if len(repo.syncedOrgs) != 0 {
		t.Fatalf("expected no org synced for empty/unknown rows, got %v", repo.syncedOrgs)
	}
}

// TestSyncPendingNoOpWithoutRuntime covers the guard: with no API session
// configured the sync must not touch the repository.
func TestSyncPendingNoOpWithoutRuntime(t *testing.T) {
	repo := &dirtyRowRepository{
		dirtyRows: []sqlite.HourlyUsageRow{
			dirtyRow("org-ok", time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)),
		},
	}
	collector := newTestCollector(repo)

	collector.syncPending("test")

	if len(repo.syncedOrgs) != 0 {
		t.Fatalf("expected no sync without runtime, got %v", repo.syncedOrgs)
	}
}
