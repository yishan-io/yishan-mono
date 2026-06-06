package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/output"
)


var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Logout and clear local auth credentials",
	Long: `Revoke the active refresh token on the server and remove local credentials.

If token revocation fails (e.g. due to a network error) local credentials are
cleared anyway. Environment-variable credentials (YISHAN_API_TOKEN,
YISHAN_API_REFRESH_TOKEN) are not affected — unset them manually to fully
sign out of the current shell.`,
	Example: `  yishan logout`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		return executeLogout(func(refreshToken string) error {
			_, err := apiClient.RevokeToken(refreshToken)
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

	printEnvCredentialNotice(stderrWriter)

	if !storedCredentials {
		return output.PrintAny(map[string]string{"status": "ok", "message": "already logged out"})
	}

	if err := clearLocalCredentials(); err != nil {
		return err
	}

	return output.PrintAny(map[string]string{"status": "ok", "message": "logout successful"})
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

	return strings.TrimSpace(v.GetString(config.KeyAPIToken)) != "" ||
		strings.TrimSpace(v.GetString(config.KeyAPIRefreshToken)) != "" ||
		strings.TrimSpace(v.GetString(config.KeyAPIAccessTokenExpiresAt)) != "" ||
		strings.TrimSpace(v.GetString(config.KeyAPIRefreshTokenExpiresAt)) != "", nil
}

func clearLocalCredentials() error {
	if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIToken, "")
		cfg.Set(config.KeyAPIRefreshToken, "")
		cfg.Set(config.KeyAPIAccessTokenExpiresAt, "")
		cfg.Set(config.KeyAPIRefreshTokenExpiresAt, "")
	}); err != nil {
		return err
	}

	appConfig.API.Token = ""
	appConfig.API.RefreshToken = ""
	appConfig.API.AccessTokenExpiresAt = ""
	appConfig.API.RefreshTokenExpiresAt = ""

	return nil
}

func printEnvCredentialNotice(stderrWriter interface{ Write([]byte) (int, error) }) {
	if strings.TrimSpace(os.Getenv("YISHAN_API_TOKEN")) == "" && strings.TrimSpace(os.Getenv("YISHAN_API_REFRESH_TOKEN")) == "" {
		return
	}
	_, _ = fmt.Fprintf(stderrWriter, "Note: environment-based API credentials are still set. Unset YISHAN_API_TOKEN/YISHAN_API_REFRESH_TOKEN to fully sign out this shell.\n")
}
