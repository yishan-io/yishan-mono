package auth

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
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

func fastLockPolicy() LockPolicy {
	return LockPolicy{MaxAttempts: 3, MinDelay: 5 * time.Millisecond, MaxDelay: 10 * time.Millisecond}
}

func noopAmbient(string) string { return "" }

func newTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "pi", "agent")
	store := NewStore(dir, WithLockPolicy(fastLockPolicy()), WithAmbientDetector(noopAmbient))
	return store, dir
}

func seedAuthFile(t *testing.T, dir string, content string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir auth dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, authFileName), []byte(content), 0o600); err != nil {
		t.Fatalf("seed auth file: %v", err)
	}
}

func TestStore_ListMissingFileReturnsEmpty(t *testing.T) {
	t.Parallel()
	store, _ := newTestStore(t)

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List on missing file: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty list, got %d entries", len(entries))
	}
}

func TestStore_SaveCreatesFileAndDirWithModes(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)

	if err := store.Save("deepseek", CredentialInput{Key: "sk-test-123"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, authFileName))
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

	raw, err := os.ReadFile(filepath.Join(dir, authFileName))
	if err != nil {
		t.Fatalf("read auth file: %v", err)
	}
	if !strings.Contains(string(raw), `"type": "api_key"`) {
		t.Fatalf("auth file missing api_key entry: %s", raw)
	}
}

func TestStore_SaveUpsertsAndListHidesKeys(t *testing.T) {
	t.Parallel()
	store, _ := newTestStore(t)

	if err := store.Save("openrouter", CredentialInput{Key: "sk-or-first"}); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if err := store.Save("openrouter", CredentialInput{Key: "sk-or-second"}); err != nil {
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
	for _, entry := range entries {
		if strings.Contains(entry.Provider, "sk-") || strings.Contains(entry.Type, "sk-") {
			t.Fatalf("List exposed credential-like content: %+v", entry)
		}
	}
}

func TestStore_SavePreservesOAuthEntryByteForByte(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)
	seedAuthFile(t, dir, seedOAuthEntry)

	rawBefore, err := os.ReadFile(filepath.Join(dir, authFileName))
	if err != nil {
		t.Fatalf("read seeded file: %v", err)
	}
	oauthLineBefore := extractLine(t, string(rawBefore), `"access": "access-token-value"`)

	if err := store.Save("deepseek", CredentialInput{Key: "sk-ds-new"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	rawAfter, err := os.ReadFile(filepath.Join(dir, authFileName))
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

func TestStore_RemoveDeletesOnlyTarget(t *testing.T) {
	t.Parallel()
	store, _ := newTestStore(t)

	if err := store.Save("deepseek", CredentialInput{Key: "sk-a"}); err != nil {
		t.Fatalf("Save deepseek: %v", err)
	}
	if err := store.Save("openrouter", CredentialInput{Key: "sk-b"}); err != nil {
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

func TestStore_SaveValidation(t *testing.T) {
	t.Parallel()
	store, _ := newTestStore(t)

	cases := []struct {
		name     string
		provider string
		key      string
		env      map[string]string
		wantErr  bool
	}{
		{name: "empty provider", provider: "", key: "sk-x", wantErr: true},
		{name: "empty key and env", provider: "deepseek", key: "   ", wantErr: true},
		{name: "invalid provider chars", provider: "DeepSeek!", key: "sk-x", wantErr: true},
		{name: "non-allowlisted provider", provider: "openai-codex", key: "sk-x", wantErr: true},
		{name: "oversized provider id", provider: strings.Repeat("p", providerIDMaxLength+1), key: "sk-x", wantErr: true},
		{name: "oversized key", provider: "deepseek", key: strings.Repeat("k", keyMaxLength+1), wantErr: true},
		{name: "invalid env name", provider: "deepseek", key: "sk-x", env: map[string]string{"aws-profile": "x"}, wantErr: true},
		{name: "empty env value", provider: "deepseek", key: "sk-x", env: map[string]string{"AWS_PROFILE": " "}, wantErr: true},
		{name: "too many env pairs", provider: "deepseek", key: "sk-x", env: manyEnvPairs(envMaxPairs + 1), wantErr: true},
		{name: "valid save", provider: "anthropic", key: "sk-ant-valid", wantErr: false},
		{name: "env-only save", provider: "amazon-bedrock", env: map[string]string{"AWS_PROFILE": "sandbox"}, wantErr: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := store.Save(tc.provider, CredentialInput{Key: tc.key, Env: tc.env})
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestStore_CorruptFileReturnsTypedError(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)
	seedAuthFile(t, dir, "{ not valid json")

	if _, err := store.List(); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("List err = %v, want ErrCorrupt", err)
	}
	if err := store.Save("deepseek", CredentialInput{Key: "sk-x"}); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Save err = %v, want ErrCorrupt", err)
	}
	if err := store.Remove("deepseek"); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Remove err = %v, want ErrCorrupt", err)
	}
}

func TestStore_FreshLockReturnsRetryableError(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)
	lockPath := filepath.Join(dir, authFileName) + ".lock"
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("other-host:1234"), 0o600); err != nil {
		t.Fatalf("seed lock: %v", err)
	}

	err := store.Save("deepseek", CredentialInput{Key: "sk-x"})
	if !errors.Is(err, ErrLocked) {
		t.Fatalf("Save err = %v, want ErrLocked", err)
	}
}

func TestStore_StaleLockIsStolen(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)
	lockPath := filepath.Join(dir, authFileName) + ".lock"
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("other-host:1234"), 0o600); err != nil {
		t.Fatalf("seed lock: %v", err)
	}
	stale := time.Now().Add(-lockStaleDuration - time.Second)
	if err := os.Chtimes(lockPath, stale, stale); err != nil {
		t.Fatalf("age lock: %v", err)
	}

	if err := store.Save("deepseek", CredentialInput{Key: "sk-x"}); err != nil {
		t.Fatalf("Save with stale lock: %v", err)
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatalf("stale lock should have been removed after save, stat err = %v", err)
	}
}

