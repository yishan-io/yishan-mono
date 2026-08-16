package daemon

import (
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/platform/config"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
)

func TestInitLocalDatabase_CreatesMigratedProfileDatabase(t *testing.T) {
	profileDir := t.TempDir()
	database, err := initLocalDatabase(profileDir, profileDir)
	if err != nil {
		t.Fatalf("initialize local database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	var workspaceTableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`).Scan(&workspaceTableName); err != nil {
		t.Fatalf("find workspaces table: %v", err)
	}
	if workspaceTableName != "workspaces" {
		t.Fatalf("expected workspaces table, got %q", workspaceTableName)
	}
	// The local projects table was dropped (projects are remote-authoritative).
	var projectsTableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).Scan(&projectsTableName); err == nil {
		t.Fatalf("expected projects table to be dropped, got %q", projectsTableName)
	}
	if _, err := os.Stat(filepath.Join(profileDir, "yishan.db")); err != nil {
		t.Fatalf("expected profile database: %v", err)
	}
}

func TestUsesRemoteHostPolicyReturnsTrueForServiceTokenRuntime(t *testing.T) {
	runtime := cliruntime.New(&config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			Token: "yst_service_token_value",
		},
	})

	if !usesRemoteHostPolicy(runtime) {
		t.Fatal("expected remote host policy for service token runtime")
	}
}

func TestUsesRemoteHostPolicyReturnsFalseForNilRuntime(t *testing.T) {
	if usesRemoteHostPolicy(nil) {
		t.Fatal("expected nil runtime not to use remote host policy")
	}
}

func TestUsesRemoteHostPolicyReturnsFalseForJWTAuthRuntime(t *testing.T) {
	runtime := cliruntime.New(&config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API: config.APIConfig{
			Token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
		},
	})

	if usesRemoteHostPolicy(runtime) {
		t.Fatal("expected jwt auth runtime not to use remote host policy")
	}
}

func TestBuildMemorySummarizerConfigDisablesMemoryForRemoteHostPolicy(t *testing.T) {
	runtime := cliruntime.New(&config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API:        config.APIConfig{Token: "yst_service_token_value"},
	})

	cfg := buildMemorySummarizerConfig(RunConfig{
		MemorySummarizer:      true,
		MemorySummarizerAgent: "opencode",
		MemorySummarizerModel: "gpt-5",
	}, runtime)

	if !cfg.Enabled {
		t.Fatal("expected base memory config to stay enabled")
	}
	if !cfg.DisableProjectMemory {
		t.Fatal("expected project memory to be disabled for remote host policy")
	}
	if !cfg.DisablePersona {
		t.Fatal("expected persona to be disabled for remote host policy")
	}
}

func TestBuildMemorySummarizerConfigPreservesLocalDefaults(t *testing.T) {
	runtime := cliruntime.New(&config.Config{
		ConfigPath: filepath.Join(t.TempDir(), "credential.yaml"),
		API:        config.APIConfig{Token: "jwt-token"},
	})

	cfg := buildMemorySummarizerConfig(RunConfig{MemorySummarizer: true}, runtime)

	if cfg.DisableProjectMemory {
		t.Fatal("expected local project memory to remain enabled")
	}
	if cfg.DisablePersona {
		t.Fatal("expected local persona to remain enabled")
	}
}
