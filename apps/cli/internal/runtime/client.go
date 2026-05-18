package runtime

import (
	"fmt"
	"sync"
	"time"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"

	"github.com/spf13/viper"
)

var (
	mu     sync.RWMutex
	appCfg *config.Config
)

func Configure(cfg *config.Config) {
	mu.Lock()
	defer mu.Unlock()
	appCfg = cfg
}

func APIClient() *api.Client {
	mu.RLock()
	cfg := appCfg
	mu.RUnlock()
	if cfg == nil {
		return api.NewRuntimeClient(&config.Config{})
	}
	return api.NewRuntimeClient(cfg)
}

func APIConfigured() bool {
	mu.RLock()
	cfg := appCfg
	mu.RUnlock()
	return cfg != nil && cfg.API.BaseURL != "" && cfg.API.Token != ""
}

func APIToken() string {
	mu.RLock()
	defer mu.RUnlock()
	if appCfg == nil {
		return ""
	}
	return appCfg.API.Token
}

func PersistAuthTokens(update api.TokenUpdate) error {
	mu.Lock()
	defer mu.Unlock()

	if appCfg == nil || appCfg.ConfigPath == "" {
		return fmt.Errorf("runtime config is not initialized")
	}

	if shouldRejectStaleTokenUpdate(appCfg, update) {
		return nil
	}

	if err := config.UpdateFile(appCfg.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIBaseURL, appCfg.API.BaseURL)
		cfg.Set(config.KeyAPIToken, update.AccessToken)
		if update.RefreshToken != "" {
			cfg.Set(config.KeyAPIRefreshToken, update.RefreshToken)
		}
		if update.AccessTokenExpiresAt != "" {
			cfg.Set(config.KeyAPIAccessTokenExpiresAt, update.AccessTokenExpiresAt)
		}
		if update.RefreshTokenExpiresAt != "" {
			cfg.Set(config.KeyAPIRefreshTokenExpiresAt, update.RefreshTokenExpiresAt)
		}
	}); err != nil {
		return fmt.Errorf("persist auth tokens: %w", err)
	}

	appCfg.API.Token = update.AccessToken
	if update.RefreshToken != "" {
		appCfg.API.RefreshToken = update.RefreshToken
	}
	if update.AccessTokenExpiresAt != "" {
		appCfg.API.AccessTokenExpiresAt = update.AccessTokenExpiresAt
	}
	if update.RefreshTokenExpiresAt != "" {
		appCfg.API.RefreshTokenExpiresAt = update.RefreshTokenExpiresAt
	}

	return nil
}

func shouldRejectStaleTokenUpdate(cfg *config.Config, incoming api.TokenUpdate) bool {
	currentRefreshExpiry, currentRefreshOK := parseExpiry(cfg.API.RefreshTokenExpiresAt)
	incomingRefreshExpiry, incomingRefreshOK := parseExpiry(incoming.RefreshTokenExpiresAt)
	if currentRefreshOK && incomingRefreshOK && incomingRefreshExpiry.Before(currentRefreshExpiry) {
		return true
	}

	currentAccessExpiry, currentAccessOK := parseExpiry(cfg.API.AccessTokenExpiresAt)
	incomingAccessExpiry, incomingAccessOK := parseExpiry(incoming.AccessTokenExpiresAt)
	if currentAccessOK && incomingAccessOK && incomingAccessExpiry.Before(currentAccessExpiry) {
		return true
	}

	return false
}

func GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	mu.RLock()
	cfg := appCfg
	mu.RUnlock()
	if cfg == nil || cfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}
	return cfg.API.Token, cfg.API.AccessTokenExpiresAt, nil
}

const accessTokenEarlyRefreshWindow = 30 * time.Second

func EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	mu.RLock()
	cfg := appCfg
	mu.RUnlock()
	if cfg == nil || cfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}

	expiry, ok := parseExpiry(cfg.API.AccessTokenExpiresAt)
	if ok && time.Now().Before(expiry.Add(-accessTokenEarlyRefreshWindow)) {
		return cfg.API.Token, cfg.API.AccessTokenExpiresAt, nil
	}

	client := APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		mu.RLock()
		cfgNow := appCfg
		mu.RUnlock()
		if cfgNow != nil && cfgNow.API.Token != "" {
			return cfgNow.API.Token, cfgNow.API.AccessTokenExpiresAt, nil
		}
		return "", "", fmt.Errorf("token refresh failed: %w", whoAmIErr)
	}

	mu.RLock()
	cfgNow := appCfg
	mu.RUnlock()
	if cfgNow == nil || cfgNow.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated after refresh")
	}
	return cfgNow.API.Token, cfgNow.API.AccessTokenExpiresAt, nil
}

func CheckAuthStatus() (authenticated bool, expiresAt string, err error) {
	if !APIConfigured() {
		return false, "", nil
	}
	client := APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		return false, "", nil
	}
	token, exp, _ := GetAccessToken()
	_ = token
	return true, exp, nil
}

func ClearAuthState() {
	mu.Lock()
	defer mu.Unlock()
	if appCfg != nil {
		appCfg.API.Token = ""
		appCfg.API.RefreshToken = ""
		appCfg.API.AccessTokenExpiresAt = ""
		appCfg.API.RefreshTokenExpiresAt = ""
	}
}

func ReloadAuthConfig() error {
	mu.Lock()
	defer mu.Unlock()
	if appCfg == nil || appCfg.ConfigPath == "" {
		return fmt.Errorf("runtime config is not initialized")
	}

	v := viper.New()
	v.SetConfigFile(appCfg.ConfigPath)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	appCfg.API.Token = v.GetString(config.KeyAPIToken)
	appCfg.API.RefreshToken = v.GetString(config.KeyAPIRefreshToken)
	appCfg.API.AccessTokenExpiresAt = v.GetString(config.KeyAPIAccessTokenExpiresAt)
	appCfg.API.RefreshTokenExpiresAt = v.GetString(config.KeyAPIRefreshTokenExpiresAt)
	appCfg.API.BaseURL = v.GetString(config.KeyAPIBaseURL)

	return nil
}

func parseExpiry(raw string) (time.Time, bool) {
	if raw == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t, true
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, true
	}
	return time.Time{}, false
}
