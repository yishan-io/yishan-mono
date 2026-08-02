package daemon

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/workspace"
)

// Sentinel errors returned by piAuthStore operations. Handlers map them to RPC
// error codes; callers should use errors.Is to distinguish lock contention.
var (
	errPiAuthLocked   = errors.New("pi auth file is locked by another process")
	errPiAuthCorrupt  = errors.New("pi auth file is corrupt")
	providerIDPattern = regexp.MustCompile(`^[a-z0-9-]+$`)
)

const (
	piAuthFileName          = "auth.json"
	piAuthLockStaleDuration = 30 * time.Second // mirrors pi proper-lockfile `stale: 30000`
	piAuthKeyMaxLength      = 4096
)

// apiKeyCapableProviders mirrors pi 0.83.0's env-api-keys envMap plus the
// providers whose provider config accepts an `{ "type": "api_key", "key": ... }`
// credential. OpenAI Codex (ChatGPT subscription) is the only OAuth-only
// provider. Bump this when pi updates; the renderer catalog test pins the
// same ids.
var apiKeyCapableProviders = []string{
	"amazon-bedrock",
	"ant-ling",
	"anthropic",
	"azure-openai-responses",
	"cerebras",
	"cloudflare-ai-gateway",
	"cloudflare-workers-ai",
	"deepseek",
	"fireworks",
	"github-copilot",
	"google",
	"google-vertex",
	"groq",
	"huggingface",
	"kimi-coding",
	"minimax",
	"minimax-cn",
	"mistral",
	"moonshotai",
	"moonshotai-cn",
	"nvidia",
	"openai",
	"opencode",
	"opencode-go",
	"openrouter",
	"qwen-token-plan",
	"qwen-token-plan-cn",
	"radius",
	"together",
	"vercel-ai-gateway",
	"xai",
	"xiaomi",
	"xiaomi-token-plan-ams",
	"xiaomi-token-plan-cn",
	"xiaomi-token-plan-sgp",
	"zai",
	"zai-coding-cn",
}

func isApiKeyCapableProvider(provider string) bool {
	for _, candidate := range apiKeyCapableProviders {
		if candidate == provider {
			return true
		}
	}
	return false
}

// piProviderEntry describes one registered provider without exposing its
// credential material. Type is "api_key", "oauth", or empty when the stored
// entry has no decodable type field.
type piProviderEntry struct {
	Provider string `json:"provider"`
	Type     string `json:"type"`
}

// piAuthFile models auth.json as raw per-provider payloads so OAuth token
// blobs (access/refresh/expires/accountId) survive every save byte-for-byte.
type piAuthFile map[string]json.RawMessage

// authLockPolicy controls lock retry behavior. Defaults mirror pi's
// proper-lockfile retry shape; tests use a fast policy.
type authLockPolicy struct {
	maxAttempts int
	minDelay    time.Duration
	maxDelay    time.Duration
}

// piAuthStore provides lock-compatible read-modify-write access to the yishan
// pi agent's auth.json. It coordinates with pi's own proper-lockfile writers.
type piAuthStore struct {
	mu         sync.Mutex
	dir        string
	lockPolicy authLockPolicy
}

func newPiAuthStore(dir string) *piAuthStore {
	return &piAuthStore{
		dir:        dir,
		lockPolicy: defaultAuthLockPolicy(),
	}
}

func defaultAuthLockPolicy() authLockPolicy {
	return authLockPolicy{
		maxAttempts: 10,
		minDelay:    100 * time.Millisecond,
		maxDelay:    10 * time.Second,
	}
}

// newManagedPiAuthStore points the store at the yishan-managed pi agent dir.
func newManagedPiAuthStore() (*piAuthStore, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	return newPiAuthStore(agentDir), nil
}

// mustNewManagedPiAuthStore is nil-safe for handler construction: handlers
// return a server error when the store is nil.
func mustNewManagedPiAuthStore() *piAuthStore {
	store, err := newManagedPiAuthStore()
	if err != nil {
		return nil
	}
	return store
}

