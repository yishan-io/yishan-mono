package runtime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"
)

func TestPersistAuthTokensRejectsStaleExpiryUpdate(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "current-access",
			RefreshToken:          "current-refresh",
			AccessTokenExpiresAt:  "2026-05-11T10:10:00Z",
			RefreshTokenExpiresAt: "2026-05-11T11:10:00Z",
		},
	}
	Configure(cfg)
	t.Cleanup(func() {
		Configure(nil)
	})

	if err := PersistAuthTokens(api.TokenUpdate{
		AccessToken:           cfg.API.Token,
		RefreshToken:          cfg.API.RefreshToken,
		AccessTokenExpiresAt:  cfg.API.AccessTokenExpiresAt,
		RefreshTokenExpiresAt: cfg.API.RefreshTokenExpiresAt,
	}); err != nil {
		t.Fatalf("seed config: %v", err)
	}

	if err := PersistAuthTokens(api.TokenUpdate{
		AccessToken:           "stale-access",
		RefreshToken:          "stale-refresh",
		AccessTokenExpiresAt:  "2026-05-11T09:10:00Z",
		RefreshTokenExpiresAt: "2026-05-11T10:10:00Z",
	}); err != nil {
		t.Fatalf("persist stale update: %v", err)
	}

	if cfg.API.Token != "current-access" {
		t.Fatalf("expected in-memory token unchanged, got %q", cfg.API.Token)
	}
	if cfg.API.RefreshToken != "current-refresh" {
		t.Fatalf("expected in-memory refresh token unchanged, got %q", cfg.API.RefreshToken)
	}

	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString("api_token"); got != "current-access" {
		t.Fatalf("expected persisted token unchanged, got %q", got)
	}
	if got := stored.GetString("api_refresh_token"); got != "current-refresh" {
		t.Fatalf("expected persisted refresh token unchanged, got %q", got)
	}
}

func TestPersistAuthTokensAcceptsNewerExpiryUpdate(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "old-access",
			RefreshToken:          "old-refresh",
			AccessTokenExpiresAt:  "2026-05-11T09:10:00Z",
			RefreshTokenExpiresAt: "2026-05-11T10:10:00Z",
		},
	}
	Configure(cfg)
	t.Cleanup(func() {
		Configure(nil)
	})

	if err := PersistAuthTokens(api.TokenUpdate{
		AccessToken:           "new-access",
		RefreshToken:          "new-refresh",
		AccessTokenExpiresAt:  "2026-05-11T10:10:00Z",
		RefreshTokenExpiresAt: "2026-05-11T11:10:00Z",
	}); err != nil {
		t.Fatalf("persist newer update: %v", err)
	}

	if cfg.API.Token != "new-access" {
		t.Fatalf("expected in-memory token to update, got %q", cfg.API.Token)
	}
	if cfg.API.RefreshToken != "new-refresh" {
		t.Fatalf("expected in-memory refresh token to update, got %q", cfg.API.RefreshToken)
	}

	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString("api_token"); got != "new-access" {
		t.Fatalf("expected persisted token to update, got %q", got)
	}
	if got := stored.GetString("api_refresh_token"); got != "new-refresh" {
		t.Fatalf("expected persisted refresh token to update, got %q", got)
	}
}

func TestPersistAuthTokensClearsRefreshFieldsWhenUpdateOmitsThem(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "old-access",
			RefreshToken:          "old-refresh",
			AccessTokenExpiresAt:  "2026-05-11T09:10:00Z",
			RefreshTokenExpiresAt: "2026-05-11T10:10:00Z",
		},
	}
	Configure(cfg)
	t.Cleanup(func() {
		Configure(nil)
	})

	if err := PersistAuthTokens(api.TokenUpdate{AccessToken: "service-token"}); err != nil {
		t.Fatalf("persist service token update: %v", err)
	}

	if cfg.API.Token != "service-token" {
		t.Fatalf("expected in-memory token to update, got %q", cfg.API.Token)
	}
	if cfg.API.RefreshToken != "" {
		t.Fatalf("expected in-memory refresh token to clear, got %q", cfg.API.RefreshToken)
	}
	if cfg.API.AccessTokenExpiresAt != "" {
		t.Fatalf("expected in-memory access expiry to clear, got %q", cfg.API.AccessTokenExpiresAt)
	}
	if cfg.API.RefreshTokenExpiresAt != "" {
		t.Fatalf("expected in-memory refresh expiry to clear, got %q", cfg.API.RefreshTokenExpiresAt)
	}

	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString("api_token"); got != "service-token" {
		t.Fatalf("expected persisted token to update, got %q", got)
	}
	if got := stored.GetString("api_refresh_token"); got != "" {
		t.Fatalf("expected persisted refresh token to clear, got %q", got)
	}
	if got := stored.GetString("api_access_token_expires_at"); got != "" {
		t.Fatalf("expected persisted access expiry to clear, got %q", got)
	}
	if got := stored.GetString("api_refresh_token_expires_at"); got != "" {
		t.Fatalf("expected persisted refresh expiry to clear, got %q", got)
	}
}

func loadConfigForTest(t *testing.T, configPath string) *viper.Viper {
	t.Helper()
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("read config %q: %v", configPath, err)
	}
	return v
}

func TestGetAccessTokenReturnsInMemoryToken(t *testing.T) {
	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL:              "https://api.yishan.io",
			Token:                "my-access-token",
			AccessTokenExpiresAt: "2026-05-11T10:00:00Z",
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	token, expiresAt, err := GetAccessToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "my-access-token" {
		t.Fatalf("expected token %q, got %q", "my-access-token", token)
	}
	if expiresAt != "2026-05-11T10:00:00Z" {
		t.Fatalf("expected expiresAt %q, got %q", "2026-05-11T10:00:00Z", expiresAt)
	}
}

