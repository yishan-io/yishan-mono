package auth

import (
	"net/http"
	"testing"
	"time"
)

func requestWithToken(t *testing.T, secret string, claims map[string]any) *http.Request {
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
	req, _ := http.NewRequest("GET", "/ws", nil)
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
		t.Fatal("node auth must reject an access token")
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
