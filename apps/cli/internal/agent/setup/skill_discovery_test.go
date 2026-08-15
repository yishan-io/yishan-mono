package setup

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
)

// agentHomeDirForRealInstall resolves the real pi agent dir, used by the
// real-layout smoke test which deliberately avoids any $HOME override.
func agentHomeDirForRealInstall() (string, error) {
	return config.ManagedPiAgentDir()
}

// writeSkill creates a skill dir with a SKILL.md frontmatter pair.
func writeSkill(t *testing.T, dir, name, description string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, name), 0o755); err != nil {
		t.Fatalf("mkdir skill %s: %v", name, err)
	}
	content := "---\nname: " + name + "\ndescription: " + description + "\n---\n# " + name + "\n"
	if err := os.WriteFile(filepath.Join(dir, name, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write SKILL.md for %s: %v", name, err)
	}
}

// writeRootSkill creates a bare root-level .md skill file.
func writeRootSkill(t *testing.T, dir, name, description string) {
	t.Helper()
	content := "---\nname: " + name + "\ndescription: " + description + "\n---\n"
	if err := os.WriteFile(filepath.Join(dir, name+".md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write root skill %s: %v", name, err)
	}
}

// withPiHome lays out a temp HOME with the pi agent dir structure and points
// the default resolvers at it via $HOME.
func withPiHome(t *testing.T) string {
	t.Helper()
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	agentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	if err := os.MkdirAll(filepath.Join(agentDir, "npm", "node_modules"), 0o755); err != nil {
		t.Fatalf("create agent dirs: %v", err)
	}
	return homeDir
}

func writeAgentSettings(t *testing.T, packages []string, skills []string) {
	t.Helper()
	homeDir, _ := os.UserHomeDir()
	path := filepath.Join(homeDir, ".yishan", "pi", "agent", "settings.json")
	quoted := func(entries []string) string {
		quotedEntries := make([]string, len(entries))
		for idx, entry := range entries {
			quotedEntries[idx] = `"` + entry + `"`
		}
		return strings.Join(quotedEntries, ", ")
	}
	content := "{"
	if len(packages) > 0 {
		content += `"packages": [` + quoted(packages) + `]`
	}
	if len(skills) > 0 {
		if len(packages) > 0 {
			content += ", "
		}
		content += `"skills": [` + quoted(skills) + `]`
	}
	content += "}"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}
}

func writeTrust(t *testing.T, decisions map[string]bool) {
	t.Helper()
	homeDir, _ := os.UserHomeDir()
	path := filepath.Join(homeDir, ".yishan", "pi", "agent", "trust.json")
	content := "{"
	parts := []string{}
	for pathEntry, trusted := range decisions {
		// pi canonicalizes trust keys with realpath; resolve so temp dirs
		// under symlinked roots (e.g. /var -> /private/var on macOS) match.
		resolved := pathEntry
		if r, err := filepath.EvalSymlinks(pathEntry); err == nil {
			resolved = r
		}
		parts = append(parts, `"`+resolved+`": `+boolString(trusted))
	}
	content += strings.Join(parts, ", ") + "}"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write trust.json: %v", err)
	}
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func writeNPMPackage(t *testing.T, pkgName string, skills map[string]string, piManifest []string) {
	t.Helper()
	homeDir, _ := os.UserHomeDir()
	pkgDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", filepath.FromSlash(pkgName))
	if err := os.MkdirAll(pkgDir, 0o755); err != nil {
		t.Fatalf("mkdir package %s: %v", pkgName, err)
	}
	if err := os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"`+pkgName+`","version":"1.2.3"}`), 0o644); err != nil {
		t.Fatalf("write package.json for %s: %v", pkgName, err)
	}
	if piManifest != nil {
		manifest := `{"pi":{"skills":["` + strings.Join(piManifest, `","`) + `"]}}`
		if err := os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"`+pkgName+`","version":"1.2.3",`+manifest[1:]), 0o644); err != nil {
			t.Fatalf("write manifest for %s: %v", pkgName, err)
		}
	}
	skillsDir := filepath.Join(pkgDir, "skills")
	for skillName, description := range skills {
		if err := os.MkdirAll(filepath.Join(skillsDir, skillName), 0o755); err != nil {
			t.Fatalf("mkdir package skill %s: %v", skillName, err)
		}
		content := "---\nname: " + skillName + "\ndescription: " + description + "\n---\n"
		if err := os.WriteFile(filepath.Join(skillsDir, skillName, "SKILL.md"), []byte(content), 0o644); err != nil {
			t.Fatalf("write package skill %s: %v", skillName, err)
		}
	}
}

func namesOf(skills []DiscoveredSkill) []string {
	names := make([]string, 0, len(skills))
	for _, skill := range skills {
		names = append(names, skill.Name)
	}
	return names
}

