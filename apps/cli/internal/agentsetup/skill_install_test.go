package setup

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAddSkill_OfficialSkillUsesCanonicalSource(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	result, err := AddSkill(StartSkillName)
	if err != nil {
		t.Fatalf("add official skill: %v", err)
	}

	if !strings.HasSuffix(result.SkillPath, filepath.Join(".yishan", "skills", StartSkillName, "SKILL.md")) {
		t.Fatalf("unexpected skill path: %s", result.SkillPath)
	}

	content, err := os.ReadFile(result.SkillPath)
	if err != nil {
		t.Fatalf("read installed skill: %v", err)
	}
	if !strings.Contains(string(content), "name: ys-start") {
		t.Fatalf("expected installed official skill content, got %q", string(content))
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 1 || registry.Skills[0].SourceKind != SkillSourceOfficial {
		t.Fatalf("expected one official registry entry, got %#v", registry.Skills)
	}

	commandsPath := filepath.Join(homeDir, ".yishan", "opencode-config-home", "commands", StartSkillName+".md")
	if _, err := os.Stat(commandsPath); err != nil {
		t.Fatalf("expected opencode command file: %v", err)
	}

	info, err := GetSkillInfo(StartSkillName)
	if err != nil {
		t.Fatalf("get skill info: %v", err)
	}
	if !info.Installed || info.SourceKind != SkillSourceOfficial || info.Version == "" {
		t.Fatalf("unexpected skill info: %#v", info)
	}
}

func TestAddSkill_URLSourceAndUpdateSkill(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	skillContent := "---\nname: custom-skill\ndescription: First version\n---\n"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(skillContent))
	}))
	defer server.Close()

	if _, err := AddSkill(server.URL); err != nil {
		t.Fatalf("add URL skill: %v", err)
	}

	installedPath := filepath.Join(homeDir, ".yishan", "skills", "custom-skill", "SKILL.md")
	content, err := os.ReadFile(installedPath)
	if err != nil {
		t.Fatalf("read installed URL skill: %v", err)
	}
	if !strings.Contains(string(content), "First version") {
		t.Fatalf("expected first version content, got %q", string(content))
	}

	skillContent = "---\nname: custom-skill\ndescription: Second version\n---\n"

	if _, err := UpdateSkill("custom-skill"); err != nil {
		t.Fatalf("update URL skill: %v", err)
	}

	updatedContent, err := os.ReadFile(installedPath)
	if err != nil {
		t.Fatalf("read updated URL skill: %v", err)
	}
	if !strings.Contains(string(updatedContent), "Second version") {
		t.Fatalf("expected updated content, got %q", string(updatedContent))
	}
}

func TestRemoveSkill_RemovesRegistryAndSymlinks(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	if _, err := AddSkill(StartSkillName); err != nil {
		t.Fatalf("add skill: %v", err)
	}

	if err := RemoveSkill(StartSkillName); err != nil {
		t.Fatalf("remove skill: %v", err)
	}

	if _, err := os.Stat(filepath.Join(homeDir, ".yishan", "skills", StartSkillName)); !os.IsNotExist(err) {
		t.Fatalf("expected installed skill dir removed, got err=%v", err)
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 0 {
		t.Fatalf("expected empty registry after removal, got %#v", registry.Skills)
	}

	for _, path := range []string{
		filepath.Join(homeDir, ".config", "opencode", "skills", StartSkillName),
		filepath.Join(homeDir, ".claude", "skills", StartSkillName),
		filepath.Join(homeDir, ".agents", "skills", StartSkillName),
	} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("expected symlink removed at %s, err=%v", path, err)
		}
	}
}
