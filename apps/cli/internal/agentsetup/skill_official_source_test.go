package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestAddSkill_OfficialSkillFallsBackToRemoteSourceWhenCanonicalSkillsUnavailable(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	setCanonicalSkillsUnavailable(t)
	setRemoteOfficialSkillLoader(t, func(name string) (map[string][]byte, string, error) {
		return map[string][]byte{
			"SKILL.md": []byte("---\nname: " + name + "\ndescription: remote copy\n---\n\n# Remote\n"),
		}, "remote-test", nil
	})

	result, err := AddSkill(BrainstormSkillName)
	if err != nil {
		t.Fatalf("add official skill with remote fallback: %v", err)
	}

	expectedPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", BrainstormSkillName, "SKILL.md")
	if result.SkillPath != expectedPath {
		t.Fatalf("expected skill path %s, got %s", expectedPath, result.SkillPath)
	}
	content, err := os.ReadFile(expectedPath)
	if err != nil {
		t.Fatalf("read installed skill file: %v", err)
	}
	if string(content) != "---\nname: brainstorm\ndescription: remote copy\n---\n\n# Remote\n" {
		t.Fatalf("expected installed skill to come from remote fallback, got %q", string(content))
	}
}

func TestEnsureOfficialSkills_FallsBackToRemoteSourceWhenCanonicalSkillsUnavailable(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	setCanonicalSkillsUnavailable(t)
	setRemoteOfficialSkillLoader(t, func(name string) (map[string][]byte, string, error) {
		return map[string][]byte{
			"SKILL.md": []byte("---\nname: " + name + "\ndescription: remote copy\n---\n\n# " + name + "\n"),
		}, "remote-test", nil
	})

	results, err := EnsureOfficialSkills()
	if err != nil {
		t.Fatalf("ensure official skills with remote fallback: %v", err)
	}
	if len(results) != len(OfficialSkillNames()) {
		t.Fatalf("expected %d installed skills, got %d", len(OfficialSkillNames()), len(results))
	}
	for _, skillName := range OfficialSkillNames() {
		expectedPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", skillName, "SKILL.md")
		if _, err := os.Stat(expectedPath); err != nil {
			t.Fatalf("expected installed skill %s: %v", skillName, err)
		}
	}
}

func TestLoadAuthoritativeOfficialSkillFiles_UsesRemoteSourceWhenCanonicalSkillsUnavailable(t *testing.T) {
	setCanonicalSkillsUnavailable(t)
	setRemoteOfficialSkillLoader(t, func(name string) (map[string][]byte, string, error) {
		if name != BrainstormSkillName {
			return nil, "", fmt.Errorf("unexpected skill %s", name)
		}
		return map[string][]byte{
			"SKILL.md": []byte("---\nname: brainstorm\n---\n"),
			"extra.md": []byte("remote-extra\n"),
		}, "remote-test", nil
	})

	files, version, err := loadAuthoritativeOfficialSkillFiles(BrainstormSkillName)
	if err != nil {
		t.Fatalf("load authoritative official skill files: %v", err)
	}
	if version != "remote-test" {
		t.Fatalf("expected remote-test version, got %s", version)
	}
	if string(files["extra.md"]) != "remote-extra\n" {
		t.Fatalf("expected remote extra file, got %#v", files)
	}
}

func setCanonicalSkillsUnavailable(t *testing.T) {
	t.Helper()
	originalResolver := canonicalSkillsRootResolver
	canonicalSkillsRootResolver = func() (string, error) {
		return "", fmt.Errorf("canonical skills unavailable")
	}
	t.Cleanup(func() {
		canonicalSkillsRootResolver = originalResolver
	})
}

func setRemoteOfficialSkillLoader(t *testing.T, loader func(name string) (map[string][]byte, string, error)) {
	t.Helper()
	originalLoader := remoteOfficialSkillFilesLoader
	remoteOfficialSkillFilesLoader = loader
	t.Cleanup(func() {
		remoteOfficialSkillFilesLoader = originalLoader
	})
}
