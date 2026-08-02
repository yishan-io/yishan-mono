package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"
)

const seedOAuthEntry = `{
  "openai-codex": {
    "type": "oauth",
    "access": "access-token-value",
    "refresh": "refresh-token-value",
    "expires": 1786087351355,
    "accountId": "6f44c462-6587-4568-a154-0da1271e25fc"
  }
}`

func fastLockPolicy() authLockPolicy {
	return authLockPolicy{maxAttempts: 3, minDelay: 5 * time.Millisecond, maxDelay: 10 * time.Millisecond}
}

func newTestPiAuthStore(t *testing.T) (*piAuthStore, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "pi", "agent")
	store := newPiAuthStore(dir)
	store.lockPolicy = fastLockPolicy()
	return store, dir
}

func writeAuthFile(t *testing.T, dir string, content string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir auth dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, piAuthFileName), []byte(content), 0o600); err != nil {
		t.Fatalf("seed auth file: %v", err)
	}
}

func TestPiAuthStore_ListMissingFileReturnsEmpty(t *testing.T) {
	t.Parallel()
	store, _ := newTestPiAuthStore(t)

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List on missing file: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty list, got %d entries", len(entries))
	}
}

func TestPiAuthStore_SaveCreatesFileAndDirWithModes(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)

	if err := store.Save("deepseek", "sk-test-123"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, piAuthFileName))
	if err != nil {
		t.Fatalf("stat auth file: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("auth file mode = %o, want 600", info.Mode().Perm())
	}
	dirInfo, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat auth dir: %v", err)
	}
	if dirInfo.Mode().Perm() != 0o700 {
		t.Fatalf("auth dir mode = %o, want 700", dirInfo.Mode().Perm())
	}

	raw, err := os.ReadFile(filepath.Join(dir, piAuthFileName))
	if err != nil {
		t.Fatalf("read auth file: %v", err)
	}
	if !strings.Contains(string(raw), `"type": "api_key"`) {
		t.Fatalf("auth file missing api_key entry: %s", raw)
	}
}

func TestPiAuthStore_SaveUpsertsAndListHidesKeys(t *testing.T) {
	t.Parallel()
	store, _ := newTestPiAuthStore(t)

	if err := store.Save("openrouter", "sk-or-first"); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if err := store.Save("openrouter", "sk-or-second"); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Provider != "openrouter" || entries[0].Type != "api_key" {
		t.Fatalf("unexpected entry: %+v", entries[0])
	}
	// List() must never expose credential material, even though the underlying
	// file legitimately stores it.
	for _, entry := range entries {
		if strings.Contains(entry.Provider, "sk-") || strings.Contains(entry.Type, "sk-") {
			t.Fatalf("List exposed credential-like content: %+v", entry)
		}
	}
}

func TestPiAuthStore_SavePreservesOAuthEntryByteForByte(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)
	writeAuthFile(t, dir, seedOAuthEntry)

	// Extract the exact oauth line as it was seeded.
	rawBefore, err := os.ReadFile(filepath.Join(dir, piAuthFileName))
	if err != nil {
		t.Fatalf("read seeded file: %v", err)
	}
	oauthLineBefore := extractLine(t, string(rawBefore), `"access": "access-token-value"`)

	if err := store.Save("deepseek", "sk-ds-new"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	rawAfter, err := os.ReadFile(filepath.Join(dir, piAuthFileName))
	if err != nil {
		t.Fatalf("read file after save: %v", err)
	}
	oauthLineAfter := extractLine(t, string(rawAfter), `"access": "access-token-value"`)
	if oauthLineAfter != oauthLineBefore {
		t.Fatalf("oauth entry changed:\nbefore: %s\nafter:  %s", oauthLineBefore, oauthLineAfter)
	}

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	byProvider := map[string]string{}
	for _, entry := range entries {
		byProvider[entry.Provider] = entry.Type
	}
	if byProvider["openai-codex"] != "oauth" {
		t.Fatalf("openai-codex type = %q, want oauth", byProvider["openai-codex"])
	}
	if byProvider["deepseek"] != "api_key" {
		t.Fatalf("deepseek type = %q, want api_key", byProvider["deepseek"])
	}
}

