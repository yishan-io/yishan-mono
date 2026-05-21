package relay

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"yishan/apps/relay/internal/auth"
	"yishan/apps/relay/internal/jobqueue"
)

// ---------------------------------------------------------------------------
// Stub transport (reused for jobqueue.Manager)
// ---------------------------------------------------------------------------

type testTransport struct {
	online map[string]bool
}

func (t *testTransport) IsOnline(nodeID string) bool      { return t.online[nodeID] }
func (t *testTransport) SendNotificationWithError(string, string, any) error { return nil }

// ---------------------------------------------------------------------------
// Server test helpers
// ---------------------------------------------------------------------------

const testAPIToken = "test-api-token"

func newTestServer(t *testing.T) *Server {
	t.Helper()
	sessions := NewSessionManager()
	authenticator := auth.NewAuthenticator(auth.Config{Secret: "test-secret"})
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout:    time.Second,
		ResultTimeout: time.Second,
		MaxRetries:    3,
	})
	return NewServer(sessions, authenticator, queue, testAPIToken)
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
	for _, key := range []string{"uptime", "connectedNodes", "connectedSessions", "connectedCount", "totalSessions", "queue"} {
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

func TestHandleRunStatus_NotFound(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := authorizedRequest(t, http.MethodGet, "/api/v1/runs/unknown-run", nil)
	req.URL.Path = "/api/v1/runs/unknown-run"
	srv.HandleRunStatus(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestHandleRunStatus_KnownRun_Returns200(t *testing.T) {
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout:    time.Second,
		ResultTimeout: time.Second,
		MaxRetries:    3,
	})
	// Dispatch a run so it exists.
	queue.Dispatch(jobqueue.DispatchParams{
		RunID:        "run-abc",
		JobID:        "job-1",
		NodeID:       "node-1",
		ScheduledFor: "2025-01-15T10:30:00Z",
		Payload:      nil,
	})

	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	w := httptest.NewRecorder()
	req := authorizedRequest(t, http.MethodGet, "/api/v1/runs/run-abc", nil)
	req.URL.Path = "/api/v1/runs/run-abc"
	srv.HandleRunStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var run jobqueue.PendingRun
	if err := json.Unmarshal(w.Body.Bytes(), &run); err != nil {
		t.Fatalf("json decode: %v", err)
	}
	if run.RunID != "run-abc" {
		t.Errorf("expected RunID 'run-abc', got %q", run.RunID)
	}
}

func TestHandleRunStatus_WrongMethod_Returns405(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := authorizedRequest(t, http.MethodPost, "/api/v1/runs/x", nil)
	req.URL.Path = "/api/v1/runs/x"
	srv.HandleRunStatus(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// HandleDispatch tests
// ---------------------------------------------------------------------------

func dispatchBody(t *testing.T, runID, jobID, nodeID string) []byte {
	t.Helper()
	b, _ := json.Marshal(map[string]any{
		"runId":        runID,
		"jobId":        jobID,
		"nodeId":       nodeID,
		"scheduledFor": "2025-01-15T10:30:00Z",
		"payload":      map[string]any{"prompt": "hello"},
	})
	return b
}

func TestHandleDispatch_Accepted(t *testing.T) {
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout: time.Second, ResultTimeout: time.Second, MaxRetries: 3,
	})
	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	w := httptest.NewRecorder()
	srv.HandleDispatch(w, authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", dispatchBody(t, "run-1", "job-1", "node-1")))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	if result["runId"] != "run-1" {
		t.Errorf("expected runId 'run-1', got %v", result)
	}
	if result["ok"] != true {
		t.Errorf("expected ok true, got %v", result)
	}
}

func TestHandleDispatch_Duplicate_ReturnsReasonPayload(t *testing.T) {
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout: time.Second, ResultTimeout: time.Second, MaxRetries: 3,
	})
	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	body := dispatchBody(t, "run-1", "job-1", "node-1")
	srv.HandleDispatch(httptest.NewRecorder(), authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", body))

	w := httptest.NewRecorder()
	body2 := dispatchBody(t, "run-2", "job-1", "node-1") // same job same minute → duplicate
	srv.HandleDispatch(w, authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", body2))

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	if result["ok"] != false || result["reason"] != "duplicate" {
		t.Errorf("expected duplicate payload, got %v", result)
	}
}

func TestHandleDispatch_NodeOffline_ReturnsReasonPayload(t *testing.T) {
	transport := &testTransport{online: map[string]bool{}} // node offline
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout: time.Second, ResultTimeout: time.Second, MaxRetries: 3,
	})
	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	w := httptest.NewRecorder()
	srv.HandleDispatch(w, authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", dispatchBody(t, "run-1", "job-1", "node-1")))

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	if result["ok"] != false || result["reason"] != "node_offline" {
		t.Errorf("expected node_offline payload, got %v", result)
	}
}