func (s *piAuthStore) authPath() string {
	return filepath.Join(s.dir, piAuthFileName)
}

// ensureFile ensures the parent dir (0700) and an empty auth.json (0600)
// exist, mirroring pi's FileAuthStorageBackend.ensureParentDir/ensureFileExists.
func (s *piAuthStore) ensureFile() error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("create pi agent dir: %w", err)
	}
	path := s.authPath()
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat pi auth file: %w", err)
	}
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		return fmt.Errorf("create pi auth file: %w", err)
	}
	return os.Chmod(path, 0o600)
}

// List returns one entry per provider registered in auth.json, never the
// credential material itself.
func (s *piAuthStore) List() ([]piProviderEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureFile(); err != nil {
		return nil, err
	}
	release, err := acquireAuthLock(s.authPath(), s.lockPolicy)
	if err != nil {
		return nil, err
	}
	defer release()

	entries, err := readPiAuthFile(s.authPath())
	if err != nil {
		return nil, err
	}
	providers := make([]piProviderEntry, 0, len(entries))
	for provider, raw := range entries {
		providers = append(providers, piProviderEntry{Provider: provider, Type: decodePiCredentialType(raw)})
	}
	return providers, nil
}

// Save upserts an api_key credential for one allowlisted provider, preserving
// every other entry (including OAuth token blobs) byte-for-byte.
func (s *piAuthStore) Save(provider string, key string) error {
	provider = normalizeProviderID(provider)
	if err := validateProviderKey(provider, key); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureFile(); err != nil {
		return err
	}
	release, err := acquireAuthLock(s.authPath(), s.lockPolicy)
	if err != nil {
		return err
	}
	defer release()

	entries, err := readPiAuthFile(s.authPath())
	if err != nil {
		return err
	}
	raw, err := json.Marshal(map[string]string{"type": "api_key", "key": key})
	if err != nil {
		return fmt.Errorf("marshal provider credential: %w", err)
	}
	entries[provider] = raw
	return writePiAuthFile(s.authPath(), entries)
}

// Remove deletes one provider entry from auth.json. Removing an absent
// provider is a no-op.
func (s *piAuthStore) Remove(provider string) error {
	provider = normalizeProviderID(provider)
	if provider == "" {
		return fmt.Errorf("provider id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureFile(); err != nil {
		return err
	}
	release, err := acquireAuthLock(s.authPath(), s.lockPolicy)
	if err != nil {
		return err
	}
	defer release()

	entries, err := readPiAuthFile(s.authPath())
	if err != nil {
		return err
	}
	if _, exists := entries[provider]; !exists {
		return nil
	}
	delete(entries, provider)
	return writePiAuthFile(s.authPath(), entries)
}

func normalizeProviderID(provider string) string {
	return strings.TrimSpace(provider)
}

func validateProviderKey(provider string, key string) error {
	if provider == "" {
		return errors.New("provider id is required")
	}
	if !providerIDPattern.MatchString(provider) {
		return fmt.Errorf("invalid provider id %q: use letters, numbers, or dash", provider)
	}
	if !isApiKeyCapableProvider(provider) {
		return fmt.Errorf("provider %q does not support API key credentials", provider)
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("api key is required")
	}
	if len(key) > piAuthKeyMaxLength {
		return fmt.Errorf("api key is too long (max %d characters)", piAuthKeyMaxLength)
	}
	return nil
}

// readPiAuthFile decodes auth.json into raw entry payloads. A missing file is
// treated as an empty map; invalid JSON is a typed corruption error.
func readPiAuthFile(path string) (piAuthFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return piAuthFile{}, nil
		}
		return nil, fmt.Errorf("read pi auth file: %w", err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return piAuthFile{}, nil
	}
	var entries piAuthFile
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("%w: %v", errPiAuthCorrupt, err)
	}
	return entries, nil
}

// writePiAuthFile persists auth.json with mode 0600 using a plain write (not
// rename) to match pi's own writer and avoid tripping its lock-compromise
// detection. Callers must hold the auth lock.
func writePiAuthFile(path string, entries piAuthFile) error {
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal pi auth file: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write pi auth file: %w", err)
	}
	return os.Chmod(path, 0o600)
}