func TestPiAuthStore_RemoveDeletesOnlyTarget(t *testing.T) {
	t.Parallel()
	store, _ := newTestPiAuthStore(t)

	if err := store.Save("deepseek", "sk-a"); err != nil {
		t.Fatalf("Save deepseek: %v", err)
	}
	if err := store.Save("openrouter", "sk-b"); err != nil {
		t.Fatalf("Save openrouter: %v", err)
	}
	if err := store.Remove("deepseek"); err != nil {
		t.Fatalf("Remove deepseek: %v", err)
	}
	if err := store.Remove("never-existed"); err != nil {
		t.Fatalf("Remove absent provider should be a no-op, got: %v", err)
	}

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 || entries[0].Provider != "openrouter" {
		t.Fatalf("expected only openrouter remaining, got %+v", entries)
	}
}

func TestPiAuthStore_SaveValidation(t *testing.T) {
	t.Parallel()
	store, _ := newTestPiAuthStore(t)

	cases := []struct {
		name     string
		provider string
		key      string
		wantErr  bool
	}{
		{name: "empty provider", provider: "", key: "sk-x", wantErr: true},
		{name: "empty key", provider: "deepseek", key: "   ", wantErr: true},
		{name: "invalid provider chars", provider: "DeepSeek!", key: "sk-x", wantErr: true},
		{name: "non-allowlisted provider", provider: "openai-codex", key: "sk-x", wantErr: true},
		{name: "oversized key", provider: "deepseek", key: strings.Repeat("k", piAuthKeyMaxLength+1), wantErr: true},
		{name: "valid save", provider: "anthropic", key: "sk-ant-valid", wantErr: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := store.Save(tc.provider, tc.key)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestPiAuthStore_CorruptFileReturnsTypedError(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)
	writeAuthFile(t, dir, "{ not valid json")

	if _, err := store.List(); !errors.Is(err, errPiAuthCorrupt) {
		t.Fatalf("List err = %v, want errPiAuthCorrupt", err)
	}
	if err := store.Save("deepseek", "sk-x"); !errors.Is(err, errPiAuthCorrupt) {
		t.Fatalf("Save err = %v, want errPiAuthCorrupt", err)
	}
	if err := store.Remove("deepseek"); !errors.Is(err, errPiAuthCorrupt) {
		t.Fatalf("Remove err = %v, want errPiAuthCorrupt", err)
	}
}

func TestPiAuthStore_FreshLockReturnsRetryableError(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)
	lockPath := filepath.Join(dir, piAuthFileName) + ".lock"
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("other-host:1234"), 0o600); err != nil {
		t.Fatalf("seed lock: %v", err)
	}

	err := store.Save("deepseek", "sk-x")
	if !errors.Is(err, errPiAuthLocked) {
		t.Fatalf("Save err = %v, want errPiAuthLocked", err)
	}
}

func TestPiAuthStore_StaleLockIsStolen(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)
	lockPath := filepath.Join(dir, piAuthFileName) + ".lock"
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("other-host:1234"), 0o600); err != nil {
		t.Fatalf("seed lock: %v", err)
	}
	stale := time.Now().Add(-piAuthLockStaleDuration - time.Second)
	if err := os.Chtimes(lockPath, stale, stale); err != nil {
		t.Fatalf("age lock: %v", err)
	}

	if err := store.Save("deepseek", "sk-x"); err != nil {
		t.Fatalf("Save with stale lock: %v", err)
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatalf("stale lock should have been removed after save, stat err = %v", err)
	}
}

func TestPiAuthStore_ReleaseRemovesOwnLock(t *testing.T) {
	t.Parallel()
	store, dir := newTestPiAuthStore(t)
	if err := store.Save("deepseek", "sk-x"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, piAuthFileName) + ".lock"); !os.IsNotExist(err) {
		t.Fatalf("lock should be removed after Save, stat err = %v", err)
	}
}

func TestPiAuthStore_ConcurrentSaveAndRemove(t *testing.T) {
	store, _ := newTestPiAuthStore(t)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		provider := fmt.Sprintf("provider-%d", i%3)
		wg.Add(1)
		go func(provider string) {
			defer wg.Done()
			_ = store.Save(provider, "sk-x")
			_ = store.Remove(provider)
		}(provider)
	}
	wg.Wait()

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for _, entry := range entries {
		if entry.Type != "api_key" {
			t.Fatalf("unexpected entry type %q for %q", entry.Type, entry.Provider)
		}
	}
}

func extractLine(t *testing.T, content string, needle string) string {
	t.Helper()
	for _, line := range strings.Split(content, "\n") {
		if strings.Contains(line, needle) {
			return line
		}
	}
	t.Fatalf("needle %q not found in content:\n%s", needle, content)
	return ""
}

