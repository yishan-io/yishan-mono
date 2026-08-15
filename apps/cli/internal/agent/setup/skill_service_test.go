package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListSkills_DiscoveredOnlySkillShowsSourceKind(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pi-mcp-adapter"}, nil)
	writeNPMPackage(t, "pi-mcp-adapter", map[string]string{"mcp-scripting": "MCP scripting skill"}, []string{"./skills"})

	infos, err := ListSkills("")
	if err != nil {
		t.Fatalf("ListSkills: %v", err)
	}
	if len(infos) != 1 {
		t.Fatalf("expected 1 skill, got %d: %#v", len(infos), infos)
	}
	info := infos[0]
	if info.Name != "mcp-scripting" {
		t.Fatalf("name = %q", info.Name)
	}
	if info.SourceKind != SkillSourcePackage || info.Official {
		t.Fatalf("expected package kind, got %#v", info)
	}
	if !info.Installed {
		t.Fatal("expected installed=true")
	}
	if info.CanUpdate {
		t.Fatal("expected canUpdate=false for discovered-only skill")
	}
	if !strings.Contains(info.Source, "pi-mcp-adapter") {
		t.Fatalf("expected package name source label, got %q", info.Source)
	}
}

func TestGetSkillInfo_WorksForDiscoveredOnlySkill(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pkg"}, nil)
	writeNPMPackage(t, "pkg", map[string]string{"pkg-skill": "Package skill"}, []string{"./skills"})

	info, err := GetSkillInfo("pkg-skill", "")
	if err != nil {
		t.Fatalf("GetSkillInfo: %v", err)
	}
	if info.Name != "pkg-skill" || info.SourceKind != SkillSourcePackage {
		t.Fatalf("unexpected info: %#v", info)
	}
	if _, err := GetSkillInfo("missing-skill", ""); err == nil {
		t.Fatal("expected error for unknown skill")
	}
}

func TestGetSkillDetail_ResolvesPackageSkillContent(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:@yishan-io/pi-dev-flow"}, nil)
	writeNPMPackage(t, "@yishan-io/pi-dev-flow", map[string]string{"brainstorm": "Brainstorm skill"}, []string{"./skills"})

	detail, err := GetSkillDetail("brainstorm", "")
	if err != nil {
		t.Fatalf("GetSkillDetail: %v", err)
	}
	content, ok := detail.Files["SKILL.md"]
	if !ok {
		t.Fatalf("expected SKILL.md in files, got %v", keysOf(detail.Files))
	}
	if !strings.Contains(content, "name: brainstorm") {
		t.Fatalf("expected frontmatter in content, got %q", content)
	}
}

func TestGetSkillDetail_ResolvesUserSkillsDirContent(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	writeSkill(t, filepath.Join(homeDir, ".agents", "skills"), "find-skills", "Find skills skill")

	detail, err := GetSkillDetail("find-skills", "")
	if err != nil {
		t.Fatalf("GetSkillDetail: %v", err)
	}
	if !strings.Contains(detail.Files["SKILL.md"], "name: find-skills") {
		t.Fatalf("unexpected content: %q", detail.Files["SKILL.md"])
	}
	if detail.SourceKind != SkillSourceGlobal {
		t.Fatalf("expected global kind, got %q", detail.SourceKind)
	}
}

func TestGetSkillDetail_UnknownNameErrors(t *testing.T) {
	withPiHome(t)
	if _, err := GetSkillDetail("not-a-skill", ""); err == nil {
		t.Fatal("expected error for unknown skill")
	}
}

func keysOf(files map[string]string) []string {
	keys := make([]string, 0, len(files))
	for key := range files {
		keys = append(keys, key)
	}
	return keys
}

func TestParseSkillFrontMatter_YAMLBlockScalarDescription(t *testing.T) {
	content := []byte("---\nname: simple-english\nversion: 1.0.0\ndescription: |\n  Write technical text clearly.\n  Follow the standard's 53 rules.\nlicense: MIT\n---\n")
	meta := parseSkillFrontMatter(content)
	if meta.Name != "simple-english" {
		t.Fatalf("name = %q", meta.Name)
	}
	if meta.Description != "Write technical text clearly. Follow the standard's 53 rules." {
		t.Fatalf("description = %q", meta.Description)
	}
}

func TestParseSkillFrontMatter_BlockScalarChompingVariants(t *testing.T) {
	for _, indicator := range []string{"|", "|-", "|+", ">", ">-", ">+"} {
		content := []byte("---\ndescription: " + indicator + "\n  folded value line one\n  folded value line two\n---\n")
		meta := parseSkillFrontMatter(content)
		if meta.Description != "folded value line one folded value line two" {
			t.Fatalf("indicator %q: description = %q", indicator, meta.Description)
		}
	}
}
