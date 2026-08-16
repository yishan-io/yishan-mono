package cloud

import (
	"encoding/base64"
	"encoding/json"
	"strings"
)

// ParseUserIDFromJWT decodes the `sub` claim from an unverified JWT access
// token payload. The token is never signature-verified here: the payload is
// read only to derive the account identity for local data directory
// resolution. Returns ("", false) when the token is not a 3-part JWT, the
// payload is not valid base64url JSON, or the sub claim is empty.
func ParseUserIDFromJWT(accessToken string) (string, bool) {
	trimmed := strings.TrimSpace(accessToken)
	if trimmed == "" {
		return "", false
	}

	parts := strings.Split(trimmed, ".")
	if len(parts) != 3 {
		return "", false
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}

	var claims struct {
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", false
	}

	userID := strings.TrimSpace(claims.Sub)
	if userID == "" {
		return "", false
	}
	return userID, true
}
