// Package login implements the OAuth browser flow for the CLI login command.
// It is extracted from cmd/login.go so it can be tested independently of cobra.
package login

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"time"
)

// FlowConfig holds the parameters needed to start a browser-based OAuth flow.
type FlowConfig struct {
	// BaseURL is the api-service base URL, e.g. "https://api.yishan.io".
	BaseURL string
	// Provider is "google" or "github".
	Provider string
}

// FlowResult contains the tokens returned by a successful OAuth flow.
type FlowResult struct {
	State                 string
	AccessToken           string
	AccessTokenExpiresAt  string
	RefreshToken          string
	RefreshTokenExpiresAt string
}

// RunBrowserFlow starts a local callback HTTP server, opens the browser to the
// OAuth authorization URL, waits for the redirect, and returns the received
// tokens. The flow times out after 2 minutes.
func RunBrowserFlow(ctx context.Context, cfg FlowConfig) (FlowResult, error) {
	state, err := generateState(24)
	if err != nil {
		return FlowResult{}, err
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return FlowResult{}, fmt.Errorf("start callback listener: %w", err)
	}
	defer listener.Close()

	callbackURL := fmt.Sprintf("http://%s/callback", listener.Addr().String())

	type callbackResult struct {
		result FlowResult
		err    error
	}
	resultCh := make(chan callbackResult, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if callbackErr := query.Get("error"); callbackErr != "" {
			resultCh <- callbackResult{err: fmt.Errorf("oauth callback error: %s", callbackErr)}
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(BuildDesktopRedirectHTML("error", callbackErr)))
			return
		}

		fr := FlowResult{
			State:                 query.Get("state"),
			AccessToken:           query.Get("accessToken"),
			AccessTokenExpiresAt:  query.Get("accessTokenExpiresAt"),
			RefreshToken:          query.Get("refreshToken"),
			RefreshTokenExpiresAt: query.Get("refreshTokenExpiresAt"),
		}

		var err error
		if fr.State == "" || fr.AccessToken == "" || fr.RefreshToken == "" {
			err = errors.New("missing auth token fields in callback")
		}
		resultCh <- callbackResult{result: fr, err: err}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(BuildDesktopRedirectHTML("success", "")))
	})

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() { _ = server.Serve(listener) }()

	loginURL, err := BuildLoginURL(cfg.BaseURL, cfg.Provider, callbackURL, state)
	if err != nil {
		return FlowResult{}, err
	}

	fmt.Printf("Opening browser for %s login...\n", cfg.Provider)
	if err := OpenBrowser(loginURL); err != nil {
		fmt.Printf("Could not open browser automatically. Open this URL manually:\n%s\n", loginURL)
	}

	shutdownServer := func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}

	select {
	case res := <-resultCh:
		shutdownServer()
		if res.err != nil {
			return FlowResult{}, res.err
		}
		if res.result.State != state {
			return FlowResult{}, errors.New("oauth state mismatch")
		}
		return res.result, nil
	case <-time.After(2 * time.Minute):
		shutdownServer()
		return FlowResult{}, errors.New("login timed out waiting for OAuth callback")
	case <-ctx.Done():
		shutdownServer()
		return FlowResult{}, ctx.Err()
	}
}

// BuildLoginURL constructs the OAuth authorization URL for the given provider.
func BuildLoginURL(baseURL, provider, redirectURI, state string) (string, error) {
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

// OpenBrowser opens the given URL in the user's default browser.
func OpenBrowser(targetURL string) error {
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

// BuildDesktopRedirectHTML returns the HTML page shown in the browser after the
// OAuth callback. It triggers a deep-link redirect to yishan:// and then closes
// the tab after a short delay.
func BuildDesktopRedirectHTML(status string, reason string) string {
	deepLink := "yishan://auth/callback?status=" + url.QueryEscape(status)
	if reason != "" {
		deepLink += "&reason=" + url.QueryEscape(reason)
	}

	escapedDeepLink := html.EscapeString(deepLink)
	statusText := "Login successful"
	if status != "success" {
		statusText = "Login failed"
	}

	return fmt.Sprintf(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>%s</title>
  </head>
  <body>
    <p>%s. Returning to Yishan…</p>
    <p>If nothing happens, <a href="%s">open Yishan</a>.</p>
    <script>
      window.location.replace(%q);
      setTimeout(function () {
        window.close();
      }, 300);
    </script>
  </body>
</html>
`, statusText, statusText, escapedDeepLink, deepLink)
}

func generateState(bytesLen int) (string, error) {
	raw := make([]byte, bytesLen)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