func TestGetAccessTokenErrorsWhenNotConfigured(t *testing.T) {
	Configure(nil)
	token, _, err := GetAccessToken()
	if err == nil {
		t.Fatal("expected error when not configured")
	}
	if token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}

func TestGetAccessTokenErrorsWhenNoToken(t *testing.T) {
	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL: "https://api.yishan.io",
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	token, _, err := GetAccessToken()
	if err == nil {
		t.Fatal("expected error when token is empty")
	}
	if token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}

func TestEnsureFreshAccessTokenReturnsFreshTokenWithoutAPICall(t *testing.T) {
	futureExpiry := time.Now().Add(5 * time.Minute).Format(time.RFC3339Nano)
	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL:              "https://api.yishan.io",
			Token:                "fresh-token",
			RefreshToken:         "some-refresh",
			AccessTokenExpiresAt: futureExpiry,
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	token, expiresAt, err := EnsureFreshAccessToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "fresh-token" {
		t.Fatalf("expected token %q, got %q", "fresh-token", token)
	}
	if expiresAt != futureExpiry {
		t.Fatalf("expected expiresAt %q, got %q", futureExpiry, expiresAt)
	}
}

func TestEnsureFreshAccessTokenRefreshesExpiredToken(t *testing.T) {
	newExpiry := time.Now().Add(10 * time.Minute).Format(time.RFC3339Nano)
	meHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth/refresh" {
			json.NewEncoder(w).Encode(api.TokenUpdate{
				AccessToken:           "refreshed-access",
				RefreshToken:          "refreshed-refresh",
				AccessTokenExpiresAt:  newExpiry,
				RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
			})
			return
		}
		if r.URL.Path == "/me" {
			json.NewEncoder(w).Encode(map[string]any{
				"user": map[string]string{"id": "u1", "email": "test@test.com"},
			})
			return
		}
		http.NotFound(w, r)
	}
	server := httptest.NewServer(http.HandlerFunc(meHandler))
	defer server.Close()

	pastExpiry := time.Now().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               server.URL,
			Token:                 "expired-token",
			RefreshToken:          "some-refresh",
			AccessTokenExpiresAt:  pastExpiry,
			RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	token, _, err := EnsureFreshAccessToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "refreshed-access" {
		t.Fatalf("expected refreshed token, got %q", token)
	}
	if cfg.API.Token != "refreshed-access" {
		t.Fatalf("expected in-memory config updated, got %q", cfg.API.Token)
	}
}

func TestEnsureFreshAccessTokenErrorsWhenNotConfigured(t *testing.T) {
	Configure(nil)
	token, _, err := EnsureFreshAccessToken()
	if err == nil {
		t.Fatal("expected error when not configured")
	}
	if token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}

func TestCheckAuthStatusReturnsTrueForValidSession(t *testing.T) {
	newExpiry := time.Now().Add(10 * time.Minute).Format(time.RFC3339Nano)
	meHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/me" {
			if r.Header.Get("Authorization") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{
				"user": map[string]string{"id": "u1", "email": "test@test.com"},
			})
			return
		}
		if r.URL.Path == "/auth/refresh" {
			json.NewEncoder(w).Encode(api.TokenUpdate{
				AccessToken:           "new-access",
				RefreshToken:          "new-refresh",
				AccessTokenExpiresAt:  newExpiry,
				RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
			})
			return
		}
		http.NotFound(w, r)
	}
	server := httptest.NewServer(http.HandlerFunc(meHandler))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               server.URL,
			Token:                 "valid-token",
			RefreshToken:          "valid-refresh",
			AccessTokenExpiresAt:  time.Now().Add(5 * time.Minute).Format(time.RFC3339Nano),
			RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	authenticated, _, err := CheckAuthStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !authenticated {
		t.Fatal("expected authenticated=true")
	}
}

func TestCheckAuthStatusReturnsFalseWhenNotConfigured(t *testing.T) {
	Configure(nil)
	authenticated, _, err := CheckAuthStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if authenticated {
		t.Fatal("expected authenticated=false when not configured")
	}
}

func TestCheckAuthStatusReturnsFalseWhenTokenInvalid(t *testing.T) {
	meHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/me" {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `{"error":"unauthorized"}`)
			return
		}
		if r.URL.Path == "/auth/refresh" {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `{"error":"invalid refresh token"}`)
			return
		}
		http.NotFound(w, r)
	}
	server := httptest.NewServer(http.HandlerFunc(meHandler))
	defer server.Close()

	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL:               server.URL,
			Token:                 "bad-token",
			RefreshToken:          "bad-refresh",
			AccessTokenExpiresAt:  time.Now().Add(5 * time.Minute).Format(time.RFC3339Nano),
			RefreshTokenExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339Nano),
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	authenticated, _, err := CheckAuthStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if authenticated {
		t.Fatal("expected authenticated=false for invalid token")
	}
}

func TestUsesServiceTokenAuthReturnsTrueForServiceToken(t *testing.T) {
	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL: "https://api.yishan.io",
			Token:   "yst_service_token_value",
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	if !UsesServiceTokenAuth() {
		t.Fatal("expected service token auth to be detected")
	}
}

func TestUsesServiceTokenAuthReturnsFalseForJWTToken(t *testing.T) {
	cfg := &config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			BaseURL: "https://api.yishan.io",
			Token:   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
		},
	}
	Configure(cfg)
	t.Cleanup(func() { Configure(nil) })

	if UsesServiceTokenAuth() {
		t.Fatal("expected jwt token not to be detected as service token auth")
	}
}
