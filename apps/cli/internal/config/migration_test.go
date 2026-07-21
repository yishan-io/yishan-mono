package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
)

func TestLoadContextMigratesLegacyCurrentOrgID(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "context.yaml")
	writeTestFile(t, contextPath, "current_org_id: org-legacy\n")

	cfg, err := LoadContext(contextPath)
	if err != nil {
		t.Fatalf("LoadContext error: %v", err)
	}
	if cfg.DefaultOrgID != "org-legacy" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-legacy")
	}

	stored := loadTestConfig(t, contextPath)
	if stored.GetString(KeyDefaultOrgID) != "org-legacy" {
		t.Fatalf("stored default_org_id = %q, want %q", stored.GetString(KeyDefaultOrgID), "org-legacy")
	}
	if stored.IsSet("current_org_id") {
		t.Fatal("expected current_org_id to be removed from context.yaml")
	}
}

func TestLoadSettingsMigratesLegacyViperIntoSettingsFile(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.yaml")
	legacy := viper.New()
	legacy.Set(KeyCurrentOrgID, "org-from-credential")
	legacy.Set(KeyMemorySummarizerEnabled, true)
	legacy.Set(KeyMemorySummarizerAgentKind, "opencode")
	legacy.Set(KeyMemorySummarizerModel, "gpt-test")

	cfg, err := LoadSettings(settingsPath, legacy)
	if err != nil {
		t.Fatalf("LoadSettings error: %v", err)
	}
	if cfg.DefaultOrgID != "org-from-credential" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-from-credential")
	}
	if !cfg.Memory.SummarizerEnabled {
		t.Fatal("expected summarizer enabled to migrate from legacy config")
	}
	if cfg.Memory.SummarizerAgentKind != "opencode" {
		t.Fatalf("SummarizerAgentKind = %q, want %q", cfg.Memory.SummarizerAgentKind, "opencode")
	}
	if cfg.Memory.SummarizerModel != "gpt-test" {
		t.Fatalf("SummarizerModel = %q, want %q", cfg.Memory.SummarizerModel, "gpt-test")
	}
	assertDefaultComputerUse(t, cfg.ComputerUse)

	stored := loadTestConfig(t, settingsPath)
	if stored.GetString(KeyDefaultOrgID) != "org-from-credential" {
		t.Fatalf("stored default_org_id = %q, want %q", stored.GetString(KeyDefaultOrgID), "org-from-credential")
	}
	if !stored.GetBool("memory.summarizer.enabled") {
		t.Fatal("expected stored memory.summarizer.enabled = true")
	}
	if stored.GetString("memory.summarizer.agent_kind") != "opencode" {
		t.Fatalf("stored agent_kind = %q, want %q", stored.GetString("memory.summarizer.agent_kind"), "opencode")
	}
	if stored.GetString("memory.summarizer.model") != "gpt-test" {
		t.Fatalf("stored model = %q, want %q", stored.GetString("memory.summarizer.model"), "gpt-test")
	}
}

func TestLoadSettingsFallsBackToContextWhenLegacyOrgMissing(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "context.yaml")
	settingsPath := filepath.Join(dir, "settings.yaml")
	writeTestFile(t, contextPath, "default_org_id: org-from-context\n")

	cfg, err := LoadSettings(settingsPath, viper.New())
	if err != nil {
		t.Fatalf("LoadSettings error: %v", err)
	}
	if cfg.DefaultOrgID != "org-from-context" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-from-context")
	}

	stored := loadTestConfig(t, settingsPath)
	if stored.GetString(KeyDefaultOrgID) != "org-from-context" {
		t.Fatalf("stored default_org_id = %q, want %q", stored.GetString(KeyDefaultOrgID), "org-from-context")
	}
}

func TestLoadSettingsBackfillsExistingSettingsFromContext(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "context.yaml")
	settingsPath := filepath.Join(dir, "settings.yaml")
	writeTestFile(t, contextPath, "default_org_id: org-from-context\n")
	writeTestFile(t, settingsPath, "memory:\n  summarizer:\n    enabled: true\n")

	cfg, err := LoadSettings(settingsPath, viper.New())
	if err != nil {
		t.Fatalf("LoadSettings error: %v", err)
	}
	if cfg.DefaultOrgID != "org-from-context" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-from-context")
	}
	if !cfg.Memory.SummarizerEnabled {
		t.Fatal("expected existing settings memory config to remain intact")
	}

	stored := loadTestConfig(t, settingsPath)
	if stored.GetString(KeyDefaultOrgID) != "org-from-context" {
		t.Fatalf("stored default_org_id = %q, want %q", stored.GetString(KeyDefaultOrgID), "org-from-context")
	}
	if !stored.GetBool("memory.summarizer.enabled") {
		t.Fatal("expected existing memory.summarizer.enabled to stay true")
	}
}

func TestLoadRemovesLegacyCredentialCurrentOrgIDAfterMigration(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "credential.yaml")
	writeTestFile(t, configPath, "current_org_id: org-legacy\napi_base_url: https://api.example.com\n")

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
	if cfg.DefaultOrgID != "org-legacy" {
		t.Fatalf("DefaultOrgID = %q, want %q", cfg.DefaultOrgID, "org-legacy")
	}

	storedCredential := loadTestConfig(t, configPath)
	if storedCredential.IsSet(KeyCurrentOrgID) {
		t.Fatal("expected credential.yaml current_org_id to be removed after Load")
	}

	storedSettings := loadTestConfig(t, filepath.Join(dir, "settings.yaml"))
	if storedSettings.GetString(KeyDefaultOrgID) != "org-legacy" {
		t.Fatalf("stored settings default_org_id = %q, want %q", storedSettings.GetString(KeyDefaultOrgID), "org-legacy")
	}
}

func assertDefaultComputerUse(t *testing.T, cfg ComputerUseConfig) {
	t.Helper()
	if !cfg.Enabled || !cfg.Observe || !cfg.Capture || !cfg.Inspect || !cfg.Actions || !cfg.Mouse || !cfg.Keyboard || !cfg.ClipboardRead || !cfg.ClipboardWrite || !cfg.ApplicationControl {
		t.Fatalf("expected default computer_use config to be fully enabled: %+v", cfg)
	}
}

func writeTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q): %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}
}

func loadTestConfig(t *testing.T, path string) *viper.Viper {
	t.Helper()
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("ReadInConfig(%q): %v", path, err)
	}
	return v
}
