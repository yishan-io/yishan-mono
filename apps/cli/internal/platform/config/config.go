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
	DirName          = ".yishan"
	PiAgentDirEnvKey = "PI_CODING_AGENT_DIR"

	DefaultDSHProvider = "deepseek-official"
	DefaultDSHModel    = "deepseek-v4-flash"

	// AccountDirName is the per-account layer under a profile (env sandbox).
	// profiles/<env>/accounts/<userId>/ holds the account-scoped data files.
	AccountDirName = "accounts"

	// KeyUserID records the active account in credential.yaml. It is the
	// account pointer used to resolve the per-account data directory; it is
	// informational here (not reloaded by ReloadAuthConfig) because path
	// resolution reads the credential file directly.
	KeyUserID = "user_id"

	KeyAPIBaseURL               = "api_base_url"
	KeyAPIToken                 = "api_token"
	KeyAPIRefreshToken          = "api_refresh_token"
	KeyAPIAccessTokenExpiresAt  = "api_access_token_expires_at"
	KeyAPIRefreshTokenExpiresAt = "api_refresh_token_expires_at"

	// KeyCurrentOrgID is kept for migration reads from legacy credential.yaml.
	// New writes go to settings.yaml via KeyDefaultOrgID.
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

// DSHDataDir returns the account-scoped root for DSH durable session data.
func DSHDataDir(accountDataDir string) string { return filepath.Join(accountDataDir, "dsh") }

type APIConfig struct {
	BaseURL               string
	Token                 string
	RefreshToken          string
	AccessTokenExpiresAt  string
	RefreshTokenExpiresAt string
}

type DaemonConfig struct {
	Host             string
	Port             int
	RelayEnabled     bool
	RelayURL         string
	RelayToken       string // static JWT for local dev; bypasses API token minting
	DSHEnabled       bool
	DSHDeveloperMode bool
	DSHNodePath      string
	DSHRuntimePath   string
	DSHProvider      string
	DSHModel         string
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
	SettingsPath string
	DefaultOrgID string
	// UserID mirrors the active account recorded in credential.yaml. It is
	// informational: account data dir resolution reads the file directly, so
	// ReloadAuthConfig intentionally does not refresh it.
	UserID      string
	API         APIConfig
	Daemon      DaemonConfig
	Memory      MemoryConfig
	ComputerUse ComputerUseConfig
}

func ResolveConfigPath(v *viper.Viper, explicitConfigPath string) (string, error) {
	return resolveConfigPath(v, explicitConfigPath)
}

func Load(v *viper.Viper, explicitConfigPath string) (Config, error) {
	configPath, err := resolveConfigPath(v, explicitConfigPath)
	if err != nil {
		return Config{}, err
	}

	// Settings move with the account: once credential.yaml records a user_id,
	// user preferences are read from profiles/<env>/accounts/<userId>/ instead
	// of the env root. profileDir stays the env root for env-scoped paths.
	accountDataDir, err := ResolveAccountDataDir(configPath)
	if err != nil {
		return Config{}, err
	}
	settingsPath := SettingsFilePath(accountDataDir)

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
		SettingsPath: settingsPath,
		DefaultOrgID: settingsCfg.DefaultOrgID,
		UserID:       v.GetString(KeyUserID),
		API: APIConfig{
			BaseURL:               v.GetString(KeyAPIBaseURL),
			Token:                 v.GetString(KeyAPIToken),
			RefreshToken:          v.GetString(KeyAPIRefreshToken),
			AccessTokenExpiresAt:  v.GetString(KeyAPIAccessTokenExpiresAt),
			RefreshTokenExpiresAt: v.GetString(KeyAPIRefreshTokenExpiresAt),
		},
		Daemon: DaemonConfig{
			Host:             v.GetString("daemon_host"),
			Port:             v.GetInt("daemon_port"),
			RelayEnabled:     v.GetBool("daemon_relay_enabled"),
			RelayURL:         v.GetString("daemon_relay_url"),
			RelayToken:       v.GetString("daemon_relay_token"),
			DSHEnabled:       v.GetBool("daemon_dsh_enabled"),
			DSHDeveloperMode: v.GetBool("daemon_dsh_developer_mode"),
			DSHNodePath:      v.GetString("daemon_dsh_node_path"),
			DSHRuntimePath:   v.GetString("daemon_dsh_runtime_path"),
			DSHProvider:      readStringWithDefault(v, "daemon_dsh_provider", DefaultDSHProvider),
			DSHModel:         readStringWithDefault(v, "daemon_dsh_model", DefaultDSHModel),
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

// ResolveAccountDataDir returns the per-account data directory for the given
// credential file path: profiles/<env>/accounts/<userId>/. When user_id is
// unknown (first login, env-var credentials) or the credential file is missing
// or unreadable, it falls back to the profile (env root) directory — the
// legacy shared layout. It never returns an error; callers treat the returned
// dir as authoritative.
func ResolveAccountDataDir(configPath string) (string, error) {
	userID := ReadUserIDFromConfig(configPath)
	if !IsSafeAccountUserID(userID) {
		return filepath.Dir(configPath), nil
	}
	return filepath.Join(filepath.Dir(configPath), AccountDirName, userID), nil
}

// IsSafeAccountUserID reports whether userID can be used as one account-directory path segment.
func IsSafeAccountUserID(userID string) bool {
	return userID != "" &&
		userID != "." &&
		userID != ".." &&
		!strings.ContainsAny(userID, "/\\\x00\r\n")
}

// ReadUserIDFromConfig returns the user_id recorded in the credential file at
// configPath, or "" when it is absent or the file cannot be read.
func ReadUserIDFromConfig(configPath string) string {
	if strings.TrimSpace(configPath) == "" {
		return ""
	}
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		return ""
	}
	return strings.TrimSpace(v.GetString(KeyUserID))
}

func readStringWithDefault(v *viper.Viper, key string, defaultValue string) string {
	if value := strings.TrimSpace(v.GetString(key)); value != "" {
		return value
	}
	return defaultValue
}
