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
		ComputerUse: ComputerUseConfig{
			Enabled:            readBoolWithDefault(v, "computer_use.enabled", true),
			Observe:            readBoolWithDefault(v, "computer_use.observe", true),
			Capture:            readBoolWithDefault(v, "computer_use.capture", true),
			Inspect:            readBoolWithDefault(v, "computer_use.inspect", true),
			Actions:            readBoolWithDefault(v, "computer_use.actions", true),
			Mouse:              readBoolWithDefault(v, "computer_use.mouse", true),
			Keyboard:           readBoolWithDefault(v, "computer_use.keyboard", true),
			ClipboardRead:      readBoolWithDefault(v, "computer_use.clipboard_read", true),
			ClipboardWrite:     readBoolWithDefault(v, "computer_use.clipboard_write", true),
			ApplicationControl: readBoolWithDefault(v, "computer_use.application_control", true),
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
	cfg.ComputerUse = defaultComputerUseConfig()

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
		writeComputerUseConfig(v, cfg.ComputerUse)
	}); err != nil {
		return cfg, err
	}

	return cfg, nil
}

func UpdateSettings(settingsPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(settingsPath, update)
}

func defaultComputerUseConfig() ComputerUseConfig {
	return ComputerUseConfig{
		Enabled:            true,
		Observe:            true,
		Capture:            true,
		Inspect:            true,
		Actions:            true,
		Mouse:              true,
		Keyboard:           true,
		ClipboardRead:      true,
		ClipboardWrite:     true,
		ApplicationControl: true,
	}
}

func writeComputerUseConfig(v *viper.Viper, cfg ComputerUseConfig) {
	v.Set("computer_use.enabled", cfg.Enabled)
	v.Set("computer_use.observe", cfg.Observe)
	v.Set("computer_use.capture", cfg.Capture)
	v.Set("computer_use.inspect", cfg.Inspect)
	v.Set("computer_use.actions", cfg.Actions)
	v.Set("computer_use.mouse", cfg.Mouse)
	v.Set("computer_use.keyboard", cfg.Keyboard)
	v.Set("computer_use.clipboard_read", cfg.ClipboardRead)
	v.Set("computer_use.clipboard_write", cfg.ClipboardWrite)
	v.Set("computer_use.application_control", cfg.ApplicationControl)
}

func readBoolWithDefault(v *viper.Viper, key string, defaultValue bool) bool {
	if !v.IsSet(key) {
		return defaultValue
	}
	return v.GetBool(key)
}
