// Package session owns cloud authentication state: the cloud API client,
// token persistence and refresh, and auth status.
package session

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/platform/config"

	"github.com/spf13/viper"
)

var ErrAuthStateChanged = errors.New("auth state changed")

type Session struct {
	mu             sync.RWMutex
	appCfg         *config.Config
	authGeneration uint64
}

func New(cfg *config.Config) *Session {
	return &Session{appCfg: cfg}
}

var defaultSession = New(nil)

func Default() *Session {
	return defaultSession
}

func Configure(cfg *config.Config) {
	defaultSession = New(cfg)
}

func APIClient() *cloud.Client {
	return defaultSession.APIClient()
}

func APIConfigured() bool {
	return defaultSession.APIConfigured()
}

func APIToken() string {
	return defaultSession.APIToken()
}

func UsesServiceTokenAuth() bool {
	return defaultSession.UsesServiceTokenAuth()
}

func PersistAuthTokens(update cloud.TokenUpdate) error {
	return defaultSession.PersistAuthTokens(update)
}

func GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	return defaultSession.GetAccessToken()
}

const accessTokenEarlyRefreshWindow = 30 * time.Second

func EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	return defaultSession.EnsureFreshAccessToken()
}

func CheckAuthStatus() (authenticated bool, expiresAt string, err error) {
	return defaultSession.CheckAuthStatus()
}

func ClearAuthState() error {
	return defaultSession.ClearAuthState()
}

func ReloadAuthConfig() error {
	return defaultSession.ReloadAuthConfig()
}

func (r *Session) APIClient() *cloud.Client {
	r.mu.RLock()
	if r.appCfg == nil {
		r.mu.RUnlock()
		return cloud.NewRuntimeClient(&config.Config{})
	}
	generation := r.authGeneration
	apiConfig := r.appCfg.API
	r.mu.RUnlock()

	client := cloud.NewClient(
		apiConfig.BaseURL,
		apiConfig.Token,
		apiConfig.RefreshToken,
		apiConfig.AccessTokenExpiresAt,
		apiConfig.RefreshTokenExpiresAt,
		func(update cloud.TokenUpdate) error {
			return r.persistRefreshedAuthTokens(generation, update)
		},
	)
	client.SetOnPermanentRefreshFailure(func() error {
		return r.clearAuthStateAtGeneration(generation)
	})
	return client
}

func (r *Session) APIConfigured() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.appCfg != nil && r.appCfg.API.BaseURL != "" && r.appCfg.API.Token != ""
}

func (r *Session) APIToken() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.appCfg == nil {
		return ""
	}
	return r.appCfg.API.Token
}

func (r *Session) UsesServiceTokenAuth() bool {
	return cloud.IsServiceToken(r.APIToken())
}

func (r *Session) PersistAuthTokens(update cloud.TokenUpdate) error {
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

func (r *Session) persistRefreshedAuthTokens(generation uint64, update cloud.TokenUpdate) error {
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

func (r *Session) persistAuthTokensLocked(update cloud.TokenUpdate, invalidateClients bool) error {
	if err := config.UpdateFile(r.appCfg.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIBaseURL, r.appCfg.API.BaseURL)
		cfg.Set(config.KeyAPIToken, update.AccessToken)
		cfg.Set(config.KeyAPIRefreshToken, update.RefreshToken)
		cfg.Set(config.KeyAPIAccessTokenExpiresAt, update.AccessTokenExpiresAt)
		cfg.Set(config.KeyAPIRefreshTokenExpiresAt, update.RefreshTokenExpiresAt)
		if update.UserID != "" {
			cfg.Set(config.KeyUserID, update.UserID)
		}
	}); err != nil {
		return fmt.Errorf("persist auth tokens: %w", err)
	}

	r.appCfg.API.Token = update.AccessToken
	r.appCfg.API.RefreshToken = update.RefreshToken
	r.appCfg.API.AccessTokenExpiresAt = update.AccessTokenExpiresAt
	r.appCfg.API.RefreshTokenExpiresAt = update.RefreshTokenExpiresAt
	if update.UserID != "" {
		r.appCfg.UserID = update.UserID
	}
	if invalidateClients {
		r.authGeneration++
	}
	return nil
}

func shouldRejectStaleTokenUpdate(cfg *config.Config, incoming cloud.TokenUpdate) bool {
	currentRefreshExpiry, currentRefreshOK := cloud.ParseExpiry(cfg.API.RefreshTokenExpiresAt)
	incomingRefreshExpiry, incomingRefreshOK := cloud.ParseExpiry(incoming.RefreshTokenExpiresAt)
	if currentRefreshOK && incomingRefreshOK && incomingRefreshExpiry.Before(currentRefreshExpiry) {
		return true
	}

	currentAccessExpiry, currentAccessOK := cloud.ParseExpiry(cfg.API.AccessTokenExpiresAt)
	incomingAccessExpiry, incomingAccessOK := cloud.ParseExpiry(incoming.AccessTokenExpiresAt)
	if currentAccessOK && incomingAccessOK && incomingAccessExpiry.Before(currentAccessExpiry) {
		return true
	}

	return false
}

func (r *Session) GetAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.appCfg == nil || r.appCfg.API.Token == "" {
		return "", "", fmt.Errorf("not authenticated")
	}
	return r.appCfg.API.Token, r.appCfg.API.AccessTokenExpiresAt, nil
}

func (r *Session) EnsureFreshAccessToken() (accessToken string, accessTokenExpiresAt string, err error) {
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

	expiry, ok := cloud.ParseExpiry(apiConfig.AccessTokenExpiresAt)
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

func (r *Session) handleAccessTokenRefreshFailure(refreshErr error) (string, string, error) {
	var tokenErr *cloud.TokenRefreshError
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

func (r *Session) CheckAuthStatus() (authenticated bool, expiresAt string, err error) {
	if !r.APIConfigured() {
		return false, "", nil
	}
	client := r.APIClient()
	if _, whoAmIErr := client.WhoAmI(); whoAmIErr != nil {
		var tokenErr *cloud.TokenRefreshError
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

func (r *Session) ClearAuthState() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.clearAuthStateLocked()
}

func (r *Session) clearAuthStateAtGeneration(generation uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.appCfg == nil || r.authGeneration != generation {
		return nil
	}
	return r.clearAuthStateLocked()
}

func (r *Session) clearAuthStateLocked() error {
	if r.appCfg == nil {
		return nil
	}
	if r.appCfg.ConfigPath != "" {
		if err := config.UpdateFile(r.appCfg.ConfigPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyAPIToken, "")
			cfg.Set(config.KeyAPIRefreshToken, "")
			cfg.Set(config.KeyAPIAccessTokenExpiresAt, "")
			cfg.Set(config.KeyAPIRefreshTokenExpiresAt, "")
			// Clear the account pointer too: a stale user_id with no tokens
			// would pin a future env-credential login to the wrong account dir.
			cfg.Set(config.KeyUserID, "")
		}); err != nil {
			return fmt.Errorf("clear persisted auth state: %w", err)
		}
	}

	r.appCfg.API.Token = ""
	r.appCfg.API.RefreshToken = ""
	r.appCfg.API.AccessTokenExpiresAt = ""
	r.appCfg.API.RefreshTokenExpiresAt = ""
	r.appCfg.UserID = ""
	r.authGeneration++
	return nil
}

func (r *Session) ReloadAuthConfig() error {
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
	// UserID is intentionally not reloaded: it is informational, and account
	// data dir resolution reads the credential file directly.
	r.authGeneration++

	return nil
}