func TestStore_ReleaseRemovesOwnLock(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)
	if err := store.Save("deepseek", CredentialInput{Key: "sk-x"}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, authFileName) + ".lock"); !os.IsNotExist(err) {
		t.Fatalf("lock should be removed after Save, stat err = %v", err)
	}
}

func TestStore_ConcurrentSaveAndRemove(t *testing.T) {
	store, _ := newTestStore(t)

	// Use allowlisted provider ids so every Save actually exercises the
	// lock-protected read-modify-write path.
	providers := []string{"deepseek", "openrouter", "anthropic"}
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		provider := providers[i%len(providers)]
		wg.Add(1)
		go func(provider string) {
			defer wg.Done()
			_ = store.Save(provider, CredentialInput{Key: "sk-x"})
			_ = store.Remove(provider)
		}(provider)
	}
	wg.Wait()

	// Every entry that survived a racy interleaving must still be a valid
	// api_key credential (no partial writes, no env/key corruption).
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

func TestStore_SaveWritesEnvAndListsEnvType(t *testing.T) {
	t.Parallel()
	store, dir := newTestStore(t)

	if err := store.Save("amazon-bedrock", CredentialInput{Env: map[string]string{"AWS_PROFILE": "sandbox"}}); err != nil {
		t.Fatalf("Save env-only: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(dir, authFileName))
	if err != nil {
		t.Fatalf("read auth file: %v", err)
	}
	content := string(raw)
	if !strings.Contains(content, `"AWS_PROFILE": "sandbox"`) {
		t.Fatalf("env not stored in entry: %s", content)
	}
	if strings.Contains(content, `"key"`) {
		t.Fatalf("env-only entry should not contain a key: %s", content)
	}

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].Provider != "amazon-bedrock" || entries[0].Type != "env" || entries[0].Source != "AWS_PROFILE" {
		t.Fatalf("entry = %+v, want env/AWS_PROFILE", entries[0])
	}
	if len(entries[0].EnvVars) != 1 || entries[0].EnvVars[0] != "AWS_PROFILE" {
		t.Fatalf("entry EnvVars = %v, want [AWS_PROFILE]", entries[0].EnvVars)
	}
	if strings.Contains(fmt.Sprint(entries), "sandbox") {
		t.Fatalf("List exposed env value: %+v", entries)
	}
}

func TestStore_SaveEnvWithKeyStaysApiKeyTypeAndExposesNames(t *testing.T) {
	t.Parallel()
	store, _ := newTestStore(t)

	if err := store.Save("cloudflare-ai-gateway", CredentialInput{
		Key: "cf-key",
		Env: map[string]string{"CLOUDFLARE_ACCOUNT_ID": "acct-1", "CLOUDFLARE_GATEWAY_ID": "gw-1"},
	}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	entry := entries[0]
	if entry.Type != "api_key" || entry.Source != "" {
		t.Fatalf("entry = %+v, want api_key type without source", entry)
	}
	// Env NAMES are exposed (for edit warnings); values are not.
	if len(entry.EnvVars) != 2 {
		t.Fatalf("EnvVars = %v, want both env names", entry.EnvVars)
	}
	if strings.Contains(fmt.Sprint(entries), "acct-1") || strings.Contains(fmt.Sprint(entries), "gw-1") {
		t.Fatalf("List exposed env values: %+v", entries)
	}
}

func manyEnvPairs(count int) map[string]string {
	env := make(map[string]string, count)
	for i := 0; i < count; i++ {
		env["VAR_"+string(rune('A'+i%26))+"_"+string(rune('0'+i%10))] = "value"
	}
	return env
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
