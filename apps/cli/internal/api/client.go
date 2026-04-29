package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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
	onTokenRefresh func(TokenUpdate) error
}

func NewClient(baseURL string, token string, refreshToken string, onTokenRefresh func(TokenUpdate) error) *Client {
	trimmedBaseURL := strings.TrimRight(baseURL, "/")
	return &Client{
		http:           resty.New().SetBaseURL(trimmedBaseURL).SetTimeout(15 * time.Second),
		accessToken:    strings.TrimSpace(token),
		refreshToken:   strings.TrimSpace(refreshToken),
		onTokenRefresh: onTokenRefresh,
	}
}

func (c *Client) DoRaw(method string, path string, body any) ([]byte, error) {
	responseBody, err := c.doRaw(method, path, body)
	if apiErr, ok := err.(*APIError); ok && apiErr.StatusCode == http.StatusUnauthorized {
		if c.refreshToken != "" && !isRefreshRequest(path) {
			refreshErr := c.refreshAccessToken()
			if refreshErr == nil {
				return c.doRaw(method, path, body)
			}
			return nil, &TokenRefreshError{RequestError: err, RefreshError: refreshErr}
		}
	}

	return responseBody, err
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
	if c.onTokenRefresh != nil {
		if err := c.onTokenRefresh(update); err != nil {
			return err
		}
	}

	return nil
}
