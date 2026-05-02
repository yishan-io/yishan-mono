package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
)

func TestExecuteLogoutClearsCredentialsAndRevokes(t *testing.T) {
	t.Setenv("YISHAN_API_TOKEN", "")
	t.Setenv("YISHAN_API_REFRESH_TOKEN", "")

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	seedCredentials(t, configPath)

	appConfig.ConfigPath = configPath
	appConfig.API.Token = "access-token"
	appConfig.API.RefreshToken = "refresh-token"
	appConfig.API.AccessTokenExpiresAt = "2026-01-01T00:00:00Z"
	appConfig.API.RefreshTokenExpiresAt = "2026-01-02T00:00:00Z"

	calledToken := ""
	if err := executeLogout(func(refreshToken string) error {
		calledToken = refreshToken
		return nil
	}, bytes.NewBuffer(nil)); err != nil {
		t.Fatalf("executeLogout returned error: %v", err)
	}

	if calledToken != "refresh-token" {
		t.Fatalf("expected revoke to be called with refresh token, got %q", calledToken)
	}

	assertCredentialsCleared(t, configPath)

	if appConfig.API.Token != "" || appConfig.API.RefreshToken != "" {
		t.Fatalf("expected in-memory credentials cleared, got token=%q refresh=%q", appConfig.API.Token, appConfig.API.RefreshToken)
	}
}

func TestExecuteLogoutAlreadyLoggedOutDoesNotFail(t *testing.T) {
	t.Setenv("YISHAN_API_TOKEN", "")
	t.Setenv("YISHAN_API_REFRESH_TOKEN", "")

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	appConfig.ConfigPath = configPath
	appConfig.API.Token = ""
	appConfig.API.RefreshToken = ""
	appConfig.API.AccessTokenExpiresAt = ""
	appConfig.API.RefreshTokenExpiresAt = ""

	called := false
	if err := executeLogout(func(string) error {
		called = true
		return nil
	}, bytes.NewBuffer(nil)); err != nil {
		t.Fatalf("expected no error when already logged out, got %v", err)
	}

	if called {
		t.Fatalf("expected revoke not to be called when already logged out")
	}
}

func TestExecuteLogoutContinuesWhenRevokeFails(t *testing.T) {
	t.Setenv("YISHAN_API_TOKEN", "")
	t.Setenv("YISHAN_API_REFRESH_TOKEN", "")

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	seedCredentials(t, configPath)

	appConfig.ConfigPath = configPath
	appConfig.API.Token = "access-token"
	appConfig.API.RefreshToken = "refresh-token"

	stderr := bytes.NewBuffer(nil)
	err := executeLogout(func(string) error {
		return assertErr("network unavailable")
	}, stderr)
	if err != nil {
		t.Fatalf("expected logout to succeed even when revoke fails, got %v", err)
	}

	assertCredentialsCleared(t, configPath)
	if stderr.Len() == 0 {
		t.Fatalf("expected warning to be printed when revoke fails")
	}
}

func TestExecuteLogoutEnvOnlyDoesNotCreateConfigFile(t *testing.T) {
	t.Setenv("YISHAN_API_TOKEN", "from-env")
	t.Setenv("YISHAN_API_REFRESH_TOKEN", "")

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	appConfig.ConfigPath = configPath
	appConfig.API.Token = "from-env"
	appConfig.API.RefreshToken = ""

	if err := executeLogout(func(string) error { return nil }, bytes.NewBuffer(nil)); err != nil {
		t.Fatalf("expected no error in env-only logout flow, got %v", err)
	}

	if _, err := os.Stat(configPath); !os.IsNotExist(err) {
		t.Fatalf("expected config file to remain absent, stat err=%v", err)
	}
}

type assertErr string

func (e assertErr) Error() string { return string(e) }

func seedCredentials(t *testing.T, configPath string) {
	t.Helper()
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set("api_token", "access-token")
		cfg.Set("api_refresh_token", "refresh-token")
		cfg.Set("api_access_token_expires_at", "2026-01-01T00:00:00Z")
		cfg.Set("api_refresh_token_expires_at", "2026-01-02T00:00:00Z")
	}); err != nil {
		t.Fatalf("seed config: %v", err)
	}
}

func assertCredentialsCleared(t *testing.T, configPath string) {
	t.Helper()

	v := viper.New()
	v.SetConfigFile(configPath)
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("read config: %v", err)
	}

	if v.GetString("api_token") != "" ||
		v.GetString("api_refresh_token") != "" ||
		v.GetString("api_access_token_expires_at") != "" ||
		v.GetString("api_refresh_token_expires_at") != "" {
		t.Fatalf("expected credentials to be cleared in config file")
	}
}
