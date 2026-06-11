package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/viper"
)

// Config file keys for API credential storage.
// All credential reads/writes use these constants to prevent key-string drift.
const (
	DirName                     = ".yishan"
	KeyAPIBaseURL               = "api_base_url"
	KeyAPIToken                 = "api_token"
	KeyAPIRefreshToken          = "api_refresh_token"
	KeyAPIAccessTokenExpiresAt  = "api_access_token_expires_at"
	KeyAPIRefreshTokenExpiresAt = "api_refresh_token_expires_at"

	// KeyCurrentOrgID is kept for migration reads from legacy credential.yaml.
	// New writes go to context.yaml via KeyDefaultOrgID.
	KeyCurrentOrgID = "current_org_id"
)

func HomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(home, DirName), nil
}

type APIConfig struct {
	BaseURL               string
	Token                 string
	RefreshToken          string
	AccessTokenExpiresAt  string
	RefreshTokenExpiresAt string
}

type DaemonConfig struct {
	Host         string
	Port         int
	RelayEnabled bool
	RelayURL     string
}

type Config struct {
	LogLevel     string
	LogFormat    string
	ConfigPath   string
	ContextPath  string
	DefaultOrgID string
	API          APIConfig
	Daemon       DaemonConfig
}

func ResolveConfigPath(v *viper.Viper, explicitConfigPath string) (string, error) {
	return resolveConfigPath(v, explicitConfigPath)
}

func Load(v *viper.Viper, explicitConfigPath string) (Config, error) {
	configPath, err := resolveConfigPath(v, explicitConfigPath)
	if err != nil {
		return Config{}, err
	}

	contextPath := ContextFilePath(filepath.Dir(configPath))

	// Load default org from context.yaml. If missing or empty, fall back to
	// credential.yaml for backwards-compatibility and migrate the value.
	contextCfg, err := LoadContext(contextPath)
	if err != nil {
		return Config{}, fmt.Errorf("load context file: %w", err)
	}

	defaultOrgID := contextCfg.DefaultOrgID
	if defaultOrgID == "" {
		// Migration: read from legacy credential.yaml location.
		legacyOrgID := v.GetString(KeyCurrentOrgID)
		if legacyOrgID != "" {
			defaultOrgID = legacyOrgID
			// Persist to the new location so subsequent invocations use context.yaml.
			if migrateErr := UpdateContext(contextPath, func(cfg *viper.Viper) {
				cfg.Set(KeyDefaultOrgID, legacyOrgID)
			}); migrateErr == nil {
				// Clear from credential.yaml to avoid confusion going forward.
				_ = UpdateFile(configPath, func(cfg *viper.Viper) {
					cfg.Set(KeyCurrentOrgID, "")
				})
			}
		}
	}

	return Config{
		LogLevel:     v.GetString("log_level"),
		LogFormat:    v.GetString("log_format"),
		ConfigPath:   configPath,
		ContextPath:  contextPath,
		DefaultOrgID: defaultOrgID,
		API: APIConfig{
			BaseURL:               v.GetString(KeyAPIBaseURL),
			Token:                 v.GetString(KeyAPIToken),
			RefreshToken:          v.GetString(KeyAPIRefreshToken),
			AccessTokenExpiresAt:  v.GetString(KeyAPIAccessTokenExpiresAt),
			RefreshTokenExpiresAt: v.GetString(KeyAPIRefreshTokenExpiresAt),
		},
		Daemon: DaemonConfig{
			Host:         v.GetString("daemon_host"),
			Port:         v.GetInt("daemon_port"),
			RelayEnabled: v.GetBool("daemon_relay_enabled"),
			RelayURL:     v.GetString("daemon_relay_url"),
		},
	}, nil
}

func resolveConfigPath(v *viper.Viper, explicitConfigPath string) (string, error) {
	if used := v.ConfigFileUsed(); used != "" {
		return used, nil
	}
	if explicitConfigPath != "" {
		return explicitConfigPath, nil
	}

	profile, err := resolveProfile(v)
	if err != nil {
		return "", err
	}

	configPath, err := defaultConfigPath(profile)
	if err != nil {
		return "", err
	}

	return configPath, nil
}

var profileNamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func resolveProfile(v *viper.Viper) (string, error) {
	raw := strings.TrimSpace(v.GetString("profile"))
	if raw == "" {
		return "default", nil
	}
	if !profileNamePattern.MatchString(raw) {
		return "", fmt.Errorf("invalid profile %q: use letters, numbers, dash, or underscore", raw)
	}

	return strings.ToLower(raw), nil
}

func defaultConfigPath(profile string) (string, error) {
	yishanHome, err := HomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(yishanHome, "profiles", profile, "credential.yaml"), nil
}

func DefaultConfigPathForProfile(profile string) (string, error) {
	if !profileNamePattern.MatchString(profile) {
		return "", fmt.Errorf("invalid profile %q: use letters, numbers, dash, or underscore", profile)
	}

	return defaultConfigPath(strings.ToLower(profile))
}
