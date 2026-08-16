package daemon

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/platform/config"
)

// accountDataItemNames are the env-root entries that move under
// accounts/<userId>/ on the first boot that knows the user_id. memory.db is
// included (in addition to the memory/ directory) so the pre-directory layout
// migrates too; initMemoryService then folds it into memory/memory.db. The
// pending-cleanups JSON is imported into SQLite by the cleanup store after
// migration, so it must move with the other data. context.yaml is a retired
// legacy file that the settings migration folds+deletes once it sits next to
// the account settings file, so moving it closes the last fold gap.
var accountDataItemNames = []string{
	"yishan.db",
	"memory",
	"settings.yaml",
	"memory.db",
	"pending-workspace-cleanups.json",
	"context.yaml",
}

// ensureUserIDForAccountResolution backfills a missing user_id in
// credential.yaml from WhoAmI when tokens are present (service tokens and
// env-var credentials carry no cached user_id), and revalidates a user_id
// that was backfilled from env-var credentials: env tokens are never
// persisted to the file, so a stale user_id from a previous env account would
// otherwise pin the current env account to the wrong data dir. Errors are
// swallowed so boot proceeds with the env-root fallback; the backfill is
// retried on the next boot.
func ensureUserIDForAccountResolution(runtime *session.Session, configPath string) {
	if runtime == nil || !runtime.APIConfigured() {
		return
	}
	// A known user_id is authoritative only when the credential file itself
	// holds tokens (normal login). With no stored tokens the account came from
	// env-var credentials, which must be revalidated against the live token.
	if config.ReadUserIDFromConfig(configPath) != "" && hasStoredFileTokens(configPath) {
		return
	}
	resolveAndPersistUserID(runtime, configPath)
}

func resolveAndPersistUserID(runtime *session.Session, configPath string) {
	me, err := runtime.APIClient().WhoAmI()
	if err != nil {
		log.Warn().Err(err).Msg("could not resolve user id for account data dir; falling back to profile root")
		return
	}
	if me.User.ID == "" {
		return
	}

	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, me.User.ID)
	}); err != nil {
		log.Warn().Err(err).Msg("could not persist resolved user id; falling back to profile root")
		return
	}
	log.Info().Str("userId", me.User.ID).Msg("backfilled user_id for account data resolution")
}

// hasStoredFileTokens reports whether credential.yaml itself (not the
// environment) holds auth tokens. Env-var credentials never touch the file, so
// a user_id with no stored tokens must be revalidated on every boot.
func hasStoredFileTokens(configPath string) bool {
	if strings.TrimSpace(configPath) == "" {
		return false
	}
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		return false
	}
	return strings.TrimSpace(v.GetString(config.KeyAPIToken)) != "" ||
		strings.TrimSpace(v.GetString(config.KeyAPIRefreshToken)) != ""
}

// migrateAccountLayout moves legacy env-root account data (yishan.db,
// memory/, settings.yaml, memory.db) into the per-account data directory on
// the first boot with a known user_id. It is per-item idempotent: each item
// is renamed once, re-runs are no-ops, and an account dir pre-created by an
// earlier config load (which eagerly writes a default settings.yaml) does not
// block the remaining items.
func migrateAccountLayout(envDir string, accountDir string) error {
	if accountDir == "" || accountDir == envDir {
		return nil
	}
	if !anyAccountDataItemExists(envDir) {
		return nil
	}
	if err := os.MkdirAll(accountDir, 0o755); err != nil {
		return fmt.Errorf("create account data directory: %w", err)
	}

	for _, name := range accountDataItemNames {
		src := filepath.Join(envDir, name)
		if _, err := os.Stat(src); err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				log.Warn().Err(err).Str("from", src).Msg("failed to stat account data item during migration")
			}
			continue
		}
		dst := filepath.Join(accountDir, name)
		if err := os.Rename(src, dst); err != nil {
			log.Warn().Err(err).Str("from", src).Str("to", dst).Msg("failed to migrate account data item")
			continue
		}
		log.Info().Str("from", src).Str("to", dst).Msg("migrated account data item")
	}
	return nil
}

func anyAccountDataItemExists(envDir string) bool {
	for _, name := range accountDataItemNames {
		if _, err := os.Stat(filepath.Join(envDir, name)); err == nil {
			return true
		}
	}
	return false
}
