package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"resty.dev/v3"
)

type TokenUpdate struct {
	AccessToken           string `json:"accessToken"`
	RefreshToken          string `json:"refreshToken"`
	AccessTokenExpiresAt  string `json:"accessTokenExpiresAt"`
	RefreshTokenExpiresAt string `json:"refreshTokenExpiresAt"`
}

type APIError struct {
	Method     string
	Path       string
	StatusCode int
	Status     string
	Body       []byte
}

func (e *APIError) Error() string {
	return fmt.Sprintf("request failed: %s %s -> %s\n%s", e.Method, e.Path, e.Status, string(e.Body))
}

type TokenRefreshError struct {
	RequestError error
	RefreshError error
}

func (e *TokenRefreshError) Error() string {
	return fmt.Sprintf("request unauthorized and token refresh failed: %v", e.RefreshError)
}

func (e *TokenRefreshError) Unwrap() error {
	return e.RefreshError
}

type Client struct {
	http           *resty.Client
	accessToken    string
	refreshToken   string
	accessTokenExpiresAt  string
	refreshTokenExpiresAt string
	onTokenRefresh func(TokenUpdate) error
}

func NewClient(
	baseURL string,
	token string,
	refreshToken string,
	accessTokenExpiresAt string,
	refreshTokenExpiresAt string,
	onTokenRefresh func(TokenUpdate) error,
) *Client {
	trimmedBaseURL := strings.TrimRight(baseURL, "/")
	return &Client{
		http:           resty.New().SetBaseURL(trimmedBaseURL).SetTimeout(15 * time.Second),
		accessToken:    strings.TrimSpace(token),
		refreshToken:   strings.TrimSpace(refreshToken),
		accessTokenExpiresAt:  strings.TrimSpace(accessTokenExpiresAt),
		refreshTokenExpiresAt: strings.TrimSpace(refreshTokenExpiresAt),
		onTokenRefresh: onTokenRefresh,
	}
}

const accessTokenEarlyRefreshWindow = 30 * time.Second
const refreshTokenExpiryGuardWindow = 30 * time.Second
const serviceTokenPrefix = "yst_"

func isServiceToken(token string) bool {
	return strings.HasPrefix(token, serviceTokenPrefix)
}

func (c *Client) DoRaw(method string, path string, body any) ([]byte, error) {
	// Service tokens are long-lived and never need refresh
	if isServiceToken(c.accessToken) {
		return c.doRaw(method, path, body)
	}

	if c.shouldProactivelyRefresh(path) {
		log.Debug().Str("path", path).Dur("window", accessTokenEarlyRefreshWindow).Msg("proactively refreshing API access token")
		if err := c.refreshAccessToken(); err != nil {
			log.Warn().Err(err).Str("path", path).Msg("proactive API access token refresh failed")
		}
	}

	responseBody, err := c.doRaw(method, path, body)
	if apiErr, ok := err.(*APIError); ok && apiErr.StatusCode == http.StatusUnauthorized {
		if c.refreshToken != "" && !isRefreshRequest(path) {
			if c.isRefreshTokenExpiredOrNearExpiry() {
				err := fmt.Errorf("refresh token is expired or near expiry")
				return nil, &TokenRefreshError{RequestError: err, RefreshError: err}
			}
			refreshErr := c.refreshAccessToken()
			if refreshErr == nil {
				return c.doRaw(method, path, body)
			}
			return nil, &TokenRefreshError{RequestError: err, RefreshError: refreshErr}
		}
	}

	return responseBody, err
}

func parseExpiryTimestamp(value string) (time.Time, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, false
	}
	if parsed, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func (c *Client) shouldProactivelyRefresh(path string) bool {
	if isRefreshRequest(path) || c.refreshToken == "" {
		return false
	}
	if c.isRefreshTokenExpiredOrNearExpiry() {
		log.Warn().Str("refreshTokenExpiresAt", c.refreshTokenExpiresAt).Dur("guardWindow", refreshTokenExpiryGuardWindow).Msg("skip proactive refresh because refresh token is expired or near expiry")
		return false
	}
	accessExpiry, ok := parseExpiryTimestamp(c.accessTokenExpiresAt)
	if !ok {
		return false
	}
	return time.Now().After(accessExpiry.Add(-accessTokenEarlyRefreshWindow))
}

func (c *Client) isRefreshTokenExpiredOrNearExpiry() bool {
	refreshExpiry, ok := parseExpiryTimestamp(c.refreshTokenExpiresAt)
	if !ok {
		return false
	}
	return time.Now().After(refreshExpiry.Add(-refreshTokenExpiryGuardWindow))
}

func (c *Client) DoDecode(method string, path string, body any, out any) error {
	responseBody, err := c.DoRaw(method, path, body)
	if err != nil {
		return err
	}
	if len(responseBody) == 0 {
		responseBody = []byte("{}")
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("parse json response for %s %s: %w", method, path, err)
	}

	return nil
}

func isRefreshRequest(path string) bool {
	return strings.TrimSpace(path) == "/auth/refresh"
}

func (c *Client) doRaw(method string, path string, body any) ([]byte, error) {
	req := c.http.R()
	if body != nil {
		req = req.SetBody(body)
	}
	if c.accessToken != "" {
		req = req.SetHeader("Authorization", "Bearer "+c.accessToken)
	}

	res, err := req.Execute(method, path)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	responseBody := res.Bytes()

	if res.StatusCode() < 200 || res.StatusCode() >= 300 {
		return nil, &APIError{
			Method:     method,
			Path:       path,
			StatusCode: res.StatusCode(),
			Status:     res.Status(),
			Body:       responseBody,
		}
	}

	return responseBody, nil
}

func (c *Client) refreshAccessToken() error {
	responseBody, err := c.doRaw(http.MethodPost, "/auth/refresh", map[string]string{
		"refreshToken": c.refreshToken,
	})
	if err != nil {
		return err
	}

	var update TokenUpdate
	if err := json.Unmarshal(responseBody, &update); err != nil {
		return fmt.Errorf("parse refresh token response: %w", err)
	}
	if strings.TrimSpace(update.AccessToken) == "" || strings.TrimSpace(update.RefreshToken) == "" {
		return fmt.Errorf("invalid refresh token response")
	}

	c.accessToken = strings.TrimSpace(update.AccessToken)
	c.refreshToken = strings.TrimSpace(update.RefreshToken)
	c.accessTokenExpiresAt = strings.TrimSpace(update.AccessTokenExpiresAt)
	c.refreshTokenExpiresAt = strings.TrimSpace(update.RefreshTokenExpiresAt)
	if c.onTokenRefresh != nil {
		if err := c.onTokenRefresh(update); err != nil {
			return err
		}
	}

	return nil
}
