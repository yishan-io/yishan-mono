package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListSkills_DoesNotUseRemoteFallbackWhenCanonicalSkillsUnavailable(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	setCanonicalSkillsUnavailableForCatalog(t)
	setRemoteOfficialSkillLoaderForCatalog(t, func(name string) (map[string][]byte, string, error) {
		t.Fatalf("unexpected remote load for %s", name)
		return nil, "", fmt.Errorf("unexpected remote load")
	})

	infos, err := ListSkills()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}
	if len(infos) != len(OfficialSkillNames()) {
		t.Fatalf("expected %d official skills, got %d", len(OfficialSkillNames()), len(infos))
	}
}

func TestGetSkillInfo_OfficialSkillNotFoundLocallyWhenCanonicalSkillsUnavailable(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	setCanonicalSkillsUnavailableForCatalog(t)
	setRemoteOfficialSkillLoaderForCatalog(t, func(name string) (map[string][]byte, string, error) {
		t.Fatalf("unexpected remote load for %s", name)
		return nil, "", fmt.Errorf("unexpected remote load")
	})

	_, err := GetSkillInfo(BrainstormSkillName)
	if err == nil || err.Error() != fmt.Sprintf("unknown skill %q", BrainstormSkillName) {
		t.Fatalf("expected unknown skill error, got %v", err)
	}
}

func TestGetSkillInfo_OfficialSkillPreservesLocalReadErrorWhenCanonicalSkillsUnavailable(t *testing.T) {
	homeFile := filepath.Join(t.TempDir(), "home-file")
	if err := os.WriteFile(homeFile, []byte("not a dir"), 0o644); err != nil {
		t.Fatalf("write home file: %v", err)
	}
	t.Setenv("HOME", homeFile)
	setCanonicalSkillsUnavailableForCatalog(t)
	setRemoteOfficialSkillLoaderForCatalog(t, func(name string) (map[string][]byte, string, error) {
		t.Fatalf("unexpected remote load for %s", name)
		return nil, "", fmt.Errorf("unexpected remote load")
	})

	_, err := GetSkillInfo(BrainstormSkillName)
	if err == nil {
		t.Fatal("expected local read error")
	}
	if strings.Contains(err.Error(), "unknown skill") {
		t.Fatalf("expected underlying local read error, got %v", err)
	}
}

func TestGetSkillDetail_OfficialSkillUsesInstalledLocalCopyWhenCanonicalSkillsUnavailable(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	setCanonicalSkillsUnavailableForCatalog(t)
	setRemoteOfficialSkillLoaderForCatalog(t, func(name string) (map[string][]byte, string, error) {
		return map[string][]byte{
			"SKILL.md": []byte("---\nname: " + name + "\ndescription: remote copy\n---\n\n# Remote\n"),
		}, "remote-test", nil
	})

	if _, err := AddSkill(BrainstormSkillName); err != nil {
		t.Fatalf("add skill: %v", err)
	}

	setRemoteOfficialSkillLoaderForCatalog(t, func(name string) (map[string][]byte, string, error) {
		t.Fatalf("unexpected remote load for %s", name)
		return nil, "", fmt.Errorf("unexpected remote load")
	})

	detail, err := GetSkillDetail(BrainstormSkillName)
	if err != nil {
		t.Fatalf("get skill detail: %v", err)
	}
	if detail.Version != "remote-test" {
		t.Fatalf("expected installed version remote-test, got %s", detail.Version)
	}
	if detail.Files["SKILL.md"] != "---\nname: brainstorm\ndescription: remote copy\n---\n\n# Remote\n" {
		t.Fatalf("expected installed local skill file, got %q", detail.Files["SKILL.md"])
	}
	installedPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", BrainstormSkillName, "SKILL.md")
	if _, err := os.Stat(installedPath); err != nil {
		t.Fatalf("expected installed local skill file: %v", err)
	}
}

func setCanonicalSkillsUnavailableForCatalog(t *testing.T) {
	t.Helper()
	originalResolver := canonicalSkillsRootResolver
	canonicalSkillsRootResolver = func() (string, error) {
		return "", fmt.Errorf("canonical skills unavailable")
	}
	t.Cleanup(func() {
		canonicalSkillsRootResolver = originalResolver
	})
}

func setRemoteOfficialSkillLoaderForCatalog(t *testing.T, loader func(name string) (map[string][]byte, string, error)) {
	t.Helper()
	originalLoader := remoteOfficialSkillFilesLoader
	remoteOfficialSkillFilesLoader = loader
	t.Cleanup(func() {
		remoteOfficialSkillFilesLoader = originalLoader
	})
}
