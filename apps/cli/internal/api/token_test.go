package api

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func encodeJWTPayload(t *testing.T, claims map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString([]byte("{\"alg\":\"none\",\"typ\":\"JWT\"}")) + "." +
		base64.RawURLEncoding.EncodeToString(raw) + ".signature"
}

func TestParseUserIDFromJWT_ReturnsSubClaim(t *testing.T) {
	token := encodeJWTPayload(t, map[string]any{"sub": "user_123", "email": "a@example.com"})

	userID, ok := ParseUserIDFromJWT(token)
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if userID != "user_123" {
		t.Fatalf("userID = %q, want %q", userID, "user_123")
	}
}

func TestParseUserIDFromJWT_RejectsServiceToken(t *testing.T) {
	if _, ok := ParseUserIDFromJWT("yst_live_abc123"); ok {
		t.Fatal("expected service token to be rejected")
	}
}

func TestParseUserIDFromJWT_RejectsNonJWTString(t *testing.T) {
	if _, ok := ParseUserIDFromJWT("not-a-jwt"); ok {
		t.Fatal("expected non-JWT string to be rejected")
	}
}

func TestParseUserIDFromJWT_RejectsInvalidBase64Payload(t *testing.T) {
	if _, ok := ParseUserIDFromJWT("header.%%%bad%%%.signature"); ok {
		t.Fatal("expected invalid base64 payload to be rejected")
	}
}

func TestParseUserIDFromJWT_RejectsPayloadWithoutSub(t *testing.T) {
	token := encodeJWTPayload(t, map[string]any{"email": "a@example.com"})

	if _, ok := ParseUserIDFromJWT(token); ok {
		t.Fatal("expected payload without sub to be rejected")
	}
}

func TestParseUserIDFromJWT_RejectsEmptyToken(t *testing.T) {
	if _, ok := ParseUserIDFromJWT(""); ok {
		t.Fatal("expected empty token to be rejected")
	}
}
