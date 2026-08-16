package daemon

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/platform/config"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"

	"github.com/spf13/viper"
)

func seedLegacyEnvRootData(t *testing.T, envDir string) {
	t.Helper()
	if err := config.UpdateFile(filepath.Join(envDir, "settings.yaml"), func(cfg *viper.Viper) {
		cfg.Set(config.KeyDefaultOrgID, "org-legacy")
	}); err != nil {
		t.Fatalf("seed settings.yaml: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(envDir, "memory"), 0o755); err != nil {
		t.Fatalf("create memory dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(envDir, "memory", "memory.db"), []byte("mem-db"), 0o600); err != nil {
		t.Fatalf("seed memory db: %v", err)
	}
	if err := os.WriteFile(filepath.Join(envDir, "pending-workspace-cleanups.json"), []byte(`{"items":[]}`), 0o600); err != nil {
		t.Fatalf("seed pending cleanups: %v", err)
	}
	database, err := localdb.Open(envDir)
	if err != nil {
		t.Fatalf("seed yishan.db: %v", err)
	}
	defer database.Close()
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate seeded db: %v", err)
	}
}

func TestMigrateAccountLayout_MovesLegacyEnvRootData(t *testing.T) {
	envDir := t.TempDir()
	seedLegacyEnvRootData(t, envDir)
	accountDir := filepath.Join(envDir, config.AccountDirName, "user_123")

	if err := migrateAccountLayout(envDir, accountDir); err != nil {
		t.Fatalf("migrateAccountLayout: %v", err)
	}

	for _, name := range []string{"yishan.db", "memory", "settings.yaml", "pending-workspace-cleanups.json"} {
		if _, err := os.Stat(filepath.Join(envDir, name)); !os.IsNotExist(err) {
			t.Fatalf("expected %q moved out of env root, stat err=%v", name, err)
		}
		if _, err := os.Stat(filepath.Join(accountDir, name)); err != nil {
			t.Fatalf("expected %q in account dir: %v", name, err)
		}
	}
}

func TestMigrateAccountLayout_IsIdempotent(t *testing.T) {
	envDir := t.TempDir()
	seedLegacyEnvRootData(t, envDir)
	accountDir := filepath.Join(envDir, config.AccountDirName, "user_123")

	if err := migrateAccountLayout(envDir, accountDir); err != nil {
		t.Fatalf("first migrate: %v", err)
	}
	// Second boot must be a no-op (nothing left at env root, account dir intact).
	if err := migrateAccountLayout(envDir, accountDir); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	if _, err := os.Stat(filepath.Join(accountDir, "yishan.db")); err != nil {
		t.Fatalf("expected account yishan.db to survive second migrate: %v", err)
	}
}

func TestMigrateAccountLayout_NoopWhenAccountDirIsEnvDir(t *testing.T) {
	envDir := t.TempDir()
	seedLegacyEnvRootData(t, envDir)

	if err := migrateAccountLayout(envDir, envDir); err != nil {
		t.Fatalf("migrateAccountLayout with equal dirs: %v", err)
	}
	if _, err := os.Stat(filepath.Join(envDir, "yishan.db")); err != nil {
		t.Fatalf("expected env-root yishan.db untouched: %v", err)
	}
}

func TestMigrateAccountLayout_MovesLegacyMemoryDBFile(t *testing.T) {
	envDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(envDir, "memory.db"), []byte("old-mem"), 0o600); err != nil {
		t.Fatalf("seed legacy memory.db: %v", err)
	}
	accountDir := filepath.Join(envDir, config.AccountDirName, "user_123")

	if err := migrateAccountLayout(envDir, accountDir); err != nil {
		t.Fatalf("migrateAccountLayout: %v", err)
	}
	if _, err := os.Stat(filepath.Join(envDir, "memory.db")); !os.IsNotExist(err) {
		t.Fatal("expected legacy memory.db moved out of env root")
	}
	if _, err := os.Stat(filepath.Join(accountDir, "memory.db")); err != nil {
		t.Fatalf("expected legacy memory.db in account dir: %v", err)
	}
}

