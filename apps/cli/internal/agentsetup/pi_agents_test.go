package setup

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeAgentFile(t *testing.T, dir string, fileName string, frontMatterName string, description string, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	content := "---\nname: " + frontMatterName + "\ndescription: " + description + "\nread_only: false\n---\n" + body
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte(content), 0o644); err != nil {
		t.Fatalf("write agent file %s: %v", fileName, err)
	}
}

func withPiAgentsDir(t *testing.T) string {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	agentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	return agentsDir
}

func TestListPiAgents_ClassifiesOfficialAndUser(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "general.md", "general", "General agent", "# body\n")
	writeAgentFile(t, agentsDir, "custom-helper.md", "custom-helper", "My helper", "# custom\n")

	agents, err := ListPiAgents()
	if err != nil {
		t.Fatalf("ListPiAgents: %v", err)
	}
	byName := map[string]PiAgentInfo{}
	for _, agent := range agents {
		byName[agent.Name] = agent
	}
	official, ok := byName["general"]
	if !ok {
		t.Fatalf("expected general agent, got %#v", agents)
	}
	if !official.Official || official.Description != "General agent" {
		t.Fatalf("expected official general with description, got %#v", official)
	}
	user, ok := byName["custom-helper"]
	if !ok {
		t.Fatalf("expected custom-helper agent, got %#v", agents)
	}
	if user.Official || user.Description != "My helper" {
		t.Fatalf("expected user agent custom-helper, got %#v", user)
	}
}

func TestListPiAgents_EmptyOrMissingDir(t *testing.T) {
	withPiHome(t)
	agents, err := ListPiAgents()
	if err != nil {
		t.Fatalf("ListPiAgents: %v", err)
	}
	if len(agents) != 0 {
		t.Fatalf("expected no agents on clean home, got %#v", agents)
	}
}

func TestGetPiAgentDetail_ReturnsContent(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	body := "# body line one\n\nline two\n"
	writeAgentFile(t, agentsDir, "custom-helper.md", "custom-helper", "Helper", body)

	detail, err := GetPiAgentDetail("custom-helper")
	if err != nil {
		t.Fatalf("GetPiAgentDetail: %v", err)
	}
	if !strings.Contains(detail.Content, body) {
		t.Fatalf("expected body in detail content, got %q", detail.Content)
	}
	if detail.Official {
		t.Fatalf("expected user agent, got %#v", detail)
	}
	if _, err := GetPiAgentDetail("missing-agent"); !errors.Is(err, ErrAgentNotFound) {
		t.Fatalf("expected ErrAgentNotFound for unknown agent, got %v", err)
	}
}

