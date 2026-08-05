package config

import "path/filepath"

const contextFileName = "context.yaml"

// KeyDefaultOrgID is the YAML key for the default org in settings.yaml.
const KeyDefaultOrgID = "default_org_id"

// ContextFilePath returns the path to the legacy context.yaml in the profile
// directory. The file was the CLI's write target for default_org_id before
// org state moved into settings.yaml; it is now only read by MigrateSettings
// to fold the old value in, then removed.
func ContextFilePath(profileDir string) string {
	return filepath.Join(profileDir, contextFileName)
}
