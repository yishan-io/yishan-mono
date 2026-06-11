package config

import (
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

const contextFileName = "context.yaml"

// KeyDefaultOrgID is the YAML key for the CLI default org in context.yaml.
const KeyDefaultOrgID = "default_org_id"

// ContextConfig holds workspace context that is persisted separately from
// auth credentials. It lives in context.yaml alongside credential.yaml.
type ContextConfig struct {
	DefaultOrgID string
}

// ContextFilePath returns the path to context.yaml given the profile
// directory (the directory that also contains credential.yaml).
func ContextFilePath(profileDir string) string {
	return filepath.Join(profileDir, contextFileName)
}

// LoadContext reads default_org_id from context.yaml.
// A missing file or missing key returns a zero-value ContextConfig, not an error.
// If default_org_id is absent but the legacy current_org_id key exists (written
// by a prior version), it is migrated in place automatically.
func LoadContext(contextPath string) (ContextConfig, error) {
	v := viper.New()
	v.SetConfigFile(contextPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return ContextConfig{}, nil
		}
		return ContextConfig{}, err
	}

	defaultOrgID := v.GetString(KeyDefaultOrgID)
	if defaultOrgID == "" {
		// Migration: prior version wrote current_org_id into context.yaml.
		if legacy := v.GetString("current_org_id"); legacy != "" {
			defaultOrgID = legacy
			// Write the new key and remove the old one atomically via two steps:
			// first write default_org_id, then delete current_org_id.
			if writeErr := UpdateFile(contextPath, func(cfg *viper.Viper) {
				cfg.Set(KeyDefaultOrgID, legacy)
			}); writeErr == nil {
				_ = DeleteKeys(contextPath, "current_org_id")
			}
		}
	} else {
		// Already migrated — clean up any leftover current_org_id key.
		_ = DeleteKeys(contextPath, "current_org_id")
	}

	return ContextConfig{
		DefaultOrgID: defaultOrgID,
	}, nil
}

// UpdateContext writes fields into context.yaml, creating the file when it
// does not yet exist. Uses the shared UpdateFile helper.
func UpdateContext(contextPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(contextPath, update)
}
