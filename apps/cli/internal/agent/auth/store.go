// Package piauth owns the yishan pi agent's provider credential store: the
// auth.json file format (lock-compatible with pi's own writer), read-modify-
// write semantics that preserve OAuth token blobs byte-for-byte, provider-
// scoped env values, and ambient cloud credential detection. The daemon layer
// only adapts these to JSON-RPC.
package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/config"
)

// Sentinel errors returned by Store operations. Callers should use errors.Is
// to distinguish lock contention and corruption.
var (
	ErrLocked  = errors.New("pi auth file is locked by another process")
	ErrCorrupt = errors.New("pi auth file is corrupt")
)

var (
	providerIDPattern = regexp.MustCompile(`^[a-z0-9-]+$`)
	envVarNamePattern = regexp.MustCompile(`^[A-Z0-9_]+$`)
)

const (
	authFileName        = "auth.json"
	lockStaleDuration   = 30 * time.Second // mirrors pi proper-lockfile `stale: 30000`
	keyMaxLength        = 4096
	envMaxPairs         = 16
	providerIDMaxLength = 64
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

// Entry describes one provider credential without exposing its material.
// Type is "api_key", "oauth", "env" (env-only stored credential), or
// "ambient" (usable via cloud/environment credentials with no stored entry);
// empty when the stored entry has no decodable type field. EnvVars lists the
// stored provider-scoped env var NAMES (never values) so callers can warn
// about re-entry on edit. Source is a human label for ambient/env entries.
type Entry struct {
	Provider string   `json:"provider"`
	Type     string   `json:"type"`
	Source   string   `json:"source,omitempty"`
	EnvVars  []string `json:"envVars,omitempty"`
}

// CredentialInput is the credential payload accepted by Save. At least one of
// Key or Env must be set; Env mirrors pi's provider-scoped environment values
// (e.g. AWS_PROFILE, GOOGLE_CLOUD_PROJECT) that take priority over process
// environment when pi resolves the provider.
type CredentialInput struct {
	Key string
	Env map[string]string
}

// authFile models auth.json as raw per-provider payloads so OAuth token blobs
// (access/refresh/expires/accountId) survive every save byte-for-byte.
type authFile map[string]json.RawMessage

// Store provides lock-compatible read-modify-write access to the yishan pi
// agent's auth.json. It coordinates with pi's own proper-lockfile writers.
type Store struct {
	mu              sync.Mutex
	dir             string
	lockPolicy      LockPolicy
	ambientDetector func(provider string) string
}

// Option configures one Store (used for hermetic tests and fast lock policy).
type Option func(*Store)

// WithAmbientDetector overrides ambient credential detection.
func WithAmbientDetector(detect func(provider string) string) Option {
	return func(store *Store) {
		store.ambientDetector = detect
	}
}

// WithLockPolicy overrides the lock retry policy.
func WithLockPolicy(policy LockPolicy) Option {
	return func(store *Store) {
		store.lockPolicy = policy
	}
}

// NewStore returns a Store rooted at dir (the pi agent directory).
func NewStore(dir string, options ...Option) *Store {
	store := &Store{
		dir:             dir,
		lockPolicy:      defaultLockPolicy(),
		ambientDetector: detectAmbientProviderAuth,
	}
	for _, apply := range options {
		apply(store)
	}
	return store
}

// NewManagedStore points the store at the yishan-managed pi agent dir.
func NewManagedStore() (*Store, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	return NewStore(agentDir), nil
}

func (s *Store) authPath() string {
	return filepath.Join(s.dir, authFileName)
}

// ensureFile ensures the parent dir (0700) and an empty auth.json (0600)
// exist, mirroring pi's FileAuthStorageBackend.ensureParentDir/ensureFileExists.
func (s *Store) ensureFile() error {
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

// ambientCapableProviders are the providers pi can authenticate via cloud/
// environment credentials without an auth.json entry.
var ambientCapableProviders = []string{"amazon-bedrock", "google-vertex"}

// List returns one entry per provider registered in auth.json plus providers
// usable via ambient cloud credentials, never the credential material itself.
func (s *Store) List() ([]Entry, error) {
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

	entries, err := readAuthFile(s.authPath())
	if err != nil {
		return nil, err
	}
	providers := make([]Entry, 0, len(entries)+len(ambientCapableProviders))
	for provider, raw := range entries {
		entry := Entry{Provider: provider, Type: decodeCredentialType(raw)}
		envNames := decodeCredentialEnvKeys(raw)
		if len(envNames) > 0 {
			entry.EnvVars = envNames
		}
		if entry.Type == "api_key" && !decodeCredentialHasKey(raw) && len(envNames) > 0 {
			// Env-only stored credential (e.g. Bedrock AWS_PROFILE, Vertex
			// project/location) — surfaced as an environment credential.
			entry.Type = "env"
			entry.Source = strings.Join(envNames, ", ")
		}
		providers = append(providers, entry)
	}
	for _, provider := range ambientCapableProviders {
		if _, stored := entries[provider]; stored {
			// Stored credentials win over ambient sources, mirroring pi.
			continue
		}
		if source := s.ambientDetector(provider); source != "" {
			providers = append(providers, Entry{Provider: provider, Type: "ambient", Source: source})
		}
	}
	return providers, nil
}

// Save upserts one api_key credential (key and/or provider-scoped env values)
// for one allowlisted provider, preserving every other entry (including OAuth
// token blobs) byte-for-byte.
func (s *Store) Save(provider string, credential CredentialInput) error {
	provider = normalizeProviderID(provider)
	if err := validateCredential(provider, credential); err != nil {
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

	entries, err := readAuthFile(s.authPath())
	if err != nil {
		return err
	}
	raw, err := json.Marshal(buildApiKeyCredentialEntry(credential))
	if err != nil {
		return fmt.Errorf("marshal provider credential: %w", err)
	}
	entries[provider] = raw
	return writeAuthFile(s.authPath(), entries)
}

// Remove deletes one provider entry from auth.json. Removing an absent
// provider is a no-op.
func (s *Store) Remove(provider string) error {
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

	entries, err := readAuthFile(s.authPath())
	if err != nil {
		return err
	}
	if _, exists := entries[provider]; !exists {
		return nil
	}
	delete(entries, provider)
	return writeAuthFile(s.authPath(), entries)
}

func normalizeProviderID(provider string) string {
	return strings.TrimSpace(provider)
}

// buildApiKeyCredentialEntry composes the auth.json entry: type api_key with
// optional key and provider-scoped env values (omitted when empty, mirroring
// pi's own /login output).
func buildApiKeyCredentialEntry(credential CredentialInput) map[string]any {
	entry := map[string]any{"type": "api_key"}
	if key := strings.TrimSpace(credential.Key); key != "" {
		entry["key"] = key
	}
	if len(credential.Env) > 0 {
		entry["env"] = credential.Env
	}
	return entry
}

// validateCredential requires a known provider and at least one of a key or
// provider-scoped env values, each well-formed.
func validateCredential(provider string, credential CredentialInput) error {
	if provider == "" {
		return errors.New("provider id is required")
	}
	if len(provider) > providerIDMaxLength {
		return fmt.Errorf("provider id is too long (max %d characters)", providerIDMaxLength)
	}
	if !providerIDPattern.MatchString(provider) {
		return fmt.Errorf("invalid provider id %q: use letters, numbers, or dash", provider)
	}
	if !isApiKeyCapableProvider(provider) {
		return fmt.Errorf("provider %q does not support API key credentials", provider)
	}
	key := strings.TrimSpace(credential.Key)
	if key == "" && len(credential.Env) == 0 {
		return errors.New("an API key or at least one environment variable is required")
	}
	if len(key) > keyMaxLength {
		return fmt.Errorf("api key is too long (max %d characters)", keyMaxLength)
	}
	if len(credential.Env) > envMaxPairs {
		return fmt.Errorf("too many environment variables (max %d)", envMaxPairs)
	}
	for name, value := range credential.Env {
		if !envVarNamePattern.MatchString(name) {
			return fmt.Errorf("invalid environment variable name %q: use uppercase letters, numbers, or underscore", name)
		}
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("environment variable %q cannot be empty", name)
		}
		if len(value) > keyMaxLength {
			return fmt.Errorf("environment variable %q is too long (max %d characters)", name, keyMaxLength)
		}
	}
	return nil
}

// readAuthFile decodes auth.json into raw entry payloads. A missing file is
// treated as an empty map; invalid JSON is a typed corruption error.
func readAuthFile(path string) (authFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return authFile{}, nil
		}
		return nil, fmt.Errorf("read pi auth file: %w", err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return authFile{}, nil
	}
	var entries authFile
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCorrupt, err)
	}
	return entries, nil
}

// writeAuthFile persists auth.json with mode 0600 using a plain write (not
// rename) to match pi's own writer and avoid tripping its lock-compromise
// detection. Callers must hold the auth lock.
func writeAuthFile(path string, entries authFile) error {
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

// decodeCredentialType extracts the type field from one raw entry without
// requiring the entry to be a well-formed object (preserves unknown entries).
func decodeCredentialType(raw json.RawMessage) string {
	var meta struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return ""
	}
	return meta.Type
}

// decodeCredentialHasKey reports whether the entry carries a key value.
func decodeCredentialHasKey(raw json.RawMessage) bool {
	var meta struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return false
	}
	return strings.TrimSpace(meta.Key) != ""
}

// decodeCredentialEnvKeys returns the provider-scoped env var names stored in
// the entry (sorted for a stable label). Values are never exposed.
func decodeCredentialEnvKeys(raw json.RawMessage) []string {
	var meta struct {
		Env map[string]string `json:"env"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil
	}
	keys := make([]string, 0, len(meta.Env))
	for name := range meta.Env {
		keys = append(keys, name)
	}
	sort.Strings(keys)
	return keys
}
