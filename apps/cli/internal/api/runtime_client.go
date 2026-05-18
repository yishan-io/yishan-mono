package api

import (
	"fmt"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
)

func NewRuntimeClient(appCfg *config.Config) *Client {
	return NewClient(
		appCfg.API.BaseURL,
		appCfg.API.Token,
		appCfg.API.RefreshToken,
		appCfg.API.AccessTokenExpiresAt,
		appCfg.API.RefreshTokenExpiresAt,
		func(update TokenUpdate) error {
			if err := config.UpdateFile(appCfg.ConfigPath, func(cfg *viper.Viper) {
				cfg.Set(config.KeyAPIBaseURL, appCfg.API.BaseURL)
				cfg.Set(config.KeyAPIToken, update.AccessToken)
				cfg.Set(config.KeyAPIRefreshToken, update.RefreshToken)
				cfg.Set(config.KeyAPIAccessTokenExpiresAt, update.AccessTokenExpiresAt)
				cfg.Set(config.KeyAPIRefreshTokenExpiresAt, update.RefreshTokenExpiresAt)
			}); err != nil {
				return fmt.Errorf("persist refreshed API tokens: %w", err)
			}

			appCfg.API.Token = update.AccessToken
			appCfg.API.RefreshToken = update.RefreshToken
			appCfg.API.AccessTokenExpiresAt = update.AccessTokenExpiresAt
			appCfg.API.RefreshTokenExpiresAt = update.RefreshTokenExpiresAt
			return nil
		},
	)
}
