package daemon

import (
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/memory"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

func TestInitLocalDatabase_CreatesMigratedProfileDatabase(t *testing.T) {
	profileDir := t.TempDir()
	database, err := initLocalDatabase(profileDir, profileDir)
	if err != nil {
		t.Fatalf("initialize local database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	var projectsTableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).Scan(&projectsTableName); err != nil {
		t.Fatalf("find projects table: %v", err)
	}
	if projectsTableName != "projects" {
		t.Fatalf("expected projects table, got %q", projectsTableName)
	}
	if _, err := os.Stat(filepath.Join(profileDir, "yishan.db")); err != nil {
		t.Fatalf("expected profile database: %v", err)
	}
}

func TestInitMemoryService_MigratesOldDB(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(oldPath)
	if err != nil {
		t.Fatalf("OpenDB oldPath: %v", err)
	}
	db.Close()

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, root, cfg, nil); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to be moved away")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemoryService_NewPathOnly(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, root, cfg, nil); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to not exist")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemoryService_BothExistKeepsOld(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(newPath)
	if err != nil {
		t.Fatalf("OpenDB newPath: %v", err)
	}
	db.Close()

	if err := os.WriteFile(oldPath, []byte("old-db"), 0o600); err != nil {
		t.Fatalf("WriteFile oldPath: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, root, cfg, nil); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	data, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatalf("expected old memory.db to still exist: %v", err)
	}
	if string(data) != "old-db" {
		t.Fatalf("expected old db unchanged, got %q", string(data))
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
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
