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
	"path/filepath"
	"runtime"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/daemon"
)

type loginCallbackResult struct {
	state                 string
	accessToken           string
	accessTokenExpiresAt  string
	refreshToken          string
	refreshTokenExpiresAt string
	err                   error
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

		loginURL, err := buildLoginURL(appConfig.API.BaseURL, provider, callbackURL, state)
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

			if err := registerLocalNodeAfterLogin(); err != nil {
				log.Warn().Err(err).Msg("failed to register local node after login")
				fmt.Printf("Warning: local node registration failed: %v\n", err)
			} else {
				log.Info().Msg("local node registered successfully after login")
			}

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
	if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set("api_base_url", appConfig.API.BaseURL)
		cfg.Set("api_token", result.accessToken)
		cfg.Set("api_refresh_token", result.refreshToken)
		cfg.Set("api_access_token_expires_at", result.accessTokenExpiresAt)
		cfg.Set("api_refresh_token_expires_at", result.refreshTokenExpiresAt)
	}); err != nil {
		return err
	}

	appConfig.API.Token = result.accessToken
	appConfig.API.RefreshToken = result.refreshToken
	appConfig.API.AccessTokenExpiresAt = result.accessTokenExpiresAt
	appConfig.API.RefreshTokenExpiresAt = result.refreshTokenExpiresAt
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

// registerLocalNodeAfterLogin registers the local daemon node with the API
// immediately after login so that downstream workspace/project flows have
// a node available without waiting for the daemon to start. The call is
// idempotent — the API upserts on the daemon ID.
func registerLocalNodeAfterLogin() error {
	if appConfig.API.BaseURL == "" || appConfig.API.Token == "" {
		return fmt.Errorf("API is not configured; skipping node registration")
	}

	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return fmt.Errorf("resolve daemon state path: %w", err)
	}

	daemonIDPath := filepath.Join(filepath.Dir(statePath), daemon.IDFileName)
	daemonID, err := daemon.EnsureDaemonID(daemonIDPath)
	if err != nil {
		return fmt.Errorf("ensure daemon id: %w", err)
	}

	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	updateIfExists := false
	client := api.NewClient(appConfig.API.BaseURL, appConfig.API.Token, appConfig.API.RefreshToken, nil)
	_, err = client.RegisterNode(api.RegisterNodeInput{
		NodeID: daemonID,
		Name:   hostname,
		Scope:  "private",
		Metadata: map[string]any{
			"os":      runtime.GOOS,
			"version": buildinfo.Version,
		},
		UpdateIfExists: &updateIfExists,
	})
	if err != nil {
		return fmt.Errorf("register node %q: %w", daemonID, err)
	}

	log.Debug().Str("nodeId", daemonID).Str("hostname", hostname).Msg("registered local node after login")
	return nil
}
