package config

import (
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

const contextFileName = "context.yaml"

// KeyContextOrgID is the YAML key for the current org in context.yaml.
const KeyContextOrgID = "current_org_id"

// ContextConfig holds workspace context that is persisted separately from
// auth credentials. It lives in context.yaml alongside credential.yaml.
type ContextConfig struct {
	CurrentOrgID string
}

// ContextFilePath returns the path to context.yaml given the profile
// directory (the directory that also contains credential.yaml).
func ContextFilePath(profileDir string) string {
	return filepath.Join(profileDir, contextFileName)
}

// LoadContext reads current_org_id from context.yaml.
// A missing file or missing key returns a zero-value ContextConfig, not an error.
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

	return ContextConfig{
		CurrentOrgID: v.GetString(KeyContextOrgID),
	}, nil
}

// UpdateContext writes fields into context.yaml, creating the file when it
// does not yet exist. Uses the shared UpdateFile helper.
func UpdateContext(contextPath string, update func(cfg *viper.Viper)) error {
	return UpdateFile(contextPath, update)
}
