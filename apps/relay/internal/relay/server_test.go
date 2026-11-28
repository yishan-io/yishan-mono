package relay

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"yishan/apps/relay/internal/auth"

	relayprotocol "yishan/packages/relay-protocol-go"
)

// ---------------------------------------------------------------------------
// Server test helpers
// ---------------------------------------------------------------------------

const testAPIToken = "test-api-token"

func newTestServer(t *testing.T) *Server {
	t.Helper()
	sessions := NewSessionManager()
	authenticator := auth.NewAuthenticator(auth.Config{Secret: "test-secret"})
	return NewServer(sessions, authenticator, testAPIToken)
}

func authorizedRequest(t *testing.T, method, path string, body []byte) *http.Request {
	t.Helper()
	var bodyReader *bytes.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Authorization", "Bearer "+testAPIToken)
	req.Header.Set("Content-Type", "application/json")
	return req
}

// ---------------------------------------------------------------------------
// authorizeAPIRequest tests
// ---------------------------------------------------------------------------

func TestAuthorizeAPIRequest_NoToken_Returns401(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics", nil)
	srv.HandleMetrics(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthorizeAPIRequest_WrongToken_Returns401(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	srv.HandleMetrics(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthorizeAPIRequest_QueryParam_Accepted(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics?token="+testAPIToken, nil)
	srv.HandleMetrics(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with token in query param, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// HandlePublishNodeEvent tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HandleMetrics tests
// ---------------------------------------------------------------------------

func TestHandleMetrics_Returns200WithExpectedKeys(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	srv.HandleMetrics(w, authorizedRequest(t, http.MethodGet, "/api/v1/metrics", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("json decode: %v", err)
	}
	for _, key := range []string{"uptime", "connectedNodes", "connectedSessions", "connectedCount", "totalSessions"} {
		if _, ok := result[key]; !ok {
			t.Errorf("expected key %q in metrics response", key)
		}
	}
}

func TestHandleMetrics_WrongMethod_Returns405(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	srv.HandleMetrics(w, authorizedRequest(t, http.MethodPost, "/api/v1/metrics", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandleMetrics_CachedResponse(t *testing.T) {
	srv := newTestServer(t)

	// First call — populates cache.
	w1 := httptest.NewRecorder()
	srv.HandleMetrics(w1, authorizedRequest(t, http.MethodGet, "/api/v1/metrics", nil))

	// Second call within TTL — should return identical cached payload.
	w2 := httptest.NewRecorder()
	srv.HandleMetrics(w2, authorizedRequest(t, http.MethodGet, "/api/v1/metrics", nil))

	if w1.Body.String() != w2.Body.String() {
		t.Error("second metrics call within TTL should return cached response")
	}

	// After invalidation, a new payload should be computed.
	srv.invalidateMetricsCache()
	w3 := httptest.NewRecorder()
	srv.HandleMetrics(w3, authorizedRequest(t, http.MethodGet, "/api/v1/metrics", nil))
	// Body should be well-formed JSON regardless.
	var result map[string]any
	if err := json.Unmarshal(w3.Body.Bytes(), &result); err != nil {
		t.Fatalf("after invalidation: %v", err)
	}
}

// ---------------------------------------------------------------------------
// HandleRunStatus tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HandleDispatch tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// handleMessage tests
// ---------------------------------------------------------------------------

func TestHandleMessage_Pong_ReturnsTrue(t *testing.T) {
	srv := newTestServer(t)
	payload, _ := json.Marshal(relayprotocol.Request{JSONRPC: "2.0", Method: relayprotocol.MethodPong})
	if !srv.handleMessage("node-1", payload) {
		t.Error("handleMessage should return true for relayprotocol.MethodPong")
	}
}

func TestHandleMessage_UnknownMethod_ReturnsFalse(t *testing.T) {
	srv := newTestServer(t)
	payload, _ := json.Marshal(relayprotocol.Request{JSONRPC: "2.0", Method: "unknown.method"})
	if srv.handleMessage("node-1", payload) {
		t.Error("handleMessage should return false for unknown methods")
	}
}

func TestHandleMessage_InvalidJSON_ReturnsFalse(t *testing.T) {
	srv := newTestServer(t)
	if srv.handleMessage("node-1", []byte("not json at all")) {
		t.Error("handleMessage should return false for invalid JSON")
	}
}

// ---------------------------------------------------------------------------
// Client tracking tests
// ---------------------------------------------------------------------------

func TestAddRemoveClient(t *testing.T) {
	srv := newTestServer(t)
	srvConn, _, cleanup := pipeWebSocket(t)
	defer cleanup()

	client := &clientConn{key: SessionKey{UserID: "user-1", NodeID: "node-1"}, conn: srvConn}
	srv.addClient(client)

	srv.clientMu.RLock()
	count := len(srv.clientsByNode[SessionKey{UserID: "user-1", NodeID: "node-1"}])
	srv.clientMu.RUnlock()
	if count != 1 {
		t.Errorf("expected 1 client, got %d", count)
	}

	srv.removeClient(client)

	srv.clientMu.RLock()
	_, ok := srv.clientsByNode[SessionKey{UserID: "user-1", NodeID: "node-1"}]
	srv.clientMu.RUnlock()
	if ok {
		t.Error("clientsByNode entry should be deleted after last client removed")
	}
}

func TestBroadcastToNodeClients_NoClients_NoAlloc(t *testing.T) {
	srv := newTestServer(t)
	// Should not panic or allocate when there are no clients.
	srv.broadcastToNodeClients(SessionKey{UserID: "user-1", NodeID: "node-1"}, 1, []byte("hello"))
}

func TestInvalidateMetricsCache(t *testing.T) {
	srv := newTestServer(t)
	// Populate cache.
	srv.HandleMetrics(httptest.NewRecorder(), authorizedRequest(t, http.MethodGet, "/api/v1/metrics", nil))

	srv.metricsMu.RLock()
	cached := srv.metricsCache
	srv.metricsMu.RUnlock()
	if cached == nil {
		t.Fatal("cache should be populated after first call")
	}

	srv.invalidateMetricsCache()

	srv.metricsMu.RLock()
	after := srv.metricsCache
	srv.metricsMu.RUnlock()
	if after != nil {
		t.Error("cache should be nil after invalidation")
	}
}

// ---------------------------------------------------------------------------
// extractBearerToken tests (via auth package)
// ---------------------------------------------------------------------------

func TestExtractBearerToken_Header(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer my-token")
	token := auth.ExtractBearerToken(req)
	if token != "my-token" {
		t.Errorf("expected 'my-token', got %q", token)
	}
}

func TestExtractBearerToken_QueryParam(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?token=query-token", nil)
	token := auth.ExtractBearerToken(req)
	if token != "query-token" {
		t.Errorf("expected 'query-token', got %q", token)
	}
}

func TestExtractBearerToken_AccessTokenParam(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?access_token=at-token", nil)
	token := auth.ExtractBearerToken(req)
	if token != "at-token" {
		t.Errorf("expected 'at-token', got %q", token)
	}
}

func TestExtractBearerToken_Missing_ReturnsEmpty(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	token := auth.ExtractBearerToken(req)
	if token != "" {
		t.Errorf("expected empty token, got %q", token)
	}
}

func TestExtractBearerToken_HeaderPreferredOverQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?token=query-token", nil)
	req.Header.Set("Authorization", "Bearer header-token")
	token := auth.ExtractBearerToken(req)
	if token != "header-token" {
		t.Errorf("header should take precedence, got %q", token)
	}
}

// ---------------------------------------------------------------------------
// Stream subscription tests
// ---------------------------------------------------------------------------