// decodePiCredentialType extracts the type field from one raw entry without
// requiring the entry to be a well-formed object (preserves unknown entries).
func decodePiCredentialType(raw json.RawMessage) string {
	var meta struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return ""
	}
	return meta.Type
}

// acquireAuthLock implements a proper-lockfile-compatible lock at
// <path>.lock: exclusive create, 30s mtime staleness, bounded retry with
// backoff, and stale-lock stealing. The returned release removes the lock
// only when the file still belongs to this process.
func acquireAuthLock(path string, policy authLockPolicy) (func() error, error) {
	lockPath := path + ".lock"
	owner := lockOwnerID()
	delay := policy.minDelay
	for attempt := 0; attempt < policy.maxAttempts; attempt++ {
		if err := createLockFile(lockPath, owner); err == nil {
			return func() error { return releaseAuthLock(lockPath, owner) }, nil
		} else if !errors.Is(err, os.ErrExist) {
			return nil, err
		}

		stale, err := isLockStale(lockPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		if stale {
			if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
				return nil, fmt.Errorf("remove stale pi auth lock: %w", err)
			}
			continue
		}
		if attempt == policy.maxAttempts-1 {
			return nil, errPiAuthLocked
		}
		time.Sleep(delay)
		delay *= 2
		if delay > policy.maxDelay {
			delay = policy.maxDelay
		}
	}
	return nil, errPiAuthLocked
}

func createLockFile(lockPath string, owner string) error {
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := file.WriteString(owner); err != nil {
		file.Close()
		_ = os.Remove(lockPath)
		return fmt.Errorf("write pi auth lock: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(lockPath)
		return fmt.Errorf("close pi auth lock: %w", err)
	}
	return nil
}

func isLockStale(lockPath string) (bool, error) {
	info, err := os.Stat(lockPath)
	if err != nil {
		return false, err
	}
	return time.Since(info.ModTime()) > piAuthLockStaleDuration, nil
}

func lockOwnerID() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown"
	}
	return fmt.Sprintf("%s:%d", hostname, os.Getpid())
}

func releaseAuthLock(lockPath string, owner string) error {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if strings.TrimSpace(string(data)) != owner {
		// Lock was stolen or replaced by another writer; do not remove it.
		return nil
	}
	if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove pi auth lock: %w", err)
	}
	return nil
}

// handlePiListProviders returns every provider registered in the yishan pi
// agent's auth.json with its credential type. Credential material never
// crosses the RPC boundary.
func (h *JSONRPCHandler) handlePiListProviders() (any, error) {
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	entries, err := h.piAuth.List()
	if err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]any{"providers": entries}, nil
}

type piSaveProviderParams struct {
	Provider string `json:"provider"`
	Key      string `json:"key"`
}

func (h *JSONRPCHandler) handlePiSaveProvider(params json.RawMessage) (any, error) {
	var req piSaveProviderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	if err := h.piAuth.Save(req.Provider, req.Key); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

type piRemoveProviderParams struct {
	Provider string `json:"provider"`
}

func (h *JSONRPCHandler) handlePiRemoveProvider(params json.RawMessage) (any, error) {
	var req piRemoveProviderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	if err := h.piAuth.Remove(req.Provider); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

// mapPiAuthError converts store errors into typed RPC errors: validation
// problems become invalid-params, lock contention and IO failures become
// server errors with actionable messages.
func mapPiAuthError(err error) error {
	if errors.Is(err, errPiAuthLocked) {
		return workspace.NewRPCError(rpcCodeServerError, "pi is updating provider credentials; try again")
	}
	if errors.Is(err, errPiAuthCorrupt) {
		return workspace.NewRPCError(rpcCodeServerError, "pi auth file is corrupt; check ~/.yishan/pi/agent/auth.json")
	}
	var rpcErr *workspace.RPCError
	if errors.As(err, &rpcErr) {
		return err
	}
	return workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
}
