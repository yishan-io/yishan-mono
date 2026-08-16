package session

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/platform/config"
)

func TestRuntimeClearAuthState_RetainsInMemoryCredentialsWhenPersistenceFails(t *testing.T) {
	cfg := &config.Config{
		ConfigPath: t.TempDir(),
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "access-token",
			RefreshToken:          "refresh-token",
			AccessTokenExpiresAt:  "2026-08-01T00:00:00Z",
			RefreshTokenExpiresAt: "2026-08-31T00:00:00Z",
		},
	}
	session := New(cfg)

	if err := session.ClearAuthState(); err == nil {
		t.Fatal("expected clear auth state to fail when config path is a directory")
	}
	if cfg.API.Token != "access-token" || cfg.API.RefreshToken != "refresh-token" {
		t.Fatalf("expected in-memory credentials to remain after persistence failure, got %+v", cfg.API)
	}
}

func TestRuntimeAPIClient_ClearsPersistedCredentialsAfterPermanentRefreshFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:      server.URL,
			Token:        "expired-access",
			RefreshToken: "invalid-refresh",
		},
	}
	session := New(cfg)
	if err := session.PersistAuthTokens(cloud.TokenUpdate{
		AccessToken:  cfg.API.Token,
		RefreshToken: cfg.API.RefreshToken,
	}); err != nil {
		t.Fatalf("seed credential file: %v", err)
	}

	if _, err := session.APIClient().DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected permanent refresh failure")
	}
	if cfg.API.Token != "" || cfg.API.RefreshToken != "" {
		t.Fatalf("expected in-memory credentials to clear, got %+v", cfg.API)
	}
	stored := loadConfigForTest(t, configPath)
	if stored.GetString("api_token") != "" || stored.GetString("api_refresh_token") != "" {
		t.Fatal("expected direct API client to clear persisted credentials")
	}
}

func TestRuntimeClearAuthState_DoesNotAllowStaleClientToRestoreCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			if r.Header.Get("Authorization") == "Bearer fresh-access" {
				_, _ = w.Write([]byte(`{"ok":true}`))
				return
			}
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			json.NewEncoder(w).Encode(cloud.TokenUpdate{
				AccessToken:           "fresh-access",
				RefreshToken:          "fresh-refresh",
				AccessTokenExpiresAt:  time.Now().Add(10 * time.Minute).Format(time.RFC3339Nano),
				RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:      server.URL,
			Token:        "expired-access",
			RefreshToken: "valid-refresh",
		},
	}
	session := New(cfg)
	if err := session.PersistAuthTokens(cloud.TokenUpdate{
		AccessToken:  cfg.API.Token,
		RefreshToken: cfg.API.RefreshToken,
	}); err != nil {
		t.Fatalf("seed credential file: %v", err)
	}

	staleClient := session.APIClient()
	if err := session.ClearAuthState(); err != nil {
		t.Fatalf("clear auth state: %v", err)
	}
	if _, err := staleClient.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected stale client refresh to be rejected")
	}
	if _, err := staleClient.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected stale client not to reuse tokens from rejected refresh")
	}

	stored := loadConfigForTest(t, configPath)
	if stored.GetString("api_token") != "" || stored.GetString("api_refresh_token") != "" {
		t.Fatal("expected stale client not to restore cleared credentials")
	}
}

func TestRuntimeAPIClient_AllowsConcurrentRefreshesFromSameAuthGeneration(t *testing.T) {
	var refreshMu sync.Mutex
	refreshCount := 0
	firstRefreshStarted := make(chan struct{})
	releaseFirstRefresh := make(chan struct{})
	secondRefreshFinished := make(chan struct{})
	now := time.Now()
	olderAccessExpiry := now.Add(5 * time.Minute).Format(time.RFC3339Nano)
	newerAccessExpiry := now.Add(10 * time.Minute).Format(time.RFC3339Nano)
	refreshExpiry := now.Add(24 * time.Hour).Format(time.RFC3339Nano)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			if r.Header.Get("Authorization") != "Bearer expired-access" {
				_, _ = w.Write([]byte(`{"ok":true}`))
				return
			}
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			refreshMu.Lock()
			refreshCount++
			refreshNumber := refreshCount
			refreshMu.Unlock()
			if refreshNumber == 1 {
				close(firstRefreshStarted)
				<-releaseFirstRefresh
				json.NewEncoder(w).Encode(cloud.TokenUpdate{
					AccessToken:           "older-access",
					RefreshToken:          "valid-refresh",
					AccessTokenExpiresAt:  olderAccessExpiry,
					RefreshTokenExpiresAt: refreshExpiry,
				})
				return
			}
			json.NewEncoder(w).Encode(cloud.TokenUpdate{
				AccessToken:           "newer-access",
				RefreshToken:          "valid-refresh",
				AccessTokenExpiresAt:  newerAccessExpiry,
				RefreshTokenExpiresAt: refreshExpiry,
			})
			close(secondRefreshFinished)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:      server.URL,
			Token:        "expired-access",
			RefreshToken: "valid-refresh",
		},
	}
	session := New(cfg)
	if err := session.PersistAuthTokens(cloud.TokenUpdate{
		AccessToken:  cfg.API.Token,
		RefreshToken: cfg.API.RefreshToken,
	}); err != nil {
		t.Fatalf("seed credential file: %v", err)
	}

	clients := []*cloud.Client{session.APIClient(), session.APIClient()}
	start := make(chan struct{})
	errs := make(chan error, len(clients))
	var wg sync.WaitGroup
	for _, client := range clients {
		wg.Add(1)
		go func(client *cloud.Client) {
			defer wg.Done()
			<-start
			_, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
			errs <- err
		}(client)
	}
	close(start)
	<-firstRefreshStarted
	<-secondRefreshFinished
	close(releaseFirstRefresh)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("expected concurrent-generation client refresh to succeed, got %v", err)
		}
	}
	refreshMu.Lock()
	defer refreshMu.Unlock()
	if refreshCount != 2 {
		t.Fatalf("expected both clients to refresh, got %d refreshes", refreshCount)
	}
	if cfg.API.Token != "newer-access" {
		t.Fatalf("expected newer access token to remain in memory, got %q", cfg.API.Token)
	}
	stored := loadConfigForTest(t, configPath)
	if stored.GetString("api_token") != "newer-access" {
		t.Fatalf("expected newer access token to remain persisted, got %q", stored.GetString("api_token"))
	}
}
