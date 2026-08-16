package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

func UpdateFile(configPath string, update func(cfg *viper.Viper)) error {
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return fmt.Errorf("create config directory for %q: %w", configPath, err)
	}

	cfg := viper.New()
	cfg.SetConfigFile(configPath)
	cfg.SetConfigType("yaml")
	if _, err := os.Stat(configPath); err == nil {
		if err := cfg.ReadInConfig(); err != nil {
			return fmt.Errorf("read existing config file %q: %w", configPath, err)
		}
	}

	update(cfg)

	if _, err := os.Stat(configPath); err == nil {
		if err := cfg.WriteConfigAs(configPath); err != nil {
			return fmt.Errorf("write config file %q: %w", configPath, err)
		}
		return nil
	}

	if err := cfg.SafeWriteConfigAs(configPath); err != nil {
		return fmt.Errorf("create config file %q: %w", configPath, err)
	}

	return nil
}

// DeleteKeys removes the given keys from a YAML config file entirely.
// Missing file or missing keys are silently ignored.
func DeleteKeys(configPath string, keys ...string) error {
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil
	}

	raw, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read config file %q: %w", configPath, err)
	}

	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return fmt.Errorf("parse config file %q: %w", configPath, err)
	}
	if doc == nil {
		return nil
	}

	changed := false
	for _, key := range keys {
		if _, exists := doc[key]; exists {
			delete(doc, key)
			changed = true
		}
	}
	if !changed {
		return nil
	}

	out, err := yaml.Marshal(doc)
	if err != nil {
		return fmt.Errorf("encode config file %q: %w", configPath, err)
	}

	if err := os.WriteFile(configPath, out, 0o600); err != nil {
		return fmt.Errorf("write config file %q: %w", configPath, err)
	}

	return nil
}
