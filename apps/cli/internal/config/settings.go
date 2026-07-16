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
	if err := MigrateSettings(settingsPath, legacyViper); err != nil {
		return SettingsConfig{}, err
	}

	v := viper.New()
	v.SetConfigFile(settingsPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return SettingsConfig{}, nil
		}
		return SettingsConfig{}, err
	}

	return SettingsConfig{
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
	}, nil
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
