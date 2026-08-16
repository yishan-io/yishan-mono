package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestListPiExtensions_ClassifiesOfficialAndUser(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:" + piNotifyExtensionName, "npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, piNotifyExtensionName, nil, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	notify, ok := byName[piNotifyExtensionName]
	if !ok {
		t.Fatalf("expected official extension %s in list, got %v", piNotifyExtensionName, extensionNames(extensions))
	}
	if !notify.Official {
		t.Fatalf("expected %s to be official, got %#v", piNotifyExtensionName, notify)
	}
	if !notify.Installed || notify.Version != "1.2.3" {
		t.Fatalf("expected installed official extension with version 1.2.3, got %#v", notify)
	}

	user, ok := byName["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected user extension pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Official {
		t.Fatalf("expected pi-web-fetch to be user-installed, got %#v", user)
	}
	if !user.Installed || user.Version != "1.2.3" {
		t.Fatalf("expected installed user extension with version, got %#v", user)
	}
}

func TestListPiExtensions_OfficialMissingFromSettingsIsUninstalled(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, nil, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	if len(extensions) != len(defaultPiExtensionNames) {
		t.Fatalf("expected %d official extensions on clean settings, got %d: %v", len(defaultPiExtensionNames), len(extensions), extensionNames(extensions))
	}
	for _, ext := range extensions {
		if !ext.Official {
			t.Fatalf("expected only official extensions, got %#v", ext)
		}
		if ext.Installed {
			t.Fatalf("expected official extension %s to be uninstalled on clean home, got %#v", ext.Name, ext)
		}
	}
}

func TestListPiExtensions_ObjectPackageEntriesNormalized(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	settingsPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "settings.json")
	content := `{"packages": [{"source": "npm:pi-web-fetch", "filter": "**"}], "extensions": ["./local-ext.ts"]}`
	if err := os.WriteFile(settingsPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	user, ok := byName["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected normalized object entry pi-web-fetch, got %v", extensionNames(extensions))
	}
	if user.Source != "npm:pi-web-fetch" || user.Official || user.Installed {
		t.Fatalf("expected normalized user package entry, got %#v", user)
	}

	local, ok := byName["local-ext.ts"]
	if !ok {
		t.Fatalf("expected local-file extension entry, got %v", extensionNames(extensions))
	}
	if local.Source != PiExtensionSourceLocalFile || !local.Installed || local.Official {
		t.Fatalf("expected read-only local-file entry, got %#v", local)
	}
}

func TestListPiExtensions_ReadmeFallbackDescription(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "@yishan-io/pi-task", nil, nil)
	// Official packages ship no package.json description; the README summary
	// line must fill in.
	homeDir, _ := os.UserHomeDir()
	pkgDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-task")
	readme := "# @yishan-io/pi-task\n\nA Pi package for Yishan task workflow guidance.\n\nMore details...\n"
	if err := os.WriteFile(filepath.Join(pkgDir, "README.md"), []byte(readme), 0o644); err != nil {
		t.Fatalf("write README: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	task, ok := extensionsByName(extensions)["@yishan-io/pi-task"]
	if !ok {
		t.Fatalf("expected @yishan-io/pi-task in list, got %v", extensionNames(extensions))
	}
	if task.Description != "A Pi package for Yishan task workflow guidance." {
		t.Fatalf("expected README summary description, got %q", task.Description)
	}
}

func TestListPiExtensions_ReportsPackageDescription(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)
	writeNPMPackage(t, "pi-web-fetch", nil, nil)
	// writeNPMPackage writes a package.json without a description; add one.
	homeDir, _ := os.UserHomeDir()
	pkgJSONPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "pi-web-fetch", "package.json")
	content, err := os.ReadFile(pkgJSONPath)
	if err != nil {
		t.Fatalf("read package.json: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(content, &metadata); err != nil {
		t.Fatalf("decode package.json: %v", err)
	}
	metadata["description"] = "Fetch web pages as markdown"
	updated, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("marshal package.json: %v", err)
	}
	if err := os.WriteFile(pkgJSONPath, updated, 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	user, ok := extensionsByName(extensions)["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Description != "Fetch web pages as markdown" {
		t.Fatalf("expected package description, got %q", user.Description)
	}
}

// resetExtensionUpdateCache clears the shared update cache so tests are
// order-independent.

func TestListPiExtensions_UserPackageNotInstalledInNodeModules(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-web-fetch"}, nil)

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	user, ok := extensionsByName(extensions)["pi-web-fetch"]
	if !ok {
		t.Fatalf("expected pi-web-fetch in list, got %v", extensionNames(extensions))
	}
	if user.Installed || user.Version != "" {
		t.Fatalf("expected package absent from node_modules to be uninstalled with no version, got %#v", user)
	}
}

func TestListPiExtensions_GitSourceInstalledState(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	settingsPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"packages": ["git:owner/repo@main", "git:gitlab.com/group/project", "git:https://example.com/org/ext"]}`), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}

	// Only the github.com one is installed on disk.
	gitRoot := filepath.Join(homeDir, ".yishan", "pi", "agent", "git")
	writePkgJSON(t, filepath.Join(gitRoot, "github.com", "owner", "repo"), "1.0.0")

	extensions, err := ListPiExtensions()
	if err != nil {
		t.Fatalf("ListPiExtensions: %v", err)
	}
	byName := extensionsByName(extensions)

	installed, ok := byName["repo"]
	if !ok {
		t.Fatalf("expected git shorthand entry repo, got %v", extensionNames(extensions))
	}
	if !installed.Installed || installed.Version != "1.0.0" {
		t.Fatalf("expected installed github shorthand with version, got %#v", installed)
	}

	notInstalled, ok := byName["project"]
	if !ok {
		t.Fatalf("expected gitlab entry project, got %v", extensionNames(extensions))
	}
	if notInstalled.Installed || notInstalled.Version != "" {
		t.Fatalf("expected uninstalled gitlab entry, got %#v", notInstalled)
	}

	httpsEntry, ok := byName["ext"]
	if !ok {
		t.Fatalf("expected https entry ext, got %v", extensionNames(extensions))
	}
	if httpsEntry.Installed || httpsEntry.Version != "" {
		t.Fatalf("expected uninstalled https entry, got %#v", httpsEntry)
	}
}
