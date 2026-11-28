package auth

import (
	"net/http"
	"testing"
	"time"
)

func requestWithToken(t *testing.T, secret string, claims map[string]any) *http.Request {
	t.Helper()
	return requestWithTokenAt(t, secret, "/ws", claims)
}

func requestWithTokenAt(t *testing.T, secret string, target string, claims map[string]any) *http.Request {
	t.Helper()
	base := map[string]any{
		"iss": "https://yishan.io",
		"aud": "api-service",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	for k, v := range claims {
		base[k] = v
	}
	req, _ := http.NewRequest("GET", target, nil)
	req.Header.Set("Authorization", "Bearer "+makeTestToken(secret, base))
	return req
}

func TestTokenTypesAreNotInterchangeable(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{Secret: secret, Issuer: "https://yishan.io", Audience: "api-service"})

	access := map[string]any{"type": "access", "sub": "user-1", "sid": "s-1"}
	relay := map[string]any{"type": "relay", "sub": "user-1", "nodeId": "node-1"}
	untyped := map[string]any{"sub": "user-1", "nodeId": "node-1"}

	if _, err := a.Authenticate(requestWithToken(t, secret, access)); err == nil {
		t.Fatal("node auth must reject an access token without a nodeId query parameter")
	}
	if _, err := a.Authenticate(requestWithToken(t, secret, untyped)); err == nil {
		t.Fatal("node auth must reject a token without a type")
	}
	if _, err := a.AuthenticateUser(requestWithToken(t, secret, relay)); err == nil {
		t.Fatal("user auth must reject a relay token")
	}

	user, err := a.AuthenticateUser(requestWithToken(t, secret, access))
	if err != nil || user.UserID != "user-1" {
		t.Fatalf("user auth: identity=%+v err=%v", user, err)
	}
}

func TestAuthenticateUser_RequiresSubject(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{Secret: secret, Issuer: "https://yishan.io", Audience: "api-service"})
	if _, err := a.AuthenticateUser(requestWithToken(t, secret, map[string]any{"type": "access"})); err == nil {
		t.Fatal("expected an access token without sub to be rejected")
	}
}

func TestAuthenticate_AccessTokenWithNodeIDQuery(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{Secret: secret, Issuer: "https://yishan.io", Audience: "api-service"})
	access := map[string]any{"type": "access", "sub": "user-1", "sid": "s-1"}

	identity, err := a.Authenticate(requestWithTokenAt(t, secret, "/ws?nodeId=node-9&version=0.28.0", access))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identity.UserID != "user-1" || identity.NodeID != "node-9" || identity.DaemonVersion != "0.28.0" {
		t.Fatalf("identity = %+v", identity)
	}
}

func TestAuthenticate_RelayTokenIgnoresNodeIDQuery(t *testing.T) {
	secret := "test-secret-key"
	a := NewAuthenticator(Config{Secret: secret, Issuer: "https://yishan.io", Audience: "api-service"})
	relay := map[string]any{"type": "relay", "sub": "user-1", "nodeId": "node-1"}

	identity, err := a.Authenticate(requestWithTokenAt(t, secret, "/ws?nodeId=other", relay))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identity.NodeID != "node-1" {
		t.Fatalf("nodeId = %q, want the relay token claim", identity.NodeID)
	}
}