func TestMigrateAccountLayout_PrecreatedAccountDirStillMovesRemainingItems(t *testing.T) {
	envDir := t.TempDir()
	seedLegacyEnvRootData(t, envDir)
	accountDir := filepath.Join(envDir, config.AccountDirName, "user_123")

	// Simulate config.Load having eagerly created a default settings.yaml in
	// the account dir before the daemon boots (the pre-migration timing note).
	if err := config.UpdateFile(filepath.Join(accountDir, "settings.yaml"), func(cfg *viper.Viper) {
		cfg.Set(config.KeyDefaultOrgID, "org-default")
	}); err != nil {
		t.Fatalf("pre-create account settings: %v", err)
	}

	if err := migrateAccountLayout(envDir, accountDir); err != nil {
		t.Fatalf("migrateAccountLayout: %v", err)
	}

	// The real (legacy) settings.yaml replaces the eager default, and the db
	// and memory dir still migrate despite the pre-created account dir.
	for _, name := range []string{"yishan.db", "memory", "settings.yaml"} {
		if _, err := os.Stat(filepath.Join(accountDir, name)); err != nil {
			t.Fatalf("expected %q in account dir after migration: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(envDir, "yishan.db")); !os.IsNotExist(err) {
		t.Fatal("expected env-root yishan.db moved")
	}

	// The legacy settings content wins over the eager default written by an
	// earlier config.Load.
	settingsRaw, err := os.ReadFile(filepath.Join(accountDir, "settings.yaml"))
	if err != nil {
		t.Fatalf("read migrated settings.yaml: %v", err)
	}
	if !strings.Contains(string(settingsRaw), "org-legacy") {
		t.Fatalf("expected migrated settings.yaml to carry the legacy default org, got:\n%s", settingsRaw)
	}
	if strings.Contains(string(settingsRaw), "org-default") {
		t.Fatalf("expected eager default settings.yaml to be replaced, got:\n%s", settingsRaw)
	}
}

func TestInitLocalDatabase_MigratesAndOpensAccountDB(t *testing.T) {
	envDir := t.TempDir()
	seedLegacyEnvRootData(t, envDir)
	accountDir := filepath.Join(envDir, config.AccountDirName, "user_123")

	database, err := initLocalDatabase(envDir, accountDir)
	if err != nil {
		t.Fatalf("initLocalDatabase: %v", err)
	}
	defer database.Close()

	if _, err := os.Stat(filepath.Join(accountDir, "yishan.db")); err != nil {
		t.Fatalf("expected account-scoped database: %v", err)
	}
	if _, err := os.Stat(filepath.Join(envDir, "yishan.db")); !os.IsNotExist(err) {
		t.Fatal("expected env-root yishan.db moved away")
	}

	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations`).Scan(&count); err != nil {
		t.Fatalf("query account db: %v", err)
	}
	if count == 0 {
		t.Fatal("expected migrated account db to have applied migrations")
	}
}

func TestEnsureUserIDForAccountResolution_BackfillsFromWhoAmI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/me" {
			t.Fatalf("path = %q, want /me", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":{"id":"user_from_whoami","email":"a@example.com","name":"A"}}`))
	}))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIToken, "some-token")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "some-token",
		},
	})

	ensureUserIDForAccountResolution(runtime, configPath)

	if got := config.ReadUserIDFromConfig(configPath); got != "user_from_whoami" {
		t.Fatalf("user_id = %q, want %q", got, "user_from_whoami")
	}
}

func TestEnsureUserIDForAccountResolution_SwallowsWhoAmIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIToken, "some-token")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "some-token",
		},
	})

	// Must not error — boot proceeds with the env-root fallback.
	ensureUserIDForAccountResolution(runtime, configPath)

	if got := config.ReadUserIDFromConfig(configPath); got != "" {
		t.Fatalf("user_id = %q, want empty after failed backfill", got)
	}
}

func TestEnsureUserIDForAccountResolution_SkipsWhenUserIDPresent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("WhoAmI should not be called when user_id is already known with stored tokens")
	}))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIToken, "some-token")
		cfg.Set(config.KeyUserID, "user_known")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "some-token",
		},
	})

	ensureUserIDForAccountResolution(runtime, configPath)

	if got := config.ReadUserIDFromConfig(configPath); got != "user_known" {
		t.Fatalf("user_id = %q, want %q", got, "user_known")
	}
}

func TestEnsureUserIDForAccountResolution_RevalidatesEnvCredentialUserID(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/me" {
			t.Fatalf("path = %q, want /me", r.URL.Path)
		}
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":{"id":"user_from_whoami_v2","email":"b@example.com","name":"B"}}`))
	}))
	defer server.Close()

	// A user_id backfilled from a previous env credential: the file holds no
	// tokens, so the daemon must revalidate against the live env token instead
	// of pinning the previous env account's data dir.
	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "user_old_env_account")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "env-token-b",
		},
	})

	ensureUserIDForAccountResolution(runtime, configPath)

	if got := config.ReadUserIDFromConfig(configPath); got != "user_from_whoami_v2" {
		t.Fatalf("user_id = %q, want revalidated %q", got, "user_from_whoami_v2")
	}
	if authHeader != "Bearer env-token-b" {
		t.Fatalf("WhoAmI auth = %q, want the live env token", authHeader)
	}
}

func TestEnsureUserIDForAccountResolution_KeepsStaleUserIDWhenRevalidationFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "user_old_env_account")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "env-token-b",
		},
	})

	ensureUserIDForAccountResolution(runtime, configPath)

	// Boot proceeds with the previous user_id (env-root fallback semantics);
	// the revalidation is retried on the next boot.
	if got := config.ReadUserIDFromConfig(configPath); got != "user_old_env_account" {
		t.Fatalf("user_id = %q, want stale value preserved on failure", got)
	}
}
