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
	}, nil
}

func UpdateSettings(settingsPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(settingsPath, update)
}