func TestCreatePiAgent_WritesFrontMatterAndBody(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	body := "## Steps\n\n1. Do the thing\n"

	if err := CreatePiAgent("my-helper", "Multi-line\ndescription \"quoted\"", body, "", ""); err != nil {
		t.Fatalf("CreatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "my-helper.md"))
	if err != nil {
		t.Fatalf("read created agent: %v", err)
	}
	if !strings.Contains(string(content), body) {
		t.Fatalf("expected body in created agent, got %q", string(content))
	}
	meta := parseAgentFrontMatter(content)
	if meta.Name != "my-helper" {
		t.Fatalf("frontmatter name = %q", meta.Name)
	}
	if meta.Description != "Multi-line\ndescription \"quoted\"" {
		t.Fatalf("frontmatter description = %q", meta.Description)
	}
	if strings.Contains(string(content), "model:") || strings.Contains(string(content), "thinking:") {
		t.Fatalf("model/thinking must be omitted when not provided: %q", string(content))
	}
	if !strings.Contains(string(content), "read_only: false") {
		t.Fatalf("expected read_only: false in frontmatter, got %q", string(content))
	}
}

func TestCreatePiAgent_WritesModelThinkingFrontmatter(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	if err := CreatePiAgent("model-helper", "Helper", "# body\n", "anthropic/claude-opus-4-5", "high"); err != nil {
		t.Fatalf("CreatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "model-helper.md"))
	if err != nil {
		t.Fatalf("read created agent: %v", err)
	}
	meta := parseAgentFrontMatter(content)
	if meta.Model != "anthropic/claude-opus-4-5" || meta.Thinking != "high" {
		t.Fatalf("expected model/thinking in frontmatter, got model=%q thinking=%q", meta.Model, meta.Thinking)
	}
	// Detail surfaces the frontmatter values (the definition file is the
	// single source of truth for model/thinking).
	detail, err := GetPiAgentDetail("model-helper")
	if err != nil {
		t.Fatalf("GetPiAgentDetail: %v", err)
	}
	if detail.Model != "anthropic/claude-opus-4-5" || detail.Thinking != "high" {
		t.Fatalf("expected detail to surface frontmatter model/thinking, got model=%q thinking=%q", detail.Model, detail.Thinking)
	}
}

func TestCreatePiAgent_QuotesModelFrontmatterValue(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	if err := CreatePiAgent("quoted-helper", "Helper", "# body\n", "provider/model with spaces", "high"); err != nil {
		t.Fatalf("CreatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "quoted-helper.md"))
	if err != nil {
		t.Fatalf("read created agent: %v", err)
	}
	if !strings.Contains(string(content), `model: "provider/model with spaces"`) {
		t.Fatalf("expected quoted model in frontmatter, got %q", string(content))
	}
	meta := parseAgentFrontMatter(content)
	if meta.Model != "provider/model with spaces" {
		t.Fatalf("expected model round-trip, got %q", meta.Model)
	}
}

func TestCreatePiAgent_RejectsInvalidThinking(t *testing.T) {
	withPiAgentsDir(t)
	for _, thinking := range []string{"ultra", "HIGH", "1", "deep"} {
		if err := CreatePiAgent("x", "desc", "body", "", thinking); !errors.Is(err, ErrInvalidAgentThinking) {
			t.Fatalf("expected ErrInvalidAgentThinking for %q, got %v", thinking, err)
		}
	}
	for _, thinking := range []string{"", "off", "minimal", "low", "medium", "high", "xhigh", "max"} {
		if err := CreatePiAgent("ok-helper-"+thinking, "desc", "body", "", thinking); err != nil {
			t.Fatalf("unexpected error for thinking %q: %v", thinking, err)
		}
	}
}

func TestCreatePiAgent_RejectsInvalidSlug(t *testing.T) {
	withPiAgentsDir(t)
	for _, name := range []string{"", "My-Agent", "has space", "has.dot", "../evil"} {
		if err := CreatePiAgent(name, "desc", "body", "", ""); !errors.Is(err, ErrInvalidAgentName) {
			t.Fatalf("expected ErrInvalidAgentName for %q, got %v", name, err)
		}
	}
}

func TestCreatePiAgent_RejectsManagedName(t *testing.T) {
	withPiAgentsDir(t)
	if err := CreatePiAgent("general", "desc", "body", "", ""); !errors.Is(err, ErrManagedAgentName) {
		t.Fatalf("expected ErrManagedAgentName, got %v", err)
	}
}

func TestCreatePiAgent_RejectsDuplicate(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "existing.md", "existing", "Existing", "# body\n")
	if err := CreatePiAgent("existing", "desc", "body", "", ""); !errors.Is(err, ErrAgentAlreadyExists) {
		t.Fatalf("expected ErrAgentAlreadyExists, got %v", err)
	}
}

func TestUpdatePiAgent_OverwritesOfficialContent(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "general.md", "general", "General agent", "# shipped\n")

	if err := UpdatePiAgent("general", "---\nname: general\ndescription: General agent\n---\n# my override\n"); err != nil {
		t.Fatalf("UpdatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "general.md"))
	if err != nil {
		t.Fatalf("read updated agent: %v", err)
	}
	if !strings.Contains(string(content), "# my override") {
		t.Fatalf("expected overridden content, got %q", string(content))
	}
}

func TestUpdatePiAgent_UnknownNameFails(t *testing.T) {
	withPiAgentsDir(t)
	if err := UpdatePiAgent("nope", "# body\n"); !errors.Is(err, ErrAgentNotFound) {
		t.Fatalf("expected ErrAgentNotFound, got %v", err)
	}
}

func TestUpdatePiAgent_RejectsFrontmatterNameMismatch(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "general.md", "general", "General agent", "# body\n")
	if err := UpdatePiAgent("general", "---\nname: renamed\ndescription: General\n---\n# body\n"); !errors.Is(err, ErrInvalidAgentName) {
		t.Fatalf("expected ErrInvalidAgentName for frontmatter mismatch, got %v", err)
	}
}

func TestRemovePiAgent_UserAgentRemoved(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "custom-helper.md", "custom-helper", "Helper", "# body\n")

	if err := RemovePiAgent("custom-helper"); err != nil {
		t.Fatalf("RemovePiAgent: %v", err)
	}
	if _, err := os.Stat(filepath.Join(agentsDir, "custom-helper.md")); !os.IsNotExist(err) {
		t.Fatalf("expected agent file removed, err=%v", err)
	}
}

func TestRemovePiAgent_OfficialRejected(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "general.md", "general", "General agent", "# body\n")
	if err := RemovePiAgent("general"); !errors.Is(err, ErrOfficialAgentCannotBeRemoved) {
		t.Fatalf("expected ErrOfficialAgentCannotBeRemoved, got %v", err)
	}
}

func TestRemovePiAgent_UnsafeNameRejected(t *testing.T) {
	withPiAgentsDir(t)
	for _, name := range []string{"", "../evil", "a/b", "general.md"} {
		if err := RemovePiAgent(name); !errors.Is(err, ErrInvalidAgentName) {
			t.Fatalf("expected ErrInvalidAgentName for %q, got %v", name, err)
		}
	}
}

func TestRestorePiAgent_ForcesOfficialContentAndRefreshesManifest(t *testing.T) {
	homeDir := withPiHome(t)
	agentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	sourceDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-subagents", "agents")
	shipped := "---\nname: general\ndescription: General agent\nread_only: false\n---\n# shipped content\n"
	writeAgentFile(t, sourceDir, "general.md", "general", "General agent", "# shipped content\n")
	writeAgentFile(t, agentsDir, "general.md", "general", "General agent", "# shipped content\n")

	// User overwrites the official agent.
	if err := UpdatePiAgent("general", "---\nname: general\ndescription: General agent\n---\n# user override\n"); err != nil {
		t.Fatalf("UpdatePiAgent: %v", err)
	}

	if err := RestorePiAgent("general"); err != nil {
		t.Fatalf("RestorePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "general.md"))
	if err != nil {
		t.Fatalf("read restored agent: %v", err)
	}
	if string(content) != shipped {
		t.Fatalf("expected shipped content after restore, got %q", string(content))
	}
	// Manifest refreshed: a subsequent sync sees an untouched file (no-op).
	if err := syncManagedPiAgentFile(sourceDir, agentsDir, "general.md"); err != nil {
		t.Fatalf("sync after restore: %v", err)
	}
	if string(content) != shipped {
		t.Fatalf("sync must not rewrite restored content, got %q", string(content))
	}
}

func TestRestorePiAgent_UserAgentNotManaged(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "custom-helper.md", "custom-helper", "Helper", "# body\n")
	if err := RestorePiAgent("custom-helper"); !errors.Is(err, ErrAgentNotManaged) {
		t.Fatalf("expected ErrAgentNotManaged, got %v", err)
	}
}

func TestSyncManagedPiAgentFile_PreservesUserModified(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "---\nname: general\ndescription: General\n---\n# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	// First sync writes the file and records the manifest hash.
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}
	// User modifies the file.
	userEdit := shipped + "# user edit\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write user edit: %v", err)
	}
	// Second sync must preserve the edit.
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_MissingManifestKeepsEdits(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	userEdit := "# user edit from pre-upgrade install\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved without manifest, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_CorruptManifestKeepsEdits(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	userEdit := "# user edit\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}
	if err := os.WriteFile(filepath.Join(targetDir, ".managed.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatalf("write corrupt manifest: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved with corrupt manifest, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_FreshInstallWritesAll(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != shipped {
		t.Fatalf("expected shipped content on fresh install, got %q", string(content))
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] == "" {
		t.Fatal("expected manifest hash recorded after fresh write")
	}
}

func TestSyncManagedPiAgentFile_PropagatesSourceUpdateToUntouchedFile(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	v1 := "# v1\n"
	v2 := "# v2\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v1), 0o644); err != nil {
		t.Fatalf("write source v1: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}
	// Shipped source advances; the target is untouched (hash matches manifest).
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v2), 0o644); err != nil {
		t.Fatalf("write source v2: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != v2 {
		t.Fatalf("expected official update propagated to untouched file, got %q", string(content))
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] != fileSHA256Bytes([]byte(v2)) {
		t.Fatal("expected manifest refreshed after official update")
	}
}

func TestSyncManagedPiAgentFile_NoManifestIdenticalFileHealsBaseline(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	// Pre-upgrade install: file on disk identical to source, no manifest yet.
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] != fileSHA256Bytes([]byte(shipped)) {
		t.Fatal("expected identical no-manifest file to heal its manifest baseline")
	}
	// And the healed baseline lets a later source update propagate.
	v2 := "# v2\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v2), 0o644); err != nil {
		t.Fatalf("write source v2: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != v2 {
		t.Fatalf("expected healed baseline to propagate update, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_PreservesUpdatePiAgentOverwrite(t *testing.T) {
	homeDir := withPiHome(t)
	agentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	sourceDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-subagents", "agents")
	shipped := "---\nname: general\ndescription: General\nread_only: false\n---\n# shipped\n"
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		t.Fatalf("create agents dir: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, agentsDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}

	overwrite := "---\nname: general\ndescription: General\n---\n# my override via RPC\n"
	if err := UpdatePiAgent("general", overwrite); err != nil {
		t.Fatalf("UpdatePiAgent: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, agentsDir, "general.md"); err != nil {
		t.Fatalf("sync after overwrite: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != overwrite {
		t.Fatalf("expected RPC overwrite preserved across sync, got %q", string(content))
	}
}

func TestCreatePiAgent_DescriptionWithTabRoundTrips(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	description := "tab\tseparated description"
	if err := CreatePiAgent("tab-helper", description, "# body\n", "", ""); err != nil {
		t.Fatalf("CreatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "tab-helper.md"))
	if err != nil {
		t.Fatalf("read created agent: %v", err)
	}
	meta := parseAgentFrontMatter(content)
	if meta.Description != description {
		t.Fatalf("expected tab round-trip, got %q", meta.Description)
	}
}
