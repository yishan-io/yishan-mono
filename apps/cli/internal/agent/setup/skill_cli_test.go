package setup

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestSkillCliOps_InvokeNpxSkills(t *testing.T) {
	skipHermeticBinaryResolutionOnWindows(t)
	withPiHome(t)
	fakeNpxPath := stubManagedPiEnvWithFakeBinary(t, "npx")
	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()

	type recordedCall struct {
		name string
		args []string
	}
	calls := make([]recordedCall, 0, 4)
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		calls = append(calls, recordedCall{name: name, args: append([]string{}, args...)})
		return exec.Command("true")
	}

	if err := AddSkill(context.Background(), "owner/repo"); err != nil {
		t.Fatalf("AddSkill: %v", err)
	}
	if err := UpdateSkill(context.Background(), "my-skill"); err != nil {
		t.Fatalf("UpdateSkill: %v", err)
	}
	if err := RemoveSkill(context.Background(), "my-skill"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if err := UpdateAllSkills(context.Background()); err != nil {
		t.Fatalf("UpdateAllSkills: %v", err)
	}

	wantArgs := [][]string{
		{"--yes", "skills", "add", "owner/repo", "--global", "--yes"},
		{"--yes", "skills", "update", "my-skill", "--global", "--yes"},
		{"--yes", "skills", "remove", "my-skill", "--global", "--yes"},
		{"--yes", "skills", "update", "--global", "--yes"},
	}
	if len(calls) != len(wantArgs) {
		t.Fatalf("expected %d npx calls, got %d", len(wantArgs), len(calls))
	}
	for index, call := range calls {
		if call.name != fakeNpxPath {
			t.Fatalf("call %d: expected npx command resolved to %q, got %q", index, fakeNpxPath, call.name)
		}
		if strings.Join(call.args, "|") != strings.Join(wantArgs[index], "|") {
			t.Fatalf("call %d: expected args %v, got %v", index, wantArgs[index], call.args)
		}
	}
}

