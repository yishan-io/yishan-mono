package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"

	"github.com/spf13/viper"
)

type Runtime struct {
	mu     sync.RWMutex
	appCfg *config.Config
}

func New(cfg *config.Config) *Runtime {
	return &Runtime{appCfg: cfg}
}

var defaultRuntime = New(nil)

func Default() *Runtime {
	return defaultRuntime
}

func Configure(cfg *config.Config) {
	defaultRuntime = New(cfg)
}

func APIClient() *api.Client {
	return defaultRuntime.APIClient()
}

func APIConfigured() bool {
	return defaultRuntime.APIConfigured()
}

func APIToken() string {
	return defaultRuntime.APIToken()
}

func UsesServiceTokenAuth() bool {
	return defaultRuntime.UsesServiceTokenAuth()
}

func PersistAuthTokens(update api.TokenUpdate) error {
	return defaultRuntime.PersistAuthTokens(update)
}

func GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	return defaultRuntime.GetAccessToken()
}

const accessTokenEarlyRefreshWindow = 30 * time.Second

func EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	return defaultRuntime.EnsureFreshAccessToken()
}

func CheckAuthStatus() (authenticated bool, expiresAt string, err error) {
	return defaultRuntime.CheckAuthStatus()
}

func ClearAuthState() {
	defaultRuntime.ClearAuthState()
}

func ReloadAuthConfig() error {
	return defaultRuntime.ReloadAuthConfig()
}

func (r *Runtime) APIClient() *api.Client {
	r.mu.RLock()
	cfg := r.appCfg
	r.mu.RUnlock()
	if cfg == nil {
		return api.NewRuntimeClient(&config.Config{})
	}
	return api.NewRuntimeClient(cfg)
}

func (r *Runtime) APIConfigured() bool {
	r.mu.RLock()
	cfg := r.appCfg
	r.mu.RUnlock()
	return cfg != nil && cfg.API.BaseURL != "" && cfg.API.Token != ""
}

func (r *Runtime) APIToken() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.appCfg == nil {
		return ""
	}
	return r.appCfg.API.Token
}

func (r *Runtime) UsesServiceTokenAuth() bool {
	return api.IsServiceToken(r.APIToken())
}

func (r *Runtime) PersistAuthTokens(update api.TokenUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.appCfg == nil || r.appCfg.ConfigPath == "" {
		return fmt.Errorf("runtime config is not initialized")
	}

	if shouldRejectStaleTokenUpdate(r.appCfg, update) {
		return nil
	}

	if err := config.UpdateFile(r.appCfg.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIBaseURL, r.appCfg.API.BaseURL)
		cfg.Set(config.KeyAPIToken, update.AccessToken)
		cfg.Set(config.KeyAPIRefreshToken, update.RefreshToken)
		cfg.Set(config.KeyAPIAccessTokenExpiresAt, update.AccessTokenExpiresAt)
		cfg.Set(config.KeyAPIRefreshTokenExpiresAt, update.RefreshTokenExpiresAt)
	}); err != nil {
		return fmt.Errorf("persist auth tokens: %w", err)
	}

	r.appCfg.API.Token = update.AccessToken
	r.appCfg.API.RefreshToken = update.RefreshToken
	r.appCfg.API.AccessTokenExpiresAt = update.AccessTokenExpiresAt
	r.appCfg.API.RefreshTokenExpiresAt = update.RefreshTokenExpiresAt

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

func (r *Runtime) GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	r.mu.RLock()
	cfg := r.appCfg
	r.mu.RUnlock()
	if cfg == nil || cfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}
	return cfg.API.Token, cfg.API.AccessTokenExpiresAt, nil
}

func (r *Runtime) EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	r.mu.RLock()
	cfg := r.appCfg
	r.mu.RUnlock()
	if cfg == nil || cfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}

	expiry, ok := parseExpiry(cfg.API.AccessTokenExpiresAt)
	if ok && time.Now().Before(expiry.Add(-accessTokenEarlyRefreshWindow)) {
		return cfg.API.Token, cfg.API.AccessTokenExpiresAt, nil
	}

	client := r.APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		r.mu.RLock()
		cfgNow := r.appCfg
		r.mu.RUnlock()
		if cfgNow != nil && cfgNow.API.Token != "" {
			return cfgNow.API.Token, cfgNow.API.AccessTokenExpiresAt, nil
		}
		return "", "", fmt.Errorf("token refresh failed: %w", whoAmIErr)
	}

	r.mu.RLock()
	cfgNow := r.appCfg
	r.mu.RUnlock()
	if cfgNow == nil || cfgNow.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated after refresh")
	}
	return cfgNow.API.Token, cfgNow.API.AccessTokenExpiresAt, nil
}

func (r *Runtime) CheckAuthStatus() (authenticated bool, expiresAt string, err error) {
	if !r.APIConfigured() {
		return false, "", nil
	}
	client := r.APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		var tokenErr *api.TokenRefreshError
		if errors.As(whoAmIErr, &tokenErr) {
			return false, "", nil
		}
		token, exp, tokenReadErr := r.GetAccessToken()
		_ = token
		if tokenReadErr != nil {
			return false, "", nil
		}
		return true, exp, nil
	}
	token, exp, _ := r.GetAccessToken()
	_ = token
	return true, exp, nil
}

func (r *Runtime) ClearAuthState() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.appCfg != nil {
		r.appCfg.API.Token = ""
		r.appCfg.API.RefreshToken = ""
		r.appCfg.API.AccessTokenExpiresAt = ""
		r.appCfg.API.RefreshTokenExpiresAt = ""
	}
}

func (r *Runtime) ReloadAuthConfig() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.appCfg == nil || r.appCfg.ConfigPath == "" {
		return fmt.Errorf("runtime config is not initialized")
	}

	v := viper.New()
	v.SetConfigFile(r.appCfg.ConfigPath)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	r.appCfg.API.Token = v.GetString(config.KeyAPIToken)
	r.appCfg.API.RefreshToken = v.GetString(config.KeyAPIRefreshToken)
	r.appCfg.API.AccessTokenExpiresAt = v.GetString(config.KeyAPIAccessTokenExpiresAt)
	r.appCfg.API.RefreshTokenExpiresAt = v.GetString(config.KeyAPIRefreshTokenExpiresAt)
	r.appCfg.API.BaseURL = v.GetString(config.KeyAPIBaseURL)

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
