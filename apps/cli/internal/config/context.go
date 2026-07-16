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
// Migration from legacy current_org_id is handled by MigrateContext.
func LoadContext(contextPath string) (ContextConfig, error) {
	if err := MigrateContext(contextPath); err != nil {
		return ContextConfig{}, err
	}

	v := viper.New()
	v.SetConfigFile(contextPath)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return ContextConfig{}, nil
		}
		return ContextConfig{}, err
	}

	return ContextConfig{
		DefaultOrgID: v.GetString(KeyDefaultOrgID),
	}, nil
}

// UpdateContext writes fields into context.yaml, creating the file when it
// does not yet exist. Uses the shared UpdateFile helper.
func UpdateContext(contextPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(contextPath, update)
}
