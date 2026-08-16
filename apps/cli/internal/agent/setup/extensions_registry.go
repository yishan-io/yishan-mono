package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/mod/semver"
)

// Extension registry access: version lookup for installed npm packages via
// the npm registry HTTP API, with a TTL cache. No filesystem mutation happens
// here; install/remove/update execution lives in extensions.go and
// extensions_metadata.go reads installed package state.

// npmVersionTimeout bounds each registry version check so a stalled registry
// cannot hold the extensions list hostage.
const npmVersionTimeout = 15 * time.Second

// extensionUpdateCacheTTL controls how long a checked latest-version result is
// reused before the registry is queried again. The cache keeps repeated list
// loads (panel mount + reload after every install/update/remove) fast.
const extensionUpdateCacheTTL = 30 * time.Minute

// extensionUpdateCacheNegativeTTL bounds how long a failed registry check is
// remembered, so an offline/stalled registry is not retried on every list
// load while still recovering quickly once it comes back.
const extensionUpdateCacheNegativeTTL = 2 * time.Minute

// npmRegistryBase is the registry the update check queries; injectable for
// tests. Scoped names are path-escaped (@scope/pkg -> @scope%2Fpkg).
var npmRegistryBase = "https://registry.npmjs.org"

// registryClient is a shared HTTP client with a short overall timeout; the
// per-request context deadline still applies.
var registryClient = &http.Client{Timeout: npmVersionTimeout}

// latestVersionFetcher is injectable so tests can stub registry responses.
var latestVersionFetcher = fetchLatestVersionFromRegistry

// extensionUpdateCache is a small TTL cache of checked latest versions,
// keyed by package name.
type extensionUpdateCacheEntry struct {
	latest  string
	fetched time.Time
}

var extensionUpdateCache = struct {
	sync.Mutex
	entries map[string]extensionUpdateCacheEntry
}{entries: map[string]extensionUpdateCacheEntry{}}

// CheckPiExtensionUpdates fills LatestVersion/HasUpdate for installed npm
// packages by querying the registry concurrently over HTTP (no npm
// subprocess), with a TTL cache so repeated loads are instant. Git and
// local-file sources have no cheap registry check and keep empty update
// info; any check failure degrades to no-update info rather than failing the
// list. ListPiExtensions itself stays network-free.
func CheckPiExtensionUpdates(ctx context.Context, extensions []PiExtensionInfo) {
	var wg sync.WaitGroup
	for i := range extensions {
		ext := &extensions[i]
		if !ext.Installed || ext.Source == PiExtensionSourceLocalFile || !strings.HasPrefix(ext.Source, "npm:") {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			checkCtx, cancel := context.WithTimeout(ctx, npmVersionTimeout)
			defer cancel()
			latest := cachedOrFetchLatestVersion(checkCtx, ext.Name)
			if !isNewerVersion(latest, ext.Version) {
				return
			}
			ext.LatestVersion = latest
			ext.HasUpdate = true
		}()
	}
	wg.Wait()
}

// isNewerVersion reports whether latest is a strictly newer semantic version
// than installed. Either side being empty or non-semver (a malformed registry
// response or an unparseable pin) degrades to false, so a lower or unparseable
// latest never flags a spurious update. Strict semver precedence still applies:
// an installed prerelease (e.g. "2.0.0-local") is considered older than its
// release ("2.0.0"), so it keeps flagging an update.
func isNewerVersion(latest, installed string) bool {
	latest, installed = normalizeSemver(latest), normalizeSemver(installed)
	if !semver.IsValid(latest) || !semver.IsValid(installed) {
		return false
	}
	return semver.Compare(latest, installed) > 0
}

// normalizeSemver adapts an npm-style version ("1.2.3", with optional
// prerelease/build suffix) to golang.org/x/mod/semver, which requires the
// leading "v". npm package.json versions are always full x.y.z, so partial
// versions (which x/mod/semver zero-pads) never reach this code.
func normalizeSemver(v string) string {
	if v == "" || strings.HasPrefix(v, "v") {
		return v
	}
	return "v" + v
}

// cachedOrFetchLatestVersion returns the cached latest version when fresh,
// otherwise fetches it from the registry and stores it. Failed checks are
// cached for the shorter negative TTL so they do not repeat on every load.
func cachedOrFetchLatestVersion(ctx context.Context, name string) string {
	extensionUpdateCache.Lock()
	if entry, ok := extensionUpdateCache.entries[name]; ok {
		ttl := extensionUpdateCacheTTL
		if entry.latest == "" {
			ttl = extensionUpdateCacheNegativeTTL
		}
		if time.Since(entry.fetched) < ttl {
			extensionUpdateCache.Unlock()
			return entry.latest
		}
	}
	extensionUpdateCache.Unlock()

	latest, err := latestVersionFetcher(ctx, name)
	if err != nil {
		latest = ""
	}
	extensionUpdateCache.Lock()
	extensionUpdateCache.entries[name] = extensionUpdateCacheEntry{latest: latest, fetched: time.Now()}
	extensionUpdateCache.Unlock()
	return latest
}

// fetchLatestVersionFromRegistry queries the registry for the dist-tag
// latest version of a package via GET <registry>/<name>/latest.
func fetchLatestVersionFromRegistry(ctx context.Context, name string) (string, error) {
	url := npmRegistryBase + "/" + url.PathEscape(name) + "/latest"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("build registry request for %s: %w", name, err)
	}
	resp, err := registryClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch registry metadata for %s: %w", name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registry responded %d for %s", resp.StatusCode, name)
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return "", fmt.Errorf("decode registry metadata for %s: %w", name, err)
	}
	return metadata.Version, nil
}
