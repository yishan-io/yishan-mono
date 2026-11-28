// Package auth provides JWT authentication for relay connections.
//
// Both token kinds are issued by the API service and share its signing
// secret, issuer and audience; the `type` claim tells them apart:
//   - nodes connect to /ws with a relay token (type "relay") that carries the
//     owning user (sub) and the nodeId;
//   - remote-control clients use the user's access token (type "access").
package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// NodeIdentity represents the authenticated identity of a relay connection.
type NodeIdentity struct {
	UserID          string
	NodeID          string
	OrganizationIDs []string
	DaemonVersion   string
}

// Config holds JWT validation parameters.
type Config struct {
	Secret   string
	Issuer   string
	Audience string
}

// UserIdentity is the authenticated user of a remote-control client or API call.
type UserIdentity struct {
	UserID string
}

const (
	tokenTypeRelay  = "relay"
	tokenTypeAccess = "access"
)

// tokenClaims covers both relay and access tokens; nodeId and
// organizationIds are only present on relay tokens.
type tokenClaims struct {
	jwt.RegisteredClaims
	Type            string   `json:"type"`
	NodeID          string   `json:"nodeId"`
	OrganizationIDs []string `json:"organizationIds"`
}

// Authenticator validates JWT tokens and extracts node identity.
type Authenticator struct {
	config Config
}

// NewAuthenticator creates a new Authenticator with the given config.
func NewAuthenticator(config Config) *Authenticator {
	return &Authenticator{config: config}
}

// Authenticate validates a node's relay token from the request and returns the
// node identity. Returns nil and an error if authentication fails.
func (a *Authenticator) Authenticate(r *http.Request) (*NodeIdentity, error) {
	claims, err := a.claimsFromRequest(r, tokenTypeRelay)
	if err != nil {
		return nil, err
	}
	if claims.NodeID == "" {
		return nil, fmt.Errorf("token missing nodeId claim")
	}
	return &NodeIdentity{
		UserID:          claims.Subject,
		NodeID:          claims.NodeID,
		OrganizationIDs: claims.OrganizationIDs,
		DaemonVersion:   strings.TrimSpace(r.URL.Query().Get("version")),
	}, nil
}

// AuthenticateUser validates a user access token from the request.
func (a *Authenticator) AuthenticateUser(r *http.Request) (*UserIdentity, error) {
	claims, err := a.claimsFromRequest(r, tokenTypeAccess)
	if err != nil {
		return nil, err
	}
	return &UserIdentity{UserID: claims.Subject}, nil
}

// claimsFromRequest validates the request's bearer token and requires the
// given token type and a subject.
func (a *Authenticator) claimsFromRequest(r *http.Request, tokenType string) (*tokenClaims, error) {
	tokenString := ExtractBearerToken(r)
	if tokenString == "" {
		return nil, fmt.Errorf("missing bearer token")
	}
	claims, err := a.validateToken(tokenString)
	if err != nil {
		return nil, err
	}
	if claims.Type != tokenType {
		return nil, fmt.Errorf("token type %q, want %q", claims.Type, tokenType)
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("token missing sub claim")
	}
	return claims, nil
}

func (a *Authenticator) validateToken(tokenString string) (*tokenClaims, error) {
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

	token, err := jwt.ParseWithClaims(tokenString, &tokenClaims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}
		return []byte(a.config.Secret), nil
	}, options...)
	if err != nil {
		return nil, fmt.Errorf("token validation: %w", err)
	}

	claims, ok := token.Claims.(*tokenClaims)
	if !ok {
		return nil, fmt.Errorf("unexpected claims type")
	}
	return claims, nil
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