func TestScanSkillDir_FindsNestedSKILLDirSkills(t *testing.T) {
	root := t.TempDir()
	writeSkill(t, root, "alpha", "Alpha skill")
	writeSkill(t, filepath.Join(root, "nested"), "beta", "Beta skill")

	skills, err := scanSkillDir(root, SkillSourceGlobal, false)
	if err != nil {
		t.Fatalf("scanSkillDir: %v", err)
	}
	names := namesOf(skills)
	sort.Strings(names)
	if strings.Join(names, ",") != "alpha,beta" {
		t.Fatalf("expected alpha,beta, got %v", names)
	}
}

func TestScanSkillDir_SKILLRootStopsRecursion(t *testing.T) {
	root := t.TempDir()
	writeSkill(t, root, "root-skill", "Root skill")
	writeSkill(t, filepath.Join(root, "root-skill", "sub"), "hidden", "Should not be scanned")

	skills, err := scanSkillDir(root, SkillSourceGlobal, false)
	if err != nil {
		t.Fatalf("scanSkillDir: %v", err)
	}
	if names := namesOf(skills); len(names) != 1 || names[0] != "root-skill" {
		t.Fatalf("expected only root-skill, got %v", names)
	}
}

func TestScanSkillDir_RootMarkdownAllowedOnlyWithAllowRootMD(t *testing.T) {
	dir := t.TempDir()
	writeRootSkill(t, dir, "bare", "Bare root skill")
	writeSkill(t, dir, "packaged", "Packaged skill")

	allowed, err := scanSkillDir(dir, SkillSourceGlobal, true)
	if err != nil {
		t.Fatalf("scanSkillDir(allowRootMD): %v", err)
	}
	if names := namesOf(allowed); strings.Join(names, ",") != "bare,packaged" {
		t.Fatalf("allowRootMD: expected bare,packaged, got %v", names)
	}

	disallowed, err := scanSkillDir(dir, SkillSourceGlobal, false)
	if err != nil {
		t.Fatalf("scanSkillDir(no root md): %v", err)
	}
	if names := namesOf(disallowed); strings.Join(names, ",") != "packaged" {
		t.Fatalf("no root md: expected packaged, got %v", names)
	}
}

func TestScanSkillDir_SkipsFilesWithoutDescription(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "node_modules", "dep"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	writeSkill(t, dir, "real", "Real skill")
	writeRootSkill(t, dir, "no-description", "")
	writeRootSkill(t, filepath.Join(dir, "node_modules", "dep"), "hidden-by-node-modules", "Hidden skill")

	skills, err := scanSkillDir(dir, SkillSourceGlobal, true)
	if err != nil {
		t.Fatalf("scanSkillDir: %v", err)
	}
	if names := namesOf(skills); strings.Join(names, ",") != "real" {
		t.Fatalf("expected only real, got %v", names)
	}
}

