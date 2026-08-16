package config

import (
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
)

func TestResolveAccountDataDir_UsesAccountDirWhenUserIDPresent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")
	writeTestFile(t, configPath, "user_id: user_123\napi_token: tok\n")

	dataDir, err := ResolveAccountDataDir(configPath)
	if err != nil {
		t.Fatalf("ResolveAccountDataDir error: %v", err)
	}
	want := filepath.Join(dir, AccountDirName, "user_123")
	if dataDir != want {
		t.Fatalf("dataDir = %q, want %q", dataDir, want)
	}
}

func TestResolveAccountDataDir_FallsBackToEnvRootWhenUserIDAbsent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")
	writeTestFile(t, configPath, "api_token: tok\n")

	dataDir, err := ResolveAccountDataDir(configPath)
	if err != nil {
		t.Fatalf("ResolveAccountDataDir error: %v", err)
	}
	if dataDir != dir {
		t.Fatalf("dataDir = %q, want env root %q", dataDir, dir)
	}
}

func TestResolveAccountDataDir_FallsBackToEnvRootWhenCredentialMissing(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")

	dataDir, err := ResolveAccountDataDir(configPath)
	if err != nil {
		t.Fatalf("ResolveAccountDataDir error: %v", err)
	}
	if dataDir != dir {
		t.Fatalf("dataDir = %q, want env root %q", dataDir, dir)
	}
}

func TestResolveAccountDataDir_EmptyConfigPathFallsBackToDot(t *testing.T) {
	dataDir, err := ResolveAccountDataDir("")
	if err != nil {
		t.Fatalf("ResolveAccountDataDir error: %v", err)
	}
	if dataDir != "." {
		t.Fatalf("dataDir = %q, want %q", dataDir, ".")
	}
}

func TestLoadReadsSettingsFromAccountDirWhenUserIDPresent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")
	writeTestFile(t, configPath, "user_id: user_123\napi_token: tok\n")
	accountDir := filepath.Join(dir, AccountDirName, "user_123")
	writeTestFile(t, filepath.Join(accountDir, settingsFileName), "default_org_id: org-acct\n")

	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	v.Set("log_level", "info")
	v.Set("log_format", "pretty")
	v.Set("output", "default")
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("ReadInConfig error: %v", err)
	}

	cfg, err := Load(v, configPath)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}
	wantSettings := filepath.Join(accountDir, settingsFileName)
	if cfg.SettingsPath != wantSettings {
		t.Fatalf("SettingsPath = %q, want %q", cfg.SettingsPath, wantSettings)
	}
	if cfg.DefaultOrgID != "org-acct" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-acct")
	}
	if cfg.UserID != "user_123" {
		t.Fatalf("UserID = %q, want %q", cfg.UserID, "user_123")
	}
}

func TestLoadReadsSettingsFromEnvRootWhenUserIDAbsent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")
	writeTestFile(t, configPath, "api_token: tok\n")
	writeTestFile(t, filepath.Join(dir, settingsFileName), "default_org_id: org-root\n")

	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	v.Set("log_level", "info")
	v.Set("log_format", "pretty")
	v.Set("output", "default")
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("ReadInConfig error: %v", err)
	}

	cfg, err := Load(v, configPath)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}
	if cfg.SettingsPath != filepath.Join(dir, settingsFileName) {
		t.Fatalf("SettingsPath = %q, want env-root settings", cfg.SettingsPath)
	}
	if cfg.DefaultOrgID != "org-root" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-root")
	}
}
