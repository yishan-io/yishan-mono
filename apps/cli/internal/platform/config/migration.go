package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

// MigrateSettings loads user preferences from settings.yaml, folding legacy
// values in once, then removes the legacy context.yaml.
//
// History: default_org_id was first written to context.yaml by the CLI, then
// to settings.yaml by the daemon, with a one-way context → settings fold on
// every load. context.yaml is now fully retired: settings.yaml is the single
// source, and org.go writes it directly.
func MigrateSettings(settingsPath string, legacyViper *viper.Viper) error {
	v := viper.New()
	v.SetConfigFile(settingsPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		if err := migrateSettingsFromLegacy(settingsPath, legacyViper); err != nil {
			return err
		}
		// Best-effort: if the legacy file cannot be removed the fold simply
		// re-runs next load, which is idempotent.
		_ = removeLegacyContextFile(settingsPath)
		return nil
	}

	if v.GetString(KeyDefaultOrgID) == "" {
		if orgID := readLegacyContextOrgID(settingsPath); orgID != "" {
			if err := UpdateFile(settingsPath, func(cfg *viper.Viper) {
				cfg.Set(KeyDefaultOrgID, orgID)
			}); err != nil {
				return err
			}
		}
	}
	_ = removeLegacyContextFile(settingsPath)
	return nil
}

// readLegacyContextOrgID returns the default org from the legacy context.yaml
// next to settingsPath, or "" when the file is absent or carries no value.
// Both the modern default_org_id key and the original current_org_id key are
// understood so profiles that never ran the in-file migration still fold.
func readLegacyContextOrgID(settingsPath string) string {
	raw, err := os.ReadFile(ContextFilePath(filepath.Dir(settingsPath)))
	if err != nil {
		return ""
	}
	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return ""
	}
	if value, ok := doc[KeyDefaultOrgID].(string); ok && value != "" {
		return value
	}
	if value, ok := doc[KeyCurrentOrgID].(string); ok && value != "" {
		return value
	}
	return ""
}

func removeLegacyContextFile(settingsPath string) error {
	path := ContextFilePath(filepath.Dir(settingsPath))
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove legacy context file %q: %w", path, err)
	}
	return nil
}

func migrateSettingsFromLegacy(settingsPath string, legacyViper *viper.Viper) error {
	cfg := SettingsConfig{}

	if legacyViper != nil {
		cfg.DefaultOrgID = legacyViper.GetString(KeyCurrentOrgID)
		cfg.Memory.SummarizerEnabled = legacyViper.GetBool(KeyMemorySummarizerEnabled)
		cfg.Memory.SummarizerAgentKind = legacyViper.GetString(KeyMemorySummarizerAgentKind)
		cfg.Memory.SummarizerModel = legacyViper.GetString(KeyMemorySummarizerModel)
	}
	cfg.ComputerUse = defaultComputerUseConfig()

	if cfg.DefaultOrgID == "" {
		cfg.DefaultOrgID = readLegacyContextOrgID(settingsPath)
	}

	return UpdateFile(settingsPath, func(v *viper.Viper) {
		if cfg.DefaultOrgID != "" {
			v.Set(KeyDefaultOrgID, cfg.DefaultOrgID)
		}
		v.Set("memory.summarizer.enabled", cfg.Memory.SummarizerEnabled)
		v.Set("memory.summarizer.agent_kind", cfg.Memory.SummarizerAgentKind)
		v.Set("memory.summarizer.model", cfg.Memory.SummarizerModel)
		writeComputerUseConfig(v, cfg.ComputerUse)
	})
}