func TestRemoveSkill_DeletesUntrackedSkillDir(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	homeDir, _ := os.UserHomeDir()
	userSkillsDir := filepath.Join(homeDir, ".agents", "skills")
	writeSkill(t, userSkillsDir, "hand-made", "Hand-made skill")

	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	// The CLI reports success but knows nothing about the hand-installed
	// skill; the direct-delete fallback must remove it.
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	if err := RemoveSkill(context.Background(), "hand-made"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if _, err := os.Stat(filepath.Join(userSkillsDir, "hand-made")); !os.IsNotExist(err) {
		t.Fatalf("expected hand-installed skill dir removed, err=%v", err)
	}
}

func TestRemoveSkill_KeepsTrackedSkillWhenCliRemovedIt(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	homeDir, _ := os.UserHomeDir()
	userSkillsDir := filepath.Join(homeDir, ".agents", "skills")

	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	// No dir on disk at all (the CLI's own manifest entry is gone too): the
	// fallback must not error or create anything.
	if err := RemoveSkill(context.Background(), "cli-tracked-skill"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if _, err := os.Stat(userSkillsDir); err == nil {
		entries, _ := os.ReadDir(userSkillsDir)
		if len(entries) != 0 {
			t.Fatalf("expected no leftovers in user skills dir, got %v", entries)
		}
	}
}

func TestRemoveSkill_RejectsUnsafeName(t *testing.T) {
	withPiHome(t)
	for _, name := range []string{"", "a/b", "../evil", "/abs/path", ".."} {
		if err := RemoveSkill(context.Background(), name); err == nil {
			t.Fatalf("expected error for unsafe name %q", name)
		}
	}
}

func TestAddSkill_FailureIncludesOutput(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("false")
	}

	err := AddSkill(context.Background(), "owner/repo")
	if err == nil {
		t.Fatal("expected error for failing skills command")
	}
	if !strings.Contains(err.Error(), "skills add owner/repo --global --yes failed") {
		t.Fatalf("expected command context in error, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "exit status 1") {
		t.Fatalf("expected wrapped exit error, got %q", err.Error())
	}
}

func TestPiInstall_FailureIncludesOutput(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "pi")
	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("false")
	}

	err := InstallPiExtension(context.Background(), "npm:broken-pkg")
	if err == nil {
		t.Fatal("expected error for failing pi command")
	}
	if !strings.Contains(err.Error(), "pi install npm:broken-pkg failed") {
		t.Fatalf("expected command context in error, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "exit status 1") {
		t.Fatalf("expected wrapped exit error, got %q", err.Error())
	}
}

func TestListSkills_OfficialYishanPackageSkill(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:@yishan-io/pi-task"}, nil)
	writeNPMPackage(t, "@yishan-io/pi-task", map[string]string{"starting-task": "Starting task skill"}, []string{"./skills"})

	infos, err := ListSkills("")
	if err != nil {
		t.Fatalf("ListSkills: %v", err)
	}
	var official *SkillInfo
	for index := range infos {
		if infos[index].Name == "starting-task" {
			official = &infos[index]
			break
		}
	}
	if official == nil {
		t.Fatalf("expected @yishan-io package skill in list, got %#v", infos)
	}
	if !official.Official {
		t.Fatalf("expected @yishan-io package skill to be official, got %#v", *official)
	}
}

func TestListSkills_PackageSkillWithYishanLikePrefixStaysUserInstalled(t *testing.T) {
	withPiHome(t)
	// @yishan-io-evil is NOT under the @yishan-io scope dir; the prefix check
	// must not match it.
	writeAgentSettings(t, []string{"npm:@yishan-io-evil/pkg"}, nil)
	writeNPMPackage(t, "@yishan-io-evil/pkg", map[string]string{"evil-skill": "Evil skill"}, []string{"./skills"})

	infos, err := ListSkills("")
	if err != nil {
		t.Fatalf("ListSkills: %v", err)
	}
	var found *SkillInfo
	for index := range infos {
		if infos[index].Name == "evil-skill" {
			found = &infos[index]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected evil-skill in list, got %#v", infos)
	}
	if found.Official {
		t.Fatalf("expected @yishan-io-evil package skill to stay user-installed, got %#v", *found)
	}
}

func TestRemoveSkill_FindsSkillBySanitizedDirName(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	homeDir, _ := os.UserHomeDir()
	userSkillsDir := filepath.Join(homeDir, ".agents", "skills")
	// The CLI installs dirs under the sanitized name while the frontmatter
	// name (what the daemon lists) keeps its spaces.
	dir := filepath.Join(userSkillsDir, "web-design-guidelines")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	content := "---\nname: Web Design Guidelines\ndescription: Design skill\n---\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}

	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	if err := RemoveSkill(context.Background(), "Web Design Guidelines"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("expected sanitized skill dir removed, err=%v", err)
	}
}

func TestRemoveSkill_SanitizedFallbackSkipsDifferentSkill(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	homeDir, _ := os.UserHomeDir()
	userSkillsDir := filepath.Join(homeDir, ".agents", "skills")
	// The requested name sanitizes to the same dir as an existing DIFFERENT
	// skill; the fallback must not delete it. "Web-Design Guidelines" and
	// "Web Design Guidelines" both sanitize to web-design-guidelines.
	dir := filepath.Join(userSkillsDir, "web-design-guidelines")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	content := "---\nname: Web-Design Guidelines\ndescription: Unrelated skill\n---\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}

	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	if err := RemoveSkill(context.Background(), "Web Design Guidelines"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("expected unrelated skill preserved, err=%v", err)
	}
}

func TestRemoveSkill_SanitizedFallbackCaseInsensitiveMatch(t *testing.T) {
	withPiHome(t)
	stubManagedPiEnvWithFakeBinary(t, "npx")
	homeDir, _ := os.UserHomeDir()
	userSkillsDir := filepath.Join(homeDir, ".agents", "skills")
	// Frontmatter name and the requested name differ only in case; the
	// sanitized-dir fallback still matches.
	dir := filepath.Join(userSkillsDir, "simple-english")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	content := "---\nname: Simple English\ndescription: Write clearly\n---\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}

	originalExecCommand := execCommandContext
	defer func() {
		execCommandContext = originalExecCommand
	}()
	execCommandContext = func(_ context.Context, name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	if err := RemoveSkill(context.Background(), "Simple English"); err != nil {
		t.Fatalf("RemoveSkill: %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("expected matching sanitized skill removed, err=%v", err)
	}
}