func newPiAuthTestHandler(t *testing.T) *JSONRPCHandler {
	t.Helper()
	h := newTestHandler(t)
	h.piAuth = newPiAuthStore(t.TempDir())
	h.piAuth.lockPolicy = fastLockPolicy()
	return h
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal test params: %v", err)
	}
	return raw
}

func assertRPCErrorCode(t *testing.T, err error, wantCode int) {
	t.Helper()
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("error = %v, want *workspace.RPCError", err)
	}
	if rpcErr.Code != wantCode {
		t.Fatalf("RPC error code = %d (%s), want %d", rpcErr.Code, rpcErr.Message, wantCode)
	}
}

func TestPiProviderDispatch_RoundTrip(t *testing.T) {
	h := newPiAuthTestHandler(t)

	saveResult, err := h.dispatchPi(context.Background(), nil, MethodPiSaveProvider,
		mustJSON(t, map[string]any{"provider": "deepseek", "key": "sk-roundtrip"}))
	if err != nil {
		t.Fatalf("saveProvider: %v", err)
	}
	if ok, _ := saveResult.(map[string]bool)["ok"]; !ok {
		t.Fatalf("saveProvider result = %v, want ok", saveResult)
	}

	listResult, err := h.dispatchPi(context.Background(), nil, MethodPiListProviders, nil)
	if err != nil {
		t.Fatalf("listProviders: %v", err)
	}
	payload := listResult.(map[string]any)
	providers := payload["providers"].([]piProviderEntry)
	if len(providers) != 1 || providers[0].Provider != "deepseek" || providers[0].Type != "api_key" {
		t.Fatalf("listProviders = %+v, want one deepseek/api_key entry", providers)
	}

	removeResult, err := h.dispatchPi(context.Background(), nil, MethodPiRemoveProvider,
		mustJSON(t, map[string]any{"provider": "deepseek"}))
	if err != nil {
		t.Fatalf("removeProvider: %v", err)
	}
	if ok, _ := removeResult.(map[string]bool)["ok"]; !ok {
		t.Fatalf("removeProvider result = %v, want ok", removeResult)
	}

	listResult, err = h.dispatchPi(context.Background(), nil, MethodPiListProviders, nil)
	if err != nil {
		t.Fatalf("listProviders after remove: %v", err)
	}
	if providers := listResult.(map[string]any)["providers"].([]piProviderEntry); len(providers) != 0 {
		t.Fatalf("listProviders after remove = %+v, want empty", providers)
	}
}

func TestPiProviderDispatch_InvalidParams(t *testing.T) {
	h := newPiAuthTestHandler(t)

	cases := []struct {
		name string
		body any
	}{
		{name: "empty provider", body: map[string]any{"provider": "", "key": "sk-x"}},
		{name: "empty key", body: map[string]any{"provider": "deepseek", "key": " "}},
		{name: "non-allowlisted provider", body: map[string]any{"provider": "openai-codex", "key": "sk-x"}},
		{name: "malformed json", body: "not-an-object"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := h.dispatchPi(context.Background(), nil, MethodPiSaveProvider, mustJSON(t, tc.body))
			assertRPCErrorCode(t, err, rpcCodeInvalidParams)
		})
	}

	_, err := h.dispatchPi(context.Background(), nil, MethodPiRemoveProvider, mustJSON(t, map[string]any{"provider": "  "}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestPiProviderDispatch_UnknownMethodStaysNotFound(t *testing.T) {
	h := newPiAuthTestHandler(t)
	_, err := h.dispatchPi(context.Background(), nil, "pi.unknownMethod", nil)
	assertRPCErrorCode(t, err, rpcCodeMethodNotFound)
}

func TestPiProviderDispatch_CorruptAuthFileIsServerError(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	writeAuthFile(t, dir, "{ broken")
	h.piAuth = newPiAuthStore(dir)
	h.piAuth.lockPolicy = fastLockPolicy()

	_, err := h.dispatchPi(context.Background(), nil, MethodPiListProviders, nil)
	assertRPCErrorCode(t, err, rpcCodeServerError)
}

func TestPiProviderDispatch_NilStoreIsServerError(t *testing.T) {
	h := newTestHandler(t)
	h.piAuth = nil
	_, err := h.dispatchPi(context.Background(), nil, MethodPiListProviders, nil)
	assertRPCErrorCode(t, err, rpcCodeServerError)
}
