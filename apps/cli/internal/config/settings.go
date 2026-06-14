package config

import (
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

const settingsFileName = "settings.yaml"

func SettingsFilePath(profileDir string) string {
	return filepath.Join(profileDir, settingsFileName)
}

func LoadSettings(settingsPath string, legacyViper *viper.Viper) (SettingsConfig, error) {
	v := viper.New()
	v.SetConfigFile(settingsPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return migrateFromLegacy(settingsPath, legacyViper)
		}
		return SettingsConfig{}, err
	}

	cfg := SettingsConfig{
		DefaultOrgID: v.GetString(KeyDefaultOrgID),
		Memory: MemoryConfig{
			SummarizerEnabled:   v.GetBool("memory.summarizer.enabled"),
			SummarizerAgentKind: v.GetString("memory.summarizer.agent_kind"),
			SummarizerModel:     v.GetString("memory.summarizer.model"),
		},
	}

	if cfg.DefaultOrgID == "" {
		contextPath := ContextFilePath(filepath.Dir(settingsPath))
		ctxCfg, err := LoadContext(contextPath)
		if err != nil {
			return SettingsConfig{}, err
		}
		if ctxCfg.DefaultOrgID != "" {
			cfg.DefaultOrgID = ctxCfg.DefaultOrgID
			if err := UpdateFile(settingsPath, func(v *viper.Viper) {
				v.Set(KeyDefaultOrgID, cfg.DefaultOrgID)
			}); err != nil {
				return SettingsConfig{}, err
			}
		}
	}

	return cfg, nil
}

// migrateFromLegacy reads values from credential.yaml (and context.yaml for
// default_org_id) and writes them to settings.yaml. This ensures a clean
// transition without losing existing configuration.
func migrateFromLegacy(settingsPath string, legacyViper *viper.Viper) (SettingsConfig, error) {
	cfg := SettingsConfig{}

	if legacyViper != nil {
		cfg.DefaultOrgID = legacyViper.GetString(KeyCurrentOrgID)
		cfg.Memory.SummarizerEnabled = legacyViper.GetBool(KeyMemorySummarizerEnabled)
		cfg.Memory.SummarizerAgentKind = legacyViper.GetString(KeyMemorySummarizerAgentKind)
		cfg.Memory.SummarizerModel = legacyViper.GetString(KeyMemorySummarizerModel)
	}

	// Also try loading from context.yaml (legacy default_org_id).
	if cfg.DefaultOrgID == "" {
		contextPath := ContextFilePath(filepath.Dir(settingsPath))
		if ctxCfg, err := LoadContext(contextPath); err == nil && ctxCfg.DefaultOrgID != "" {
			cfg.DefaultOrgID = ctxCfg.DefaultOrgID
		}
	}

	if err := UpdateFile(settingsPath, func(v *viper.Viper) {
		if cfg.DefaultOrgID != "" {
			v.Set(KeyDefaultOrgID, cfg.DefaultOrgID)
		}
		v.Set("memory.summarizer.enabled", cfg.Memory.SummarizerEnabled)
		v.Set("memory.summarizer.agent_kind", cfg.Memory.SummarizerAgentKind)
		v.Set("memory.summarizer.model", cfg.Memory.SummarizerModel)
	}); err != nil {
		return cfg, err
	}

	return cfg, nil
}

func UpdateSettings(settingsPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(settingsPath, update)
}
