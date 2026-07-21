package config

import (
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

func MigrateContext(contextPath string) error {
	v := viper.New()
	v.SetConfigFile(contextPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	defaultOrgID := v.GetString(KeyDefaultOrgID)
	if defaultOrgID == "" {
		if legacy := v.GetString(KeyCurrentOrgID); legacy != "" {
			if writeErr := UpdateFile(contextPath, func(cfg *viper.Viper) {
				cfg.Set(KeyDefaultOrgID, legacy)
			}); writeErr == nil {
				_ = DeleteKeys(contextPath, KeyCurrentOrgID)
			}
		}
	} else {
		_ = DeleteKeys(contextPath, KeyCurrentOrgID)
	}

	return nil
}

func MigrateSettings(settingsPath string, legacyViper *viper.Viper) error {
	contextPath := ContextFilePath(filepath.Dir(settingsPath))
	if err := MigrateContext(contextPath); err != nil {
		return err
	}

	v := viper.New()
	v.SetConfigFile(settingsPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		return migrateSettingsFromLegacy(settingsPath, legacyViper)
	}

	if v.GetString(KeyDefaultOrgID) != "" {
		return nil
	}

	ctxCfg, err := LoadContext(contextPath)
	if err != nil {
		return err
	}
	if ctxCfg.DefaultOrgID == "" {
		return nil
	}

	return UpdateFile(settingsPath, func(cfg *viper.Viper) {
		cfg.Set(KeyDefaultOrgID, ctxCfg.DefaultOrgID)
	})
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
		contextPath := ContextFilePath(filepath.Dir(settingsPath))
		if ctxCfg, err := LoadContext(contextPath); err == nil && ctxCfg.DefaultOrgID != "" {
			cfg.DefaultOrgID = ctxCfg.DefaultOrgID
		}
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
