package cloud

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestDoRawWithoutCredentialsReturnsErrNotLoggedIn(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "", "", "", "", nil)
	if _, err := client.DoRaw(http.MethodGet, "/me", nil); !errors.Is(err, ErrNotLoggedIn) {
		t.Fatalf("expected ErrNotLoggedIn, got %v", err)
	}
	if requests.Load() != 0 {
		t.Fatalf("expected no request without credentials, got %d", requests.Load())
	}

	if _, err := client.DoRaw(http.MethodGet, "/health", nil); err != nil {
		t.Fatalf("public endpoint should work without credentials: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected the public request to be sent, got %d", requests.Load())
	}
}
