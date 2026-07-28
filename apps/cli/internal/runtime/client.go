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

var ErrAuthStateChanged = errors.New("auth state changed")

type Runtime struct {
	mu             sync.RWMutex
	appCfg         *config.Config
	authGeneration uint64
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

func ClearAuthState() error {
	return defaultRuntime.ClearAuthState()
}

func ReloadAuthConfig() error {
	return defaultRuntime.ReloadAuthConfig()
}

func (r *Runtime) APIClient() *api.Client {
	r.mu.RLock()
	if r.appCfg == nil {
		r.mu.RUnlock()
		return api.NewRuntimeClient(&config.Config{})
	}
	generation := r.authGeneration
	apiConfig := r.appCfg.API
	r.mu.RUnlock()

	client := api.NewClient(
		apiConfig.BaseURL,
		apiConfig.Token,
		apiConfig.RefreshToken,
		apiConfig.AccessTokenExpiresAt,
		apiConfig.RefreshTokenExpiresAt,
		func(update api.TokenUpdate) error {
			return r.persistRefreshedAuthTokens(generation, update)
		},
	)
	client.SetOnPermanentRefreshFailure(func() error {
		return r.clearAuthStateAtGeneration(generation)
	})
	return client
}

func (r *Runtime) APIConfigured() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.appCfg != nil && r.appCfg.API.BaseURL != "" && r.appCfg.API.Token != ""
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

	return r.persistAuthTokensLocked(update, true)
}

func (r *Runtime) persistRefreshedAuthTokens(generation uint64, update api.TokenUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.appCfg == nil || r.authGeneration != generation {
		return ErrAuthStateChanged
	}
	if shouldRejectStaleTokenUpdate(r.appCfg, update) {
		return nil
	}
	return r.persistAuthTokensLocked(update, false)
}

func (r *Runtime) persistAuthTokensLocked(update api.TokenUpdate, invalidateClients bool) error {
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
	if invalidateClients {
		r.authGeneration++
	}
	return nil
}

func shouldRejectStaleTokenUpdate(cfg *config.Config, incoming api.TokenUpdate) bool {
	currentRefreshExpiry, currentRefreshOK := api.ParseExpiry(cfg.API.RefreshTokenExpiresAt)
	incomingRefreshExpiry, incomingRefreshOK := api.ParseExpiry(incoming.RefreshTokenExpiresAt)
	if currentRefreshOK && incomingRefreshOK && incomingRefreshExpiry.Before(currentRefreshExpiry) {
		return true
	}

	currentAccessExpiry, currentAccessOK := api.ParseExpiry(cfg.API.AccessTokenExpiresAt)
	incomingAccessExpiry, incomingAccessOK := api.ParseExpiry(incoming.AccessTokenExpiresAt)
	if currentAccessOK && incomingAccessOK && incomingAccessExpiry.Before(currentAccessExpiry) {
		return true
	}

	return false
}

func (r *Runtime) GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.appCfg == nil || r.appCfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}
	return r.appCfg.API.Token, r.appCfg.API.AccessTokenExpiresAt, nil
}

func (r *Runtime) EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	r.mu.RLock()
	if r.appCfg == nil {
		r.mu.RUnlock()
		return "", "", fmt.Errorf("not authenticated")
	}
	apiConfig := r.appCfg.API
	r.mu.RUnlock()
	if apiConfig.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}

	expiry, ok := api.ParseExpiry(apiConfig.AccessTokenExpiresAt)
	if ok && time.Now().Before(expiry.Add(-accessTokenEarlyRefreshWindow)) {
		return apiConfig.Token, apiConfig.AccessTokenExpiresAt, nil
	}

	client := r.APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		return r.handleAccessTokenRefreshFailure(whoAmIErr)
	}

	r.mu.RLock()
	if r.appCfg == nil {
		r.mu.RUnlock()
		return "", "", fmt.Errorf("not authenticated after refresh")
	}
	apiConfig = r.appCfg.API
	r.mu.RUnlock()
	if apiConfig.Token == "" {
		return "", "", fmt.Errorf("not authenticated after refresh")
	}
	return apiConfig.Token, apiConfig.AccessTokenExpiresAt, nil
}

func (r *Runtime) handleAccessTokenRefreshFailure(refreshErr error) (string, string, error) {
	var tokenErr *api.TokenRefreshError
	if errors.As(refreshErr, &tokenErr) && tokenErr.Permanent {
		return "", "", fmt.Errorf("token refresh failed: %w", refreshErr)
	}

	r.mu.RLock()
	if r.appCfg == nil {
		r.mu.RUnlock()
		return "", "", fmt.Errorf("token refresh failed: %w", refreshErr)
	}
	apiConfig := r.appCfg.API
	r.mu.RUnlock()
	if apiConfig.Token != "" {
		return apiConfig.Token, apiConfig.AccessTokenExpiresAt, nil
	}
	return "", "", fmt.Errorf("token refresh failed: %w", refreshErr)
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

func (r *Runtime) ClearAuthState() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.clearAuthStateLocked()
}

func (r *Runtime) clearAuthStateAtGeneration(generation uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.appCfg == nil || r.authGeneration != generation {
		return nil
	}
	return r.clearAuthStateLocked()
}

func (r *Runtime) clearAuthStateLocked() error {
	if r.appCfg == nil {
		return nil
	}
	if r.appCfg.ConfigPath != "" {
		if err := config.UpdateFile(r.appCfg.ConfigPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyAPIToken, "")
			cfg.Set(config.KeyAPIRefreshToken, "")
			cfg.Set(config.KeyAPIAccessTokenExpiresAt, "")
			cfg.Set(config.KeyAPIRefreshTokenExpiresAt, "")
		}); err != nil {
			return fmt.Errorf("clear persisted auth state: %w", err)
		}
	}

	r.appCfg.API.Token = ""
	r.appCfg.API.RefreshToken = ""
	r.appCfg.API.AccessTokenExpiresAt = ""
	r.appCfg.API.RefreshTokenExpiresAt = ""
	r.authGeneration++
	return nil
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
	r.authGeneration++

	return nil
}
