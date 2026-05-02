package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Logout and clear local auth credentials",
	RunE: func(cmd *cobra.Command, _ []string) error {
		return executeLogout(func(refreshToken string) error {
			_, err := cliruntime.APIClient().RevokeToken(refreshToken)
			return err
		}, cmd.ErrOrStderr())
	},
}

func init() {
	rootCmd.AddCommand(logoutCmd)
}

func executeLogout(revokeToken func(refreshToken string) error, stderrWriter interface{ Write([]byte) (int, error) }) error {
	refreshToken := strings.TrimSpace(appConfig.API.RefreshToken)
	if refreshToken != "" {
		if err := revokeToken(refreshToken); err != nil {
			_, _ = fmt.Fprintf(stderrWriter, "Warning: failed to revoke refresh token on server; clearing local credentials anyway: %v\n", err)
		}
	}

	storedCredentials, err := hasStoredLocalCredentials(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	if !storedCredentials {
		fmt.Println("Already logged out. No local credentials found.")
		printEnvCredentialNotice()
		return nil
	}

	if err := clearLocalCredentials(); err != nil {
		return err
	}

	fmt.Println("Logout successful. Local credentials cleared.")
	printEnvCredentialNotice()
	return nil
}

func hasStoredLocalCredentials(configPath string) (bool, error) {
	v := viper.New()
	v.SetConfigFile(configPath)
	if err := v.ReadInConfig(); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			return false, nil
		}
		return false, err
	}

	return strings.TrimSpace(v.GetString("api_token")) != "" ||
		strings.TrimSpace(v.GetString("api_refresh_token")) != "" ||
		strings.TrimSpace(v.GetString("api_access_token_expires_at")) != "" ||
		strings.TrimSpace(v.GetString("api_refresh_token_expires_at")) != "", nil
}

func clearLocalCredentials() error {
	if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set("api_token", "")
		cfg.Set("api_refresh_token", "")
		cfg.Set("api_access_token_expires_at", "")
		cfg.Set("api_refresh_token_expires_at", "")
	}); err != nil {
		return err
	}

	appConfig.API.Token = ""
	appConfig.API.RefreshToken = ""
	appConfig.API.AccessTokenExpiresAt = ""
	appConfig.API.RefreshTokenExpiresAt = ""

	return nil
}

func printEnvCredentialNotice() {
	if strings.TrimSpace(os.Getenv("YISHAN_API_TOKEN")) == "" && strings.TrimSpace(os.Getenv("YISHAN_API_REFRESH_TOKEN")) == "" {
		return
	}
	fmt.Println("Note: environment-based API credentials are still set. Unset YISHAN_API_TOKEN/YISHAN_API_REFRESH_TOKEN to fully sign out this shell.")
}
