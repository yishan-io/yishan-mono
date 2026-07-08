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
	PiAgentDirEnvKey            = "PI_CODING_AGENT_DIR"
	KeyAPIBaseURL               = "api_base_url"
	KeyAPIToken                 = "api_token"
	KeyAPIRefreshToken          = "api_refresh_token"
	KeyAPIAccessTokenExpiresAt  = "api_access_token_expires_at"
	KeyAPIRefreshTokenExpiresAt = "api_refresh_token_expires_at"

	// KeyCurrentOrgID is kept for migration reads from legacy credential.yaml.
	// New writes go to context.yaml via KeyDefaultOrgID.
	KeyCurrentOrgID = "current_org_id"

	KeyMemorySummarizerEnabled   = "memory.summarizer.enabled"
	KeyMemorySummarizerAgentKind = "memory.summarizer.agent_kind"
	KeyMemorySummarizerModel     = "memory.summarizer.model"
)

func HomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(home, DirName), nil
}

func ManagedPiRootDir() (string, error) {
	yishanHome, err := HomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(yishanHome, "pi"), nil
}

func ManagedPiAgentDir() (string, error) {
	piRootDir, err := ManagedPiRootDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(piRootDir, "agent"), nil
}

func ManagedPiAgentsDir() (string, error) {
	agentDir, err := ManagedPiAgentDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(agentDir, "agents"), nil
}

func ManagedPiSkillsDir() (string, error) {
	agentDir, err := ManagedPiAgentDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(agentDir, "skills"), nil
}

func ManagedPiSessionsDir() (string, error) {
	agentDir, err := ManagedPiAgentDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(agentDir, "sessions"), nil
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
	RelayToken   string // static JWT for local dev; bypasses API token minting
}

type MemoryConfig struct {
	SummarizerEnabled   bool
	SummarizerAgentKind string
	SummarizerModel     string
}

type ComputerUseConfig struct {
	Enabled            bool
	Observe            bool
	Capture            bool
	Inspect            bool
	Actions            bool
	Mouse              bool
	Keyboard           bool
	ClipboardRead      bool
	ClipboardWrite     bool
	ApplicationControl bool
}

type SettingsConfig struct {
	DefaultOrgID string
	Memory       MemoryConfig
	ComputerUse  ComputerUseConfig
}

type Config struct {
	LogLevel     string
	LogFormat    string
	ConfigPath   string
	ContextPath  string
	DefaultOrgID string
	API          APIConfig
	Daemon       DaemonConfig
	Memory       MemoryConfig
	ComputerUse  ComputerUseConfig
}

func ResolveConfigPath(v *viper.Viper, explicitConfigPath string) (string, error) {
	return resolveConfigPath(v, explicitConfigPath)
}

func Load(v *viper.Viper, explicitConfigPath string) (Config, error) {
	configPath, err := resolveConfigPath(v, explicitConfigPath)
	if err != nil {
		return Config{}, err
	}

	profileDir := filepath.Dir(configPath)
	contextPath := ContextFilePath(profileDir)
	settingsPath := SettingsFilePath(profileDir)

	// Load user preferences from settings.yaml (handles migration from legacy
	// credential.yaml and context.yaml automatically).
	settingsCfg, err := LoadSettings(settingsPath, v)
	if err != nil {
		return Config{}, fmt.Errorf("load settings file: %w", err)
	}

	// Clean up any leftover current_org_id in credential.yaml (migrated to settings.yaml).
	_ = DeleteKeys(configPath, KeyCurrentOrgID)

	return Config{
		LogLevel:     v.GetString("log_level"),
		LogFormat:    v.GetString("log_format"),
		ConfigPath:   configPath,
		ContextPath:  contextPath,
		DefaultOrgID: settingsCfg.DefaultOrgID,
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
			RelayToken:   v.GetString("daemon_relay_token"),
		},
		Memory:      settingsCfg.Memory,
		ComputerUse: settingsCfg.ComputerUse,
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