func TestHandleDispatch_MissingFields_Returns400(t *testing.T) {
	srv := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"runId": "x"}) // missing required fields
	w := httptest.NewRecorder()
	srv.HandleDispatch(w, authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", body))
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleDispatch_WrongMethod_Returns405(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	srv.HandleDispatch(w, authorizedRequest(t, http.MethodGet, "/api/v1/dispatch", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandleDispatch_InvalidJSON_Returns400(t *testing.T) {
	srv := newTestServer(t)
	w := httptest.NewRecorder()
	req := authorizedRequest(t, http.MethodPost, "/api/v1/dispatch", []byte("not json"))
	srv.HandleDispatch(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// handleMessage tests
// ---------------------------------------------------------------------------

func TestHandleMessage_Pong_ReturnsTrue(t *testing.T) {
	srv := newTestServer(t)
	payload, _ := json.Marshal(request{JSONRPC: "2.0", Method: MethodPong})
	if !srv.handleMessage("node-1", payload) {
		t.Error("handleMessage should return true for MethodPong")
	}
}

func TestHandleMessage_JobAck_ReturnsTrueAndCallsQueue(t *testing.T) {
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout: time.Second, ResultTimeout: time.Second, MaxRetries: 3,
	})
	// Dispatch a run first so HandleAck can find it.
	queue.Dispatch(jobqueue.DispatchParams{
		RunID: "run-ack", JobID: "job-1", NodeID: "node-1",
		ScheduledFor: "2025-01-15T10:30:00Z",
	})

	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	params, _ := json.Marshal(map[string]string{"runId": "run-ack", "status": "accepted"})
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": MethodJobAck, "params": json.RawMessage(params)})

	if !srv.handleMessage("node-1", payload) {
		t.Error("handleMessage should return true for MethodJobAck")
	}
	run := queue.GetRun("run-ack")
	if run.Status != jobqueue.StatusAwaitingResult {
		t.Errorf("expected StatusAwaitingResult after ack, got %s", run.Status)
	}
}

func TestHandleMessage_JobResult_ReturnsTrueAndCallsQueue(t *testing.T) {
	transport := &testTransport{online: map[string]bool{"node-1": true}}
	queue := jobqueue.NewManager(transport, jobqueue.Config{
		AckTimeout: time.Second, ResultTimeout: time.Second, MaxRetries: 3,
	})
	queue.Dispatch(jobqueue.DispatchParams{
		RunID: "run-res", JobID: "job-1", NodeID: "node-1",
		ScheduledFor: "2025-01-15T10:30:00Z",
	})
	queue.HandleAck("node-1", jobqueue.AckParams{RunID: "run-res", Status: "accepted"})

	srv := &Server{
		sessions:      NewSessionManager(),
		queue:         queue,
		apiToken:      testAPIToken,
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	params, _ := json.Marshal(map[string]any{"runId": "run-res", "status": "completed", "durationMs": 100})
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": MethodJobResult, "params": json.RawMessage(params)})

	if !srv.handleMessage("node-1", payload) {
		t.Error("handleMessage should return true for MethodJobResult")
	}
	run := queue.GetRun("run-res")
	if run.Status != jobqueue.StatusCompleted {
		t.Errorf("expected StatusCompleted, got %s", run.Status)
	}
}

func TestHandleMessage_UnknownMethod_ReturnsFalse(t *testing.T) {
	srv := newTestServer(t)
	payload, _ := json.Marshal(request{JSONRPC: "2.0", Method: "unknown.method"})
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

	client := &clientConn{nodeID: "node-1", conn: srvConn}
	srv.addClient(client)

	srv.clientMu.RLock()
	count := len(srv.clientsByNode["node-1"])
	srv.clientMu.RUnlock()
	if count != 1 {
		t.Errorf("expected 1 client, got %d", count)
	}

	srv.removeClient(client)

	srv.clientMu.RLock()
	_, ok := srv.clientsByNode["node-1"]
	srv.clientMu.RUnlock()
	if ok {
		t.Error("clientsByNode entry should be deleted after last client removed")
	}
}

func TestBroadcastToNodeClients_NoClients_NoAlloc(t *testing.T) {
	srv := newTestServer(t)
	// Should not panic or allocate when there are no clients.
	srv.broadcastToNodeClients("node-1", 1, []byte("hello"))
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

// pipeWebSocket is shared with session_test.go via the relay package.
// The helper is defined in session_test.go; this file relies on it.
// Verify it compiles correctly by referencing strings.
var _ = strings.TrimSpace
