package setup

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
