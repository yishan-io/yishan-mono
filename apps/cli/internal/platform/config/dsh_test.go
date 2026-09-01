package config

import (
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
)

func TestLoad_UsesDSHProviderAndModelDefaults(t *testing.T) {
	v := viper.New()
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")

	loaded, err := Load(v, credentialPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if loaded.Daemon.DSHEnabled {
		t.Fatal("DSH is enabled by default")
	}
	if loaded.Daemon.DSHDeveloperMode {
		t.Fatal("DSH developer mode is enabled by default")
	}
	if loaded.Daemon.DSHProvider != DefaultDSHProvider {
		t.Fatalf("provider = %q, want %q", loaded.Daemon.DSHProvider, DefaultDSHProvider)
	}
	const expectedDefaultDSHModel = "deepseek-v4-flash"
	if DefaultDSHModel != expectedDefaultDSHModel {
		t.Fatalf("default DSH model = %q, want %q", DefaultDSHModel, expectedDefaultDSHModel)
	}
	if loaded.Daemon.DSHModel != expectedDefaultDSHModel {
		t.Fatalf("model = %q, want %q", loaded.Daemon.DSHModel, expectedDefaultDSHModel)
	}
}

func TestDSHDataDir_IsAccountScoped(t *testing.T) {
	accountDataDir := filepath.Join("profiles", "default", "accounts", "account-1")
	if got, want := DSHDataDir(accountDataDir), filepath.Join(accountDataDir, "dsh"); got != want {
		t.Fatalf("DSH data dir = %q, want %q", got, want)
	}
}

func TestLoad_UsesDSHDeveloperMode(t *testing.T) {
	v := viper.New()
	v.Set("daemon_dsh_developer_mode", true)

	loaded, err := Load(v, filepath.Join(t.TempDir(), "credential.yaml"))
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !loaded.Daemon.DSHDeveloperMode {
		t.Fatal("DSH developer mode is disabled, want enabled")
	}
}

func TestLoad_PropagatesDSHPluginSeedPath(t *testing.T) {
	v := viper.New()
	v.Set("daemon_dsh_plugin_seed_path", "/bundle/dev-flow.tgz")
	loaded, err := Load(v, filepath.Join(t.TempDir(), "credential.yaml"))
	if err != nil || loaded.Daemon.DSHPluginSeedPath != "/bundle/dev-flow.tgz" {
		t.Fatalf("seed path = %q, %v", loaded.Daemon.DSHPluginSeedPath, err)
	}
}