func TestEnumeratePiSkills_MergesSourcesWithPrecedence(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()

	// Project layout (trusted).
	projectDir := filepath.Join(homeDir, "proj")
	if err := os.MkdirAll(filepath.Join(projectDir, ".pi", "skills"), 0o755); err != nil {
		t.Fatalf("mkdir project: %v", err)
	}
	writeSkill(t, filepath.Join(projectDir, ".pi", "skills"), "proj-only", "Project skill")
	writeSkill(t, filepath.Join(projectDir, ".pi", "skills"), "shared", "Project copy")
	if err := os.MkdirAll(filepath.Join(projectDir, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	writeTrust(t, map[string]bool{projectDir: true})

	// Agent-home skills dir.
	agentSkills := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills")
	writeSkill(t, agentSkills, "agent-home", "Agent home skill")
	writeSkill(t, agentSkills, "shared", "Agent home copy")

	// User ~/.agents/skills.
	userSkills := filepath.Join(homeDir, ".agents", "skills")
	writeSkill(t, userSkills, "user-only", "User skill")
	writeSkill(t, userSkills, "shared", "User copy")

	// Package skills (npm: prefixed).
	writeAgentSettings(t, []string{"npm:@scope/pkg-one", "npm:pkg-two"}, nil)
	writeNPMPackage(t, "@scope/pkg-one", map[string]string{"pkg-skill": "Package skill"}, []string{"./skills"})
	writeNPMPackage(t, "pkg-two", map[string]string{"pkg-two-skill": "Second package skill"}, []string{"./skills"})

	// Settings skills array (relative to agent dir).
	settingsSkillsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "extra-skills")
	writeSkill(t, settingsSkillsDir, "settings-skill", "Settings skill")
	writeAgentSettings(t, []string{"npm:@scope/pkg-one", "npm:pkg-two"}, []string{"extra-skills"})

	skills, err := EnumeratePiSkills(projectDir)
	if err != nil {
		t.Fatalf("EnumeratePiSkills: %v", err)
	}

	got := namesOf(skills)
	expected := []string{
		"agent-home", "pkg-skill", "pkg-two-skill", "proj-only", "settings-skill", "shared", "user-only",
	}
	if strings.Join(got, ",") != strings.Join(expected, ",") {
		t.Fatalf("expected %v, got %v", expected, got)
	}

	// Precedence: project copy wins for "shared".
	for _, skill := range skills {
		if skill.Name != "shared" {
			continue
		}
		if skill.SourceKind != SkillSourceProject {
			t.Fatalf("expected project precedence for shared, got %v", skill.SourceKind)
		}
		if !strings.Contains(skill.SourcePath, filepath.Join(".pi", "skills")) {
			t.Fatalf("expected project source path, got %q", skill.SourcePath)
		}
	}
	// Deterministic order.
	for idx := 1; idx < len(skills); idx++ {
		if skills[idx-1].Name >= skills[idx].Name {
			t.Fatalf("skills not sorted at %d: %v", idx, got)
		}
	}
}

func TestEnumeratePiSkills_UntrustedSkipsProjectSkills(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()

	projectDir := filepath.Join(homeDir, "untrusted-proj")
	if err := os.MkdirAll(filepath.Join(projectDir, ".pi", "skills"), 0o755); err != nil {
		t.Fatalf("mkdir project: %v", err)
	}
	writeSkill(t, filepath.Join(projectDir, ".pi", "skills"), "proj-only", "Project skill")
	writeTrust(t, map[string]bool{projectDir: false})

	agentSkills := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills")
	writeSkill(t, agentSkills, "agent-home", "Agent home skill")

	skills, err := EnumeratePiSkills(projectDir)
	if err != nil {
		t.Fatalf("EnumeratePiSkills: %v", err)
	}
	got := namesOf(skills)
	if strings.Join(got, ",") != "agent-home" {
		t.Fatalf("expected only agent-home for untrusted project, got %v", got)
	}
}

func TestEnumeratePiSkills_TrustedAncestorScansAgentsSkillsUpToGitRoot(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()

	repoRoot := filepath.Join(homeDir, "repo")
	worktree := filepath.Join(repoRoot, "ws")
	for _, dir := range []string{repoRoot, worktree} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	if err := os.MkdirAll(filepath.Join(repoRoot, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	writeSkill(t, filepath.Join(worktree, ".agents", "skills"), "nested-agents", "Agents skill in worktree")
	writeSkill(t, filepath.Join(repoRoot, ".agents", "skills"), "repo-agents", "Agents skill in repo root")
	writeTrust(t, map[string]bool{worktree: true})

	// Trust granted at the worktree path; scanning stops at the git root, so
	// both the worktree and repo-root .agents/skills are found.
	skills, err := EnumeratePiSkills(worktree)
	if err != nil {
		t.Fatalf("EnumeratePiSkills: %v", err)
	}
	got := namesOf(skills)
	if strings.Join(got, ",") != "nested-agents,repo-agents" {
		t.Fatalf("expected nested-agents,repo-agents, got %v", got)
	}
}

func TestEnumeratePiSkills_PackageWithoutManifestUsesConventionDir(t *testing.T) {
	withPiHome(t)
	writeAgentSettings(t, []string{"npm:pkg-no-manifest"}, nil)
	writeNPMPackage(t, "pkg-no-manifest", map[string]string{"convention-skill": "Convention skill"}, nil)

	skills, err := EnumeratePiSkills("")
	if err != nil {
		t.Fatalf("EnumeratePiSkills: %v", err)
	}
	got := namesOf(skills)
	if strings.Join(got, ",") != "convention-skill" {
		t.Fatalf("expected convention-skill, got %v", got)
	}
}

func TestEnumeratePiSkills_RealInstallUniqueNamesAndSorted(t *testing.T) {
	agentDir, err := agentHomeDirForRealInstall()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(agentDir, "settings.json")); err != nil {
		t.Skip("pi agent settings not installed; skipping real-layout check")
	}

	skills, err := EnumeratePiSkills("")
	if err != nil {
		t.Fatalf("EnumeratePiSkills: %v", err)
	}
	seen := make(map[string]bool, len(skills))
	for _, skill := range skills {
		if seen[skill.Name] {
			t.Fatalf("duplicate skill name %q in real layout", skill.Name)
		}
		seen[skill.Name] = true
	}
	if len(skills) == 0 {
		t.Fatal("expected at least one skill on the real install")
	}
	for idx := 1; idx < len(skills); idx++ {
		if skills[idx-1].Name >= skills[idx].Name {
			t.Fatalf("skills not sorted by name at %d: %v", idx, namesOf(skills))
		}
	}
}

func TestScanSettingsSkills_ResolvesRelativeToAgentDir(t *testing.T) {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()

	// Absolute path entry.
	absoluteSkillsDir := filepath.Join(homeDir, "abs-skills")
	writeSkill(t, absoluteSkillsDir, "abs-skill", "Absolute settings skill")

	// Relative path entry (resolved against the agent dir).
	agentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	writeSkill(t, filepath.Join(agentDir, "rel-skills"), "rel-skill", "Relative settings skill")

	writeAgentSettings(t, nil, []string{absoluteSkillsDir, "rel-skills"})

	skills, err := scanSettingsSkills()
	if err != nil {
		t.Fatalf("scanSettingsSkills: %v", err)
	}
	got := namesOf(skills)
	if strings.Join(got, ",") != "abs-skill,rel-skill" {
		t.Fatalf("expected abs-skill,rel-skill, got %v", got)
	}
}
