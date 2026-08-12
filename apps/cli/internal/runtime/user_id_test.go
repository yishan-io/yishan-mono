package runtime

import (
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"
)

func TestPersistAuthTokensWritesUserIDWhenProvided(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "access-token",
			RefreshToken:          "refresh-token",
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
		UserID:                "user_123",
	}); err != nil {
		t.Fatalf("persist with user id: %v", err)
	}

	if cfg.UserID != "user_123" {
		t.Fatalf("in-memory UserID = %q, want %q", cfg.UserID, "user_123")
	}
	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString(config.KeyUserID); got != "user_123" {
		t.Fatalf("persisted user_id = %q, want %q", got, "user_123")
	}
}

func TestPersistAuthTokensKeepsUserIDWhenUpdateOmitsIt(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		UserID:     "user_123",
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "access-token",
			RefreshToken:          "refresh-token",
			AccessTokenExpiresAt:  "2026-05-11T10:10:00Z",
			RefreshTokenExpiresAt: "2026-05-11T11:10:00Z",
		},
	}
	Configure(cfg)
	t.Cleanup(func() {
		Configure(nil)
	})

	// Seed the file with a known user_id first (as a prior login would).
	if err := PersistAuthTokens(api.TokenUpdate{
		AccessToken:           cfg.API.Token,
		RefreshToken:          cfg.API.RefreshToken,
		AccessTokenExpiresAt:  cfg.API.AccessTokenExpiresAt,
		RefreshTokenExpiresAt: cfg.API.RefreshTokenExpiresAt,
		UserID:                "user_123",
	}); err != nil {
		t.Fatalf("seed user id: %v", err)
	}

	// A token refresh update carries no user_id and must not wipe it.
	if err := PersistAuthTokens(api.TokenUpdate{
		AccessToken:           "new-access",
		RefreshToken:          "new-refresh",
		AccessTokenExpiresAt:  "2026-05-12T10:10:00Z",
		RefreshTokenExpiresAt: "2026-05-12T11:10:00Z",
	}); err != nil {
		t.Fatalf("persist refresh update: %v", err)
	}

	if cfg.UserID != "user_123" {
		t.Fatalf("in-memory UserID = %q, want %q", cfg.UserID, "user_123")
	}
	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString(config.KeyUserID); got != "user_123" {
		t.Fatalf("persisted user_id = %q, want %q", got, "user_123")
	}
}

func TestClearAuthStateClearsUserID(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	cfg := &config.Config{
		ConfigPath: configPath,
		UserID:     "user_123",
		API: config.APIConfig{
			BaseURL:               "https://api.yishan.io",
			Token:                 "access-token",
			RefreshToken:          "refresh-token",
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
		UserID:                "user_123",
	}); err != nil {
		t.Fatalf("seed user id: %v", err)
	}

	if err := ClearAuthState(); err != nil {
		t.Fatalf("clear auth state: %v", err)
	}

	if cfg.UserID != "" {
		t.Fatalf("in-memory UserID = %q, want cleared", cfg.UserID)
	}
	stored := loadConfigForTest(t, configPath)
	if got := stored.GetString(config.KeyUserID); got != "" {
		t.Fatalf("persisted user_id = %q, want cleared", got)
	}
}
