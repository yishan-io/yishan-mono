package setup

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreatePiAgent_WritesFrontMatterAndBody(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	body := "## Steps\n\n1. Do the thing\n"

	if err := CreatePiAgent("my-helper", "Multi-line\ndescription \"quoted\"", body, "", "", nil); err != nil {
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

func TestCreatePiAgent_WritesToolsFrontmatter(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	if err := CreatePiAgent("tool-helper", "Helper", "# body\n", "", "", []string{"read", "grep", " bash "}); err != nil {
		t.Fatalf("CreatePiAgent: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "tool-helper.md"))
	if err != nil {
		t.Fatalf("read created agent: %v", err)
	}
	meta := parseAgentFrontMatter(content)
	if len(meta.Tools) != 3 || meta.Tools[0] != "read" || meta.Tools[1] != "grep" || meta.Tools[2] != "bash" {
		t.Fatalf("expected tools list [read grep bash], got %#v", meta.Tools)
	}
	if !strings.Contains(string(content), "\ntools:\n  - read\n  - grep\n  - bash\n") {
		t.Fatalf("expected tools block in frontmatter, got %q", string(content))
	}
	detail, err := GetPiAgentDetail("tool-helper")
	if err != nil {
		t.Fatalf("GetPiAgentDetail: %v", err)
	}
	if len(detail.Tools) != 3 || detail.Tools[2] != "bash" {
		t.Fatalf("expected detail to surface tools, got %#v", detail.Tools)
	}
}

func TestParseAgentFrontMatter_ToolsBlockAndInline(t *testing.T) {
	block := []byte("---\nname: block-helper\ndescription: Helper\ntools:\n  - read\n  - grep\nread_only: true\n---\n# body\n")
	meta := parseAgentFrontMatter(block)
	if len(meta.Tools) != 2 || meta.Tools[0] != "read" || meta.Tools[1] != "grep" {
		t.Fatalf("expected block tools [read grep], got %#v", meta.Tools)
	}

	inline := []byte("---\nname: inline-helper\ntools: [read, \"glob\", 'bash']\n---\n# body\n")
	meta = parseAgentFrontMatter(inline)
	if len(meta.Tools) != 3 || meta.Tools[0] != "read" || meta.Tools[1] != "glob" || meta.Tools[2] != "bash" {
		t.Fatalf("expected inline tools [read glob bash], got %#v", meta.Tools)
	}

	none := []byte("---\nname: no-tools\n---\n# body\n")
	if meta := parseAgentFrontMatter(none); len(meta.Tools) != 0 {
		t.Fatalf("expected no tools, got %#v", meta.Tools)
	}
}

func TestCreatePiAgent_WritesModelThinkingFrontmatter(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	if err := CreatePiAgent("model-helper", "Helper", "# body\n", "anthropic/claude-opus-4-5", "high", nil); err != nil {
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
	if err := CreatePiAgent("quoted-helper", "Helper", "# body\n", "provider/model with spaces", "high", nil); err != nil {
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
		if err := CreatePiAgent("x", "desc", "body", "", thinking, nil); !errors.Is(err, ErrInvalidAgentThinking) {
			t.Fatalf("expected ErrInvalidAgentThinking for %q, got %v", thinking, err)
		}
	}
	for _, thinking := range []string{"", "off", "minimal", "low", "medium", "high", "xhigh", "max"} {
		if err := CreatePiAgent("ok-helper-"+thinking, "desc", "body", "", thinking, nil); err != nil {
			t.Fatalf("unexpected error for thinking %q: %v", thinking, err)
		}
	}
}

func TestCreatePiAgent_RejectsInvalidSlug(t *testing.T) {
	withPiAgentsDir(t)
	for _, name := range []string{"", "My-Agent", "has space", "has.dot", "../evil"} {
		if err := CreatePiAgent(name, "desc", "body", "", "", nil); !errors.Is(err, ErrInvalidAgentName) {
			t.Fatalf("expected ErrInvalidAgentName for %q, got %v", name, err)
		}
	}
}

func TestCreatePiAgent_RejectsManagedName(t *testing.T) {
	withPiAgentsDir(t)
	if err := CreatePiAgent("general", "desc", "body", "", "", nil); !errors.Is(err, ErrManagedAgentName) {
		t.Fatalf("expected ErrManagedAgentName, got %v", err)
	}
}

func TestCreatePiAgent_RejectsDuplicate(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	writeAgentFile(t, agentsDir, "existing.md", "existing", "Existing", "# body\n")
	if err := CreatePiAgent("existing", "desc", "body", "", "", nil); !errors.Is(err, ErrAgentAlreadyExists) {
		t.Fatalf("expected ErrAgentAlreadyExists, got %v", err)
	}
}

func TestCreatePiAgent_DescriptionWithTabRoundTrips(t *testing.T) {
	agentsDir := withPiAgentsDir(t)
	description := "tab\tseparated description"
	if err := CreatePiAgent("tab-helper", description, "# body\n", "", "", nil); err != nil {
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
