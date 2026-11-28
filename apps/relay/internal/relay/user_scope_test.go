package relay

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// testJWTSecret matches the secret newTestServer gives its authenticator.
const testJWTSecret = "test-secret"

func signTestToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	claims["exp"] = time.Now().Add(time.Hour).Unix()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func TestSessionManager_SameNodeIDForTwoUsersStaysSeparate(t *testing.T) {
	mgr := NewSessionManager()
	owner := mgr.Register(nil, newTestIdentity("node-1", "user-a"))
	mgr.Register(nil, newTestIdentity("node-1", "user-b"))

	if !owner.isConnected() {
		t.Fatal("another user's registration must not replace the owner's session")
	}
	if !mgr.IsOnline(SessionKey{UserID: "user-a", NodeID: "node-1"}) || !mgr.IsOnline(SessionKey{UserID: "user-b", NodeID: "node-1"}) {
		t.Fatal("expected both sessions online under their own keys")
	}
	if got := mgr.ConnectedSessionsForUser("user-a"); len(got) != 1 || got[0].UserID != "user-a" {
		t.Fatalf("expected only user-a's session, got %+v", got)
	}
}

func TestHandleMyNodes_ListsOnlyCallersConnectedNodes(t *testing.T) {
	srv := newTestServer(t)
	srv.sessions.Register(nil, newTestIdentity("node-mine", "user-a"))
	srv.sessions.Register(nil, newTestIdentity("node-other", "user-b"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+signTestToken(t, jwt.MapClaims{"type": "access", "sub": "user-a"}))
	w := httptest.NewRecorder()
	srv.HandleMyNodes(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body struct {
		Nodes []ConnectedSessionView `json:"nodes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Nodes) != 1 || body.Nodes[0].NodeID != "node-mine" {
		t.Fatalf("expected only node-mine, got %+v", body.Nodes)
	}
}

func TestUserEndpoints_RejectNonAccessTokens(t *testing.T) {
	srv := newTestServer(t)
	relayToken := signTestToken(t, jwt.MapClaims{"type": "relay", "sub": "user-a", "nodeId": "node-1"})

	cases := []struct {
		name    string
		path    string
		token   string
		handler http.HandlerFunc
	}{
		{"me/nodes with static API token", "/api/v1/me/nodes", testAPIToken, srv.HandleMyNodes},
		{"me/nodes with relay token", "/api/v1/me/nodes", relayToken, srv.HandleMyNodes},
		{"client ws with static API token", "/client/ws?nodeId=node-1", testAPIToken, srv.HandleClientWebSocket},
		{"client ws with relay token", "/client/ws?nodeId=node-1", relayToken, srv.HandleClientWebSocket},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()
		tc.handler(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s: expected 401, got %d", tc.name, w.Code)
		}
	}
}
