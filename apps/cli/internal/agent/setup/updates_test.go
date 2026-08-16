package setup

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckPiExtensionUpdates_FillsLatestVersion(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch", "npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)       // installed 1.2.3
	writeNPMPackage(t, "@yishan-io/pi-task", nil, nil) // installed 1.2.3

	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		if name == "pi-web-fetch" {
			return "2.0.0", nil // newer than installed
		}
		return "1.2.3", nil // same as installed
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions)

	byName := extensionsByName(extensions)
	fetch := byName["pi-web-fetch"]
	if !fetch.HasUpdate || fetch.LatestVersion != "2.0.0" {
		t.Fatalf("expected update info for pi-web-fetch, got %#v", fetch)
	}
	task := byName["@yishan-io/pi-task"]
	if task.HasUpdate || task.LatestVersion != "" {
		t.Fatalf("expected no update info when versions match, got %#v", task)
	}
}

func TestCheckPiExtensionUpdates_OnlyFlagsStrictlyNewerLatest(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil) // installed 1.2.3

	originalFetcher := latestVersionFetcher
	defer func() { latestVersionFetcher = originalFetcher }()

	cases := []struct {
		name       string
		latest     string
		wantUpdate bool
	}{
		{"higher", "2.0.0", true},
		{"equal", "1.2.3", false},
		{"lower", "1.2.2", false},
		{"unparseable", "not-a-version", false},
		{"empty", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resetExtensionUpdateCache()
			latestVersionFetcher = func(_ context.Context, name string) (string, error) {
				return tc.latest, nil
			}

			extensions, err := ListPiExtensions()
			if err != nil {
				t.Fatalf("ListPiExtensions: %v", err)
			}
			CheckPiExtensionUpdates(context.Background(), extensions)

			fetch := extensionsByName(extensions)["pi-web-fetch"]
			if fetch.HasUpdate != tc.wantUpdate {
				t.Fatalf("latest %q: HasUpdate = %v, want %v", tc.latest, fetch.HasUpdate, tc.wantUpdate)
			}
			if tc.wantUpdate {
				if fetch.LatestVersion != tc.latest {
					t.Fatalf("latest %q: LatestVersion = %q, want %q", tc.latest, fetch.LatestVersion, tc.latest)
				}
			} else if fetch.LatestVersion != "" {
				t.Fatalf("latest %q: LatestVersion = %q, want empty", tc.latest, fetch.LatestVersion)
			}
		})
	}
}

func TestIsNewerVersion(t *testing.T) {
	cases := []struct {
		latest    string
		installed string
		want      bool
	}{
		{"2.0.0", "1.2.3", true},
		{"1.3.0", "1.2.3", true},
		{"1.2.4", "1.2.3", true},
		{"1.2.3", "1.2.3", false},
		{"1.2.2", "1.2.3", false},
		{"1.0.0", "1.2.3", false},
		{"2.0.0", "2.0.0-beta.1", true},  // release > prerelease
		{"2.0.0-beta.1", "2.0.0", false}, // prerelease < release
		{"2.0.0-beta.2", "2.0.0-beta.1", true},
		{"2.0.0", "2.1.0-beta.1", false}, // installed prerelease ahead of registry stable
		{"1.9.9", "2.0.0-beta.1", false},
		{"not-a-version", "1.2.3", false},
		{"2.0.0", "not-a-version", false},
		{"", "1.2.3", false},
		{"2.0.0", "", false},
	}
	for _, tc := range cases {
		if got := isNewerVersion(tc.latest, tc.installed); got != tc.want {
			t.Fatalf("isNewerVersion(%q, %q) = %v, want %v", tc.latest, tc.installed, got, tc.want)
		}
	}
}

func TestCheckPiExtensionUpdates_SkipsUninstalledAndLocalFile(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch", "npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil) // installed
	// @yishan-io/pi-task is listed but NOT installed.

	fetchCount := 0
	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		fetchCount++
		return "9.9.9", nil
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions)
	if fetchCount != 1 {
		t.Fatalf("expected exactly one registry fetch (installed package only), got %d", fetchCount)
	}
}

func TestCheckPiExtensionUpdates_FailureDegradesGracefully(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		return "", fmt.Errorf("registry unreachable")
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	CheckPiExtensionUpdates(context.Background(), extensions) // must not error

	fetch := extensionsByName(extensions)["pi-web-fetch"]
	if fetch.HasUpdate || fetch.LatestVersion != "" {
		t.Fatalf("expected no update info on registry failure, got %#v", fetch)
	}
}

func TestCheckPiExtensionUpdates_CachesResultsWithinTTL(t *testing.T) {
	resetExtensionUpdateCache()
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	fetchCount := 0
	originalFetcher := latestVersionFetcher
	defer func() {
		latestVersionFetcher = originalFetcher
	}()
	latestVersionFetcher = func(_ context.Context, name string) (string, error) {
		fetchCount++
		return "2.0.0", nil
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	for round := 0; round < 3; round++ {
		CheckPiExtensionUpdates(context.Background(), extensions)
	}
	if fetchCount != 1 {
		t.Fatalf("expected registry fetched once within TTL, got %d fetches", fetchCount)
	}
}

func TestFetchLatestVersionFromRegistry_EncodesScopedNameAndParsesVersion(t *testing.T) {
	originalBase := npmRegistryBase
	originalClient := registryClient
	defer func() {
		npmRegistryBase = originalBase
		registryClient = originalClient
	}()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/@yishan-io%2Fpi-task/latest" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"name":"@yishan-io/pi-task","version":"2.0.0"}`))
	}))
	defer server.Close()
	npmRegistryBase = server.URL
	registryClient = server.Client()

	version, err := fetchLatestVersionFromRegistry(context.Background(), "@yishan-io/pi-task")
	if err != nil {
		t.Fatalf("fetchLatestVersionFromRegistry: %v", err)
	}
	if version != "2.0.0" {
		t.Fatalf("expected version 2.0.0, got %q", version)
	}
}
