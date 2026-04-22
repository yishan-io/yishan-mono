package cmd

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

type loginCallbackResult struct {
	state                string
	accessToken          string
	accessTokenExpiresAt string
	refreshToken         string
	refreshTokenExpiresAt string
	err                  error
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login via OAuth in browser",
	RunE: func(cmd *cobra.Command, _ []string) error {
		provider, err := cmd.Flags().GetString("provider")
		if err != nil {
			return err
		}
		if provider != "google" && provider != "github" {
			return fmt.Errorf("unsupported provider %q (allowed: google, github)", provider)
		}

		state, err := generateState(24)
		if err != nil {
			return err
		}

		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return fmt.Errorf("start callback listener: %w", err)
		}
		defer listener.Close()

		callbackURL := fmt.Sprintf("http://%s/callback", listener.Addr().String())
		resultCh := make(chan loginCallbackResult, 1)

		mux := http.NewServeMux()
		mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
			query := r.URL.Query()
			if callbackErr := query.Get("error"); callbackErr != "" {
				resultCh <- loginCallbackResult{err: fmt.Errorf("oauth callback error: %s", callbackErr)}
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte("Login failed. You can close this window."))
				return
			}

			result := loginCallbackResult{
				state:                 query.Get("state"),
				accessToken:           query.Get("accessToken"),
				accessTokenExpiresAt:  query.Get("accessTokenExpiresAt"),
				refreshToken:          query.Get("refreshToken"),
				refreshTokenExpiresAt: query.Get("refreshTokenExpiresAt"),
			}

			if result.state == "" || result.accessToken == "" || result.refreshToken == "" {
				result.err = errors.New("missing auth token fields in callback")
			}

			resultCh <- result
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("Login successful. You can close this window."))
		})

		server := &http.Server{
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		}

		go func() {
			_ = server.Serve(listener)
		}()

		apiBaseURL := viper.GetString("api_base_url")
		loginURL, err := buildLoginURL(apiBaseURL, provider, callbackURL, state)
		if err != nil {
			return err
		}

		fmt.Printf("Opening browser for %s login...\n", provider)
		if err := openBrowser(loginURL); err != nil {
			fmt.Printf("Could not open browser automatically. Open this URL manually:\n%s\n", loginURL)
		}

		select {
		case result := <-resultCh:
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdownCtx)

			if result.err != nil {
				return result.err
			}
			if result.state != state {
				return errors.New("oauth state mismatch")
			}

			if err := persistAPITokens(result); err != nil {
				return err
			}

			fmt.Println("Login successful. API token saved to local config.")
			return nil
		case <-time.After(2 * time.Minute):
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdownCtx)
			return errors.New("login timed out waiting for OAuth callback")
		}
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().String("provider", "google", "oauth provider (google|github)")
}

func buildLoginURL(baseURL string, provider string, redirectURI string, state string) (string, error) {
	parsedBase, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid API base URL %q: %w", baseURL, err)
	}

	parsedBase.Path = fmt.Sprintf("/auth/%s", provider)
	query := parsedBase.Query()
	query.Set("mode", "cli")
	query.Set("redirect_uri", redirectURI)
	query.Set("state", state)
	parsedBase.RawQuery = query.Encode()

	return parsedBase.String(), nil
}

func generateState(bytesLen int) (string, error) {
	raw := make([]byte, bytesLen)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func persistAPITokens(result loginCallbackResult) error {
	configPath := viper.ConfigFileUsed()
	if configPath == "" {
		if cfgFile != "" {
			configPath = cfgFile
		} else {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("resolve user home dir: %w", err)
			}
			configPath = home + "/.yishan.yaml"
		}
	}

	cfg := viper.New()
	cfg.SetConfigFile(configPath)
	cfg.SetConfigType("yaml")
	if _, err := os.Stat(configPath); err == nil {
		if err := cfg.ReadInConfig(); err != nil {
			return fmt.Errorf("read existing config file %q: %w", configPath, err)
		}
	}

	cfg.Set("api_base_url", viper.GetString("api_base_url"))
	cfg.Set("api_token", result.accessToken)
	cfg.Set("api_refresh_token", result.refreshToken)
	cfg.Set("api_access_token_expires_at", result.accessTokenExpiresAt)
	cfg.Set("api_refresh_token_expires_at", result.refreshTokenExpiresAt)

	if _, err := os.Stat(configPath); err == nil {
		if err := cfg.WriteConfigAs(configPath); err != nil {
			return fmt.Errorf("write config file %q: %w", configPath, err)
		}
	} else {
		if err := cfg.SafeWriteConfigAs(configPath); err != nil {
			return fmt.Errorf("create config file %q: %w", configPath, err)
		}
	}

	viper.Set("api_token", result.accessToken)
	return nil
}

func openBrowser(targetURL string) error {
	var command string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		command = "open"
		args = []string{targetURL}
	case "linux":
		command = "xdg-open"
		args = []string{targetURL}
	case "windows":
		command = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", targetURL}
	default:
		return fmt.Errorf("unsupported OS for browser open: %s", runtime.GOOS)
	}

	return exec.Command(command, args...).Start()
}
