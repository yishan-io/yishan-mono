// Package auth provides node-scoped JWT authentication for relay connections.
//
// Nodes connect with a Bearer token (JWT access token issued by the API service).
// The relay validates signature, expiry, issuer, and audience, then extracts
// the sub (userId) and nodeId claims to scope the connection.
package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// NodeIdentity represents the authenticated identity of a relay connection.
type NodeIdentity struct {
	UserID        string
	NodeID        string
	DaemonVersion string
}

// Config holds JWT validation parameters.
type Config struct {
	Secret   string
	Issuer   string
	Audience string
}

// nodeClaims extends RegisteredClaims with the custom nodeId claim.
type nodeClaims struct {
	jwt.RegisteredClaims
	NodeID string `json:"nodeId"`
}

// Authenticator validates JWT tokens and extracts node identity.
type Authenticator struct {
	config Config
}

// NewAuthenticator creates a new Authenticator with the given config.
func NewAuthenticator(config Config) *Authenticator {
	return &Authenticator{config: config}
}

// Authenticate validates a Bearer token from the request and returns the node identity.
// Returns nil and an error if authentication fails.
func (a *Authenticator) Authenticate(r *http.Request) (*NodeIdentity, error) {
	tokenString := ExtractBearerToken(r)
	if tokenString == "" {
		return nil, fmt.Errorf("missing bearer token")
	}

	identity, err := a.validateToken(tokenString)
	if err != nil {
		return nil, err
	}
	identity.DaemonVersion = strings.TrimSpace(r.URL.Query().Get("version"))
	return identity, nil
}

func (a *Authenticator) validateToken(tokenString string) (*NodeIdentity, error) {
	options := []jwt.ParserOption{
		jwt.WithValidMethods([]string{"HS256", "HS384", "HS512"}),
		jwt.WithExpirationRequired(),
	}
	if a.config.Issuer != "" {
		options = append(options, jwt.WithIssuer(a.config.Issuer))
	}
	if a.config.Audience != "" {
		options = append(options, jwt.WithAudience(a.config.Audience))
	}

	token, err := jwt.ParseWithClaims(tokenString, &nodeClaims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}
		return []byte(a.config.Secret), nil
	}, options...)
	if err != nil {
		return nil, fmt.Errorf("token validation: %w", err)
	}

	claims, ok := token.Claims.(*nodeClaims)
	if !ok {
		return nil, fmt.Errorf("unexpected claims type")
	}

	if claims.Subject == "" {
		return nil, fmt.Errorf("token missing sub claim")
	}
	if claims.NodeID == "" {
		return nil, fmt.Errorf("token missing nodeId claim")
	}

	return &NodeIdentity{
		UserID: claims.Subject,
		NodeID: claims.NodeID,
	}, nil
}

// ExtractBearerToken extracts a bearer token from the Authorization header or
// query parameters. Exported so the relay server can reuse it for API auth
// without duplicating the extraction logic.
func ExtractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if token, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
		return strings.TrimSpace(token)
	}

	// Fallback for WebSocket upgrades that cannot set custom headers.
	if t := strings.TrimSpace(r.URL.Query().Get("token")); t != "" {
		return t
	}

	return strings.TrimSpace(r.URL.Query().Get("access_token"))
}
