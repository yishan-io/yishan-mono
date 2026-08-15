package install

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseNpmRegistryLatestVersion(t *testing.T) {
	t.Parallel()

	if got := parseNpmRegistryLatestVersion([]byte(`{"version":"0.84.1"}`)); got != "0.84.1" {
		t.Fatalf("expected 0.84.1, got %q", got)
	}
	if got := parseNpmRegistryLatestVersion([]byte(`{"dist-tags":{"latest":"1.2.3"},"version":"0.84.1"}`)); got != "0.84.1" {
		t.Fatalf("expected 0.84.1, got %q", got)
	}
	if got := parseNpmRegistryLatestVersion([]byte(`not json`)); got != "" {
		t.Fatalf("expected empty for invalid JSON, got %q", got)
	}
	if got := parseNpmRegistryLatestVersion([]byte(`{"name":"x"}`)); got != "" {
		t.Fatalf("expected empty when version missing, got %q", got)
	}
}

func TestPiLatestVersionWithClientFetchesAndCaches(t *testing.T) {
	resetPiLatestVersionCacheForTest()
	t.Cleanup(resetPiLatestVersionCacheForTest)

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"version":"0.85.0"}`))
	}))
	defer server.Close()

	originalURL := piLatestVersionURL
	piLatestVersionURL = server.URL
	t.Cleanup(func() { piLatestVersionURL = originalURL })

	client := &http.Client{}
	first := piLatestVersionWithClient(context.Background(), client)
	if first != "0.85.0" {
		t.Fatalf("expected 0.85.0, got %q", first)
	}
	second := piLatestVersionWithClient(context.Background(), client)
	if second != "0.85.0" {
		t.Fatalf("expected cached 0.85.0, got %q", second)
	}
	if requests != 1 {
		t.Fatalf("expected single registry request, got %d", requests)
	}
}

func TestPiLatestVersionWithClientFailsWithoutCaching(t *testing.T) {
	resetPiLatestVersionCacheForTest()
	t.Cleanup(resetPiLatestVersionCacheForTest)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	originalURL := piLatestVersionURL
	piLatestVersionURL = server.URL
	t.Cleanup(func() { piLatestVersionURL = originalURL })

	client := &http.Client{}
	if got := piLatestVersionWithClient(context.Background(), client); got != "" {
		t.Fatalf("expected empty on server error, got %q", got)
	}
}
