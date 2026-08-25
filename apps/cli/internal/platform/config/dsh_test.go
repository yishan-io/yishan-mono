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
	if loaded.Daemon.DSHProvider != DefaultDSHProvider {
		t.Fatalf("provider = %q, want %q", loaded.Daemon.DSHProvider, DefaultDSHProvider)
	}
	if loaded.Daemon.DSHModel != DefaultDSHModel {
		t.Fatalf("model = %q, want %q", loaded.Daemon.DSHModel, DefaultDSHModel)
	}
}

func TestDSHDataDir_IsAccountScoped(t *testing.T) {
	accountDataDir := filepath.Join("profiles", "default", "accounts", "account-1")
	if got, want := DSHDataDir(accountDataDir), filepath.Join(accountDataDir, "dsh"); got != want {
		t.Fatalf("DSH data dir = %q, want %q", got, want)
	}
}
