package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func makeTestToken(secret string, claims map[string]any) string {
	header := base64UrlEncode([]byte(`{"alg":"HS256","typ":"JWT"}`))

	payloadBytes, _ := json.Marshal(claims)
	payload := base64UrlEncode(payloadBytes)

	sigInput := header + "." + payload
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(sigInput))
	sig := base64UrlEncode(mac.Sum(nil))

	return sigInput + "." + sig
}

func base64UrlEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func TestAuthenticate_ValidToken(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":   "relay",
		"sub":    "user-123",
		"nodeId": "node-abc",
		"iss":    "https://yishan.io",
		"aud":    "api-service",
		"exp":    time.Now().Add(1 * time.Hour).Unix(),
		"iat":    time.Now().Unix(),
	})

	req, _ := http.NewRequest("GET", "/ws", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	identity, err := a.Authenticate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identity.UserID != "user-123" {
		t.Errorf("expected userId user-123, got %s", identity.UserID)
	}
	if identity.NodeID != "node-abc" {
		t.Errorf("expected nodeId node-abc, got %s", identity.NodeID)
	}
}

func TestAuthenticate_ExpiredToken(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":   "relay",
		"sub":    "user-123",
		"nodeId": "node-abc",
		"iss":    "https://yishan.io",
		"aud":    "api-service",
		"exp":    time.Now().Add(-1 * time.Hour).Unix(),
	})

	req, _ := http.NewRequest("GET", "/ws", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	identity, err := a.Authenticate(req)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
	if identity != nil {
		t.Fatal("expected nil identity for expired token")
	}
}

func TestAuthenticate_WrongIssuer(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":   "relay",
		"sub":    "user-123",
		"nodeId": "node-abc",
		"iss":    "https://evil.com",
		"aud":    "api-service",
		"exp":    time.Now().Add(1 * time.Hour).Unix(),
	})

	req, _ := http.NewRequest("GET", "/ws", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	_, err := a.Authenticate(req)
	if err == nil {
		t.Fatal("expected error for wrong issuer")
	}
}

func TestAuthenticate_MissingNodeID(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type": "relay",
		"sub":  "user-123",
		"iss":  "https://yishan.io",
		"aud":  "api-service",
		"exp":  time.Now().Add(1 * time.Hour).Unix(),
	})

	req, _ := http.NewRequest("GET", "/ws", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	_, err := a.Authenticate(req)
	if err == nil {
		t.Fatal("expected error for missing nodeId")
	}
}

func TestAuthenticate_MissingToken(t *testing.T) {
	a := NewAuthenticator(Config{Secret: "secret"})

	req, _ := http.NewRequest("GET", "/ws", nil)

	_, err := a.Authenticate(req)
	if err == nil {
		t.Fatal("expected error for missing token")
	}
}

func TestAuthenticate_QueryParamToken(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":   "relay",
		"sub":    "user-456",
		"nodeId": "node-xyz",
		"iss":    "https://yishan.io",
		"aud":    "api-service",
		"exp":    time.Now().Add(1 * time.Hour).Unix(),
	})

	req, _ := http.NewRequest("GET", fmt.Sprintf("/ws?token=%s", token), nil)

	identity, err := a.Authenticate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identity.UserID != "user-456" {
		t.Errorf("expected userId user-456, got %s", identity.UserID)
	}
	if identity.NodeID != "node-xyz" {
		t.Errorf("expected nodeId node-xyz, got %s", identity.NodeID)
	}
}

func TestAuthenticate_WrongSecret(t *testing.T) {
	a := NewAuthenticator(Config{
		Secret:   "correct-secret",
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken("wrong-secret", map[string]any{
		"type":   "relay",
		"sub":    "user-123",
		"nodeId": "node-abc",
		"iss":    "https://yishan.io",
		"aud":    "api-service",
		"exp":    time.Now().Add(1 * time.Hour).Unix(),
	})

	req, _ := http.NewRequest("GET", "/ws", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	_, err := a.Authenticate(req)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestAuthenticateClient_ValidRelayToken(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":            "relay",
		"sub":             "user-123",
		"nodeId":          "node-abc",
		"organizationIds": []string{"org-1"},
		"iss":             "https://yishan.io",
		"aud":             "api-service",
		"exp":             time.Now().Add(1 * time.Hour).Unix(),
		"iat":             time.Now().Unix(),
	})

	req, _ := http.NewRequest("GET", "/client/ws?nodeId=node-abc", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	identity, err := a.AuthenticateClient(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identity.UserID != "user-123" {
		t.Errorf("expected userId user-123, got %s", identity.UserID)
	}
	if identity.NodeID != "node-abc" {
		t.Errorf("expected nodeId node-abc, got %s", identity.NodeID)
	}
}

func TestAuthenticateClient_WrongTokenType(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{
		Secret:   secret,
		Issuer:   "https://yishan.io",
		Audience: "api-service",
	})

	token := makeTestToken(secret, map[string]any{
		"type":  "access",
		"sub":   "user-123",
		"sid":   "session-1",
		"scope": "api:read api:write",
		"iss":   "https://yishan.io",
		"aud":   "api-service",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	})

	req, _ := http.NewRequest("GET", "/client/ws?nodeId=node-abc", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	_, err := a.AuthenticateClient(req)
	if err == nil {
		t.Fatal("expected error for wrong token type")
	}
}
