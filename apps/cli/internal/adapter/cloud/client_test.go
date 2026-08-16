package cloud

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/platform/config"
)

func TestDoRawRefreshFailureReturnsRefreshError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			http.Error(w, `{"error":"Invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "expired-access", "stale-refresh", "", "", nil)
	_, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err == nil {
		t.Fatal("expected refresh failure error")
	}

	var refreshErr *TokenRefreshError
	if !errors.As(err, &refreshErr) {
		t.Fatalf("expected TokenRefreshError, got %T: %v", err, err)
	}
	if !strings.Contains(err.Error(), "token refresh failed") {
		t.Fatalf("expected refresh failure context, got %q", err.Error())
	}
	if refreshErr.RequestError == nil || refreshErr.RefreshError == nil {
		t.Fatalf("expected original and refresh errors to be preserved: %+v", refreshErr)
	}
	if !refreshErr.Permanent {
		t.Fatal("expected invalid refresh token failure to be permanent")
	}
}

func TestDoRawRefreshFailureIsPermanentRegardlessOfErrorCasing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "expired-access", "stale-refresh", "", "", nil)
	_, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err == nil {
		t.Fatal("expected refresh failure error")
	}

	var refreshErr *TokenRefreshError
	if !errors.As(err, &refreshErr) {
		t.Fatalf("expected TokenRefreshError, got %T: %v", err, err)
	}
	if !refreshErr.Permanent {
		t.Fatal("expected lowercase invalid refresh token failure to be permanent")
	}
}

func TestDoRawRefreshFailureIsTransientForServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			http.Error(w, `{"error":"Service unavailable"}`, http.StatusServiceUnavailable)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "expired-access", "valid-refresh", "", "", nil)
	_, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err == nil {
		t.Fatal("expected refresh failure error")
	}

	var refreshErr *TokenRefreshError
	if !errors.As(err, &refreshErr) {
		t.Fatalf("expected TokenRefreshError, got %T: %v", err, err)
	}
	if refreshErr.Permanent {
		t.Fatal("expected server-side refresh failure to be transient")
	}
}

func TestDoRawClearsAuthAfterProactivePermanentRefreshFailure(t *testing.T) {
	cleared := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			if r.Header.Get("Authorization") != "Bearer still-valid-access" {
				http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/auth/refresh":
			http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(
		server.URL,
		"still-valid-access",
		"invalid-refresh",
		time.Now().Add(10*time.Second).UTC().Format(time.RFC3339),
		time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		nil,
	)
	client.SetOnPermanentRefreshFailure(func() error {
		cleared = true
		return nil
	})

	if _, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected request to fail after permanent refresh failure clears client credentials")
	}
	if !cleared {
		t.Fatal("expected proactive permanent refresh failure to clear auth state")
	}
	if _, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected cleared client not to reuse its previous access token")
	}
}

func TestNewRuntimeClient_ClearsPersistedCredentialsAfterPermanentRefreshFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	configPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := os.WriteFile(configPath, []byte("api_token: expired-access\napi_refresh_token: invalid-refresh\n"), 0o600); err != nil {
		t.Fatalf("seed credential file: %v", err)
	}
	cfg := &config.Config{
		ConfigPath: configPath,
		API: config.APIConfig{
			BaseURL:      server.URL,
			Token:        "expired-access",
			RefreshToken: "invalid-refresh",
		},
	}

	if _, err := NewRuntimeClient(cfg).DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"}); err == nil {
		t.Fatal("expected permanent refresh failure")
	}
	if cfg.API.Token != "" || cfg.API.RefreshToken != "" {
		t.Fatalf("expected in-memory credentials to clear, got %+v", cfg.API)
	}
	stored, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read cleared credential file: %v", err)
	}
	if strings.Contains(string(stored), "expired-access") || strings.Contains(string(stored), "invalid-refresh") {
		t.Fatalf("expected persisted credentials to clear, got %q", stored)
	}
}

func TestDoRawProactivelyRefreshesBeforeAccessTokenExpiry(t *testing.T) {
	var registerAttempts int
	var refreshAttempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			registerAttempts += 1
			if r.Header.Get("Authorization") == "Bearer fresh-access" {
				_, _ = w.Write([]byte(`{"ok":true}`))
				return
			}
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			refreshAttempts += 1
			_, _ = w.Write([]byte(`{"accessToken":"fresh-access","refreshToken":"next-refresh","accessTokenExpiresAt":"2030-01-01T00:10:00Z","refreshTokenExpiresAt":"2030-01-01T01:10:00Z"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	accessExp := time.Now().Add(10 * time.Second).UTC().Format(time.RFC3339)
	refreshExp := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
	client := NewClient(server.URL, "expired-access", "valid-refresh", accessExp, refreshExp, nil)
	body, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err != nil {
		t.Fatalf("expected proactive refresh flow to succeed, got %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Fatalf("unexpected response body: %s", string(body))
	}
	if refreshAttempts != 1 {
		t.Fatalf("expected one proactive refresh call, got %d", refreshAttempts)
	}
	if registerAttempts != 1 {
		t.Fatalf("expected single register request after proactive refresh, got %d", registerAttempts)
	}
}

func TestDoRawSkipsRefreshWhenRefreshTokenNearExpiry(t *testing.T) {
	var refreshAttempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			refreshAttempts += 1
			http.Error(w, `{"error":"Invalid refresh token"}`, http.StatusUnauthorized)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	accessExp := time.Now().Add(10 * time.Second).UTC().Format(time.RFC3339)
	refreshExp := time.Now().Add(10 * time.Second).UTC().Format(time.RFC3339)
	client := NewClient(server.URL, "expired-access", "stale-refresh", accessExp, refreshExp, nil)
	_, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err == nil {
		t.Fatal("expected refresh guard error")
	}

	var refreshErr *TokenRefreshError
	if !errors.As(err, &refreshErr) {
		t.Fatalf("expected TokenRefreshError, got %T: %v", err, err)
	}
	if !strings.Contains(err.Error(), "token refresh failed") {
		t.Fatalf("expected token refresh context in error, got %q", err.Error())
	}
	if refreshAttempts != 0 {
		t.Fatalf("expected no refresh API call when refresh token near expiry, got %d", refreshAttempts)
	}
}

func TestDoRawRefreshSuccessRetriesOriginalRequest(t *testing.T) {
	var registerAttempts int
	var refreshed TokenUpdate
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nodes/register":
			registerAttempts += 1
			if r.Header.Get("Authorization") == "Bearer fresh-access" {
				_, _ = w.Write([]byte(`{"ok":true}`))
				return
			}
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		case "/auth/refresh":
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode refresh body: %v", err)
			}
			if body["refreshToken"] != "valid-refresh" {
				t.Fatalf("expected valid refresh token, got %q", body["refreshToken"])
			}
			_, _ = w.Write([]byte(`{"accessToken":"fresh-access","refreshToken":"next-refresh","accessTokenExpiresAt":"access-exp","refreshTokenExpiresAt":"refresh-exp"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "expired-access", "valid-refresh", "", "", func(update TokenUpdate) error {
		refreshed = update
		return nil
	})
	body, err := client.DoRaw(http.MethodPost, "/nodes/register", map[string]string{"nodeId": "node-1"})
	if err != nil {
		t.Fatalf("expected retry success, got %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Fatalf("unexpected response body: %s", string(body))
	}
	if registerAttempts != 2 {
		t.Fatalf("expected original request to be retried once, got %d attempts", registerAttempts)
	}
	if refreshed.AccessToken != "fresh-access" || refreshed.RefreshToken != "next-refresh" {
		t.Fatalf("expected refreshed tokens to be reported, got %+v", refreshed)
	}
}
