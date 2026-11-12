package memory

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestResolveProjectRoot_RejectsContextRootAndYishanStores(t *testing.T) {
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	projectRoot := newMemoryTestProject(t)
	contextRoot, err := ResolveProjectMemoryRoot(projectRoot)
	if err != nil {
		t.Fatalf("ResolveProjectMemoryRoot: %v", err)
	}
	contextCases := []string{contextRoot, filepath.Join(homeDirectory, ".yishan", "contexts", "repo")}
	for _, candidate := range contextCases {
		if _, err := ResolveProjectRoot(candidate, ""); !errors.Is(err, ErrUnsafeMemoryPath) {
			t.Fatalf("ResolveProjectRoot(%q) error = %v", candidate, err)
		}
	}
	resolved, err := ResolveProjectRoot(projectRoot, "")
	if err != nil || resolved != projectRoot {
		t.Fatalf("ResolveProjectRoot = %q, %v", resolved, err)
	}
}

func TestResolveProjectRoot_FindsAncestorFromWorkingDirectory(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	nested := filepath.Join(projectRoot, "src", "deep")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolveProjectRoot("", nested)
	if err != nil || resolved != projectRoot {
		t.Fatalf("ResolveProjectRoot = %q, %v", resolved, err)
	}
}

func TestResolveProjectMemoryRoot_FollowsProjectContextSymlink(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := t.TempDir()
	canonicalRoot := filepath.Join(t.TempDir(), "canonical-context")
	if err := os.MkdirAll(canonicalRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(canonicalRoot, filepath.Join(projectRoot, projectContextDirectoryName)); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolveProjectMemoryRoot(projectRoot)
	if err != nil {
		t.Fatalf("ResolveProjectMemoryRoot: %v", err)
	}
	wantRoot, err := filepath.EvalSymlinks(canonicalRoot)
	if err != nil {
		t.Fatal(err)
	}
	if resolved != wantRoot {
		t.Fatalf("ResolveProjectMemoryRoot = %q, want %q", resolved, wantRoot)
	}
}

func TestStoreMemoryEntry_CreatesSectionsAndAppendsChronologically(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)

	memoryPath, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions,
		"Prefer the CLI first. Why: one shared implementation.", "2026-11-12")
	if err != nil {
		t.Fatalf("StoreMemoryEntry: %v", err)
	}
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDiscoveries,
		"[Invariant] 2026-11-12 — documents live in the task context directory.", "2026-11-12"); err != nil {
		t.Fatalf("StoreMemoryEntry discovery: %v", err)
	}
	content := readMemoryTestFile(t, memoryPath)
	assertContains(t, content, "# Project Memory")
	assertContains(t, content, "_Last updated: 2026-11-12_")
	assertContains(t, content, "## Decisions\n\n- 2026-11-12 - Prefer the CLI first.")
	assertContains(t, content, "- [Invariant] 2026-11-12 — documents live in the task context directory.")
	if strings.Contains(content, "\n\n\n") {
		t.Fatalf("memory file has blank-line runs:\n%s", content)
	}
}

func TestStoreMemoryEntry_MigratesLegacyHeadingsAndDedupes(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	memoryPath, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, "Keep this.", "2026-11-12")
	if err != nil {
		t.Fatal(err)
	}
	legacy := "# Project Memory\n\n## Locked Decisions\n\n- 2026-11-12 - Keep this.\n\n## Open Questions\n"
	if err := os.WriteFile(memoryPath, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, "Keep this.", "2026-11-12"); err != nil {
		t.Fatalf("StoreMemoryEntry duplicate: %v", err)
	}
	content := readMemoryTestFile(t, memoryPath)
	assertContains(t, content, "## Decisions")
	assertContains(t, content, "## Durable Discoveries")
	if strings.Contains(content, "## Locked Decisions") || strings.Contains(content, "## Open Questions") {
		t.Fatalf("legacy headings survived:\n%s", content)
	}
	if count := strings.Count(content, "Keep this."); count != 1 {
		t.Fatalf("duplicate entry count = %d\n%s", count, content)
	}
}

func TestStoreMemoryEntry_KeepsConsecutiveEntriesAdjacent(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	for _, entry := range []string{"First decision.", "Second decision."} {
		if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, entry, "2026-11-12"); err != nil {
			t.Fatalf("StoreMemoryEntry: %v", err)
		}
	}
	content := readMemoryTestFile(t, filepath.Join(mustResolveMemoryRoot(t, projectRoot), memoryFileName))
	assertContains(t, content, "- 2026-11-12 - First decision.\n- 2026-11-12 - Second decision.")
}

func TestStoreMemoryEntry_RejectsInvalidInput(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	cases := []struct {
		name    string
		section MemorySection
		entry   string
		date    string
	}{
		{"unknown section", MemorySection("open_questions"), "entry", "2026-11-12"},
		{"empty entry", MemorySectionDecisions, "   ", "2026-11-12"},
		{"malformed date", MemorySectionDecisions, "entry", "12/11/2026"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if _, err := StoreMemoryEntry(projectRoot, test.section, test.entry, test.date); !errors.Is(err, ErrInvalidMemoryEntry) {
				t.Fatalf("StoreMemoryEntry error = %v", err)
			}
		})
	}
}

func TestStoreMemoryEntry_KeepsMultilineAndNonASCIIEntries(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	entry := "[Workflow Trap] 2026-11-12 — 关闭标签页会停止 Pi 进程。\nWhy: 进程随标签页生命周期结束。"
	memoryPath, err := StoreMemoryEntry(projectRoot, MemorySectionDiscoveries, entry, "2026-11-12")
	if err != nil {
		t.Fatalf("StoreMemoryEntry: %v", err)
	}
	assertContains(t, readMemoryTestFile(t, memoryPath), entry)
}

func TestStoreMemoryEntry_ConcurrentStoresKeepEveryEntry(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	const writers = 12
	var waitGroup sync.WaitGroup
	for index := 0; index < writers; index++ {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			entry := fmt.Sprintf("decision-%02d", index)
			if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, entry, "2026-11-12"); err != nil {
				t.Errorf("StoreMemoryEntry: %v", err)
			}
		}(index)
	}
	waitGroup.Wait()
	memoryPath := filepath.Join(mustResolveMemoryRoot(t, projectRoot), memoryFileName)
	content := readMemoryTestFile(t, memoryPath)
	for index := 0; index < writers; index++ {
		assertContains(t, content, fmt.Sprintf("decision-%02d", index))
	}
}

func TestStoreMemoryEntry_CrossProcessStoresKeepEveryEntry(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	const writers = 6
	commands := make([]*exec.Cmd, 0, writers)
	for index := 0; index < writers; index++ {
		command := exec.Command(os.Args[0], "-test.run=TestMemoryStoreProcessHelper")
		command.Env = append(os.Environ(),
			"YISHAN_MEMORY_HELPER_ROOT="+projectRoot,
			fmt.Sprintf("YISHAN_MEMORY_HELPER_ENTRY=process-%02d", index),
		)
		commands = append(commands, command)
	}
	for _, command := range commands {
		if err := command.Start(); err != nil {
			t.Fatalf("start helper: %v", err)
		}
	}
	for _, command := range commands {
		if err := command.Wait(); err != nil {
			t.Fatalf("helper: %v", err)
		}
	}
	memoryPath := filepath.Join(mustResolveMemoryRoot(t, projectRoot), memoryFileName)
	content := readMemoryTestFile(t, memoryPath)
	for index := 0; index < writers; index++ {
		assertContains(t, content, fmt.Sprintf("process-%02d", index))
	}
}

// TestMemoryStoreProcessHelper is the child process of the cross-process store test.
func TestMemoryStoreProcessHelper(t *testing.T) {
	projectRoot := os.Getenv("YISHAN_MEMORY_HELPER_ROOT")
	if projectRoot == "" {
		t.Skip("helper process only")
	}
	entry := os.Getenv("YISHAN_MEMORY_HELPER_ENTRY")
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, entry, "2026-11-12"); err != nil {
		t.Fatalf("StoreMemoryEntry: %v", err)
	}
}

func TestMergeAndWrite_KeepsEntryStoredBeforeTheSummarizerLock(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	memoryPath := filepath.Join(mustResolveMemoryRoot(t, projectRoot), memoryFileName)
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, "Initial decision.", "2026-11-11"); err != nil {
		t.Fatal(err)
	}
	staleContent := readMemoryTestFile(t, memoryPath)
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions, "Concurrent decision.", "2026-11-12"); err != nil {
		t.Fatal(err)
	}
	if _, err := mergeAndWrite(memoryPath, staleContent, extractedKnowledge{
		DurableDiscoveries: []string{"[Invariant] 2026-11-12 — summarizer discovery."},
	}, ""); err != nil {
		t.Fatalf("mergeAndWrite: %v", err)
	}
	content := readMemoryTestFile(t, memoryPath)
	assertContains(t, content, "Concurrent decision.")
	assertContains(t, content, "[Invariant] 2026-11-12 — summarizer discovery.")
}

func TestMergeAndWrite_PreservesMultilineStoredEntry(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	multiline := "[Workflow Trap] 2026-11-12 — Closing a tab stops the process.\nWhy: the process lives with the tab."
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDiscoveries, multiline, "2026-11-12"); err != nil {
		t.Fatalf("StoreMemoryEntry: %v", err)
	}
	memoryPath := filepath.Join(mustResolveMemoryRoot(t, projectRoot), memoryFileName)
	currentContent := readMemoryTestFile(t, memoryPath)
	if _, err := mergeAndWrite(memoryPath, currentContent, extractedKnowledge{
		LockedDecisions: []string{"2026-11-12 — Summarizer decision."},
	}, ""); err != nil {
		t.Fatalf("mergeAndWrite: %v", err)
	}
	content := readMemoryTestFile(t, memoryPath)
	assertContains(t, content, "Closing a tab stops the process.\nWhy: the process lives with the tab.")
	assertContains(t, content, "2026-11-12 — Summarizer decision.")
}

func TestReadMemoryFile_RejectsEscapeAndSymlinkedFile(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	memoryRoot := mustResolveMemoryRoot(t, projectRoot)
	for _, relativePath := range []string{"../outside.md", filepath.Join("..", "outside.md"), "/etc/passwd"} {
		if _, err := ReadMemoryFile(memoryRoot, relativePath); !errors.Is(err, ErrUnsafeMemoryPath) {
			t.Fatalf("ReadMemoryFile(%q) error = %v", relativePath, err)
		}
	}
	target := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(target, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(memoryRoot, "LINKED.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadMemoryFile(memoryRoot, "LINKED.md"); !errors.Is(err, ErrUnsafeMemoryPath) {
		t.Fatalf("ReadMemoryFile symlink error = %v", err)
	}
}

func TestReadMemoryFile_ReportsMissingFile(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	if _, err := ReadMemoryFile(mustResolveMemoryRoot(t, projectRoot), "MEMORY.md"); !errors.Is(err, ErrMemoryFileNotFound) {
		t.Fatalf("ReadMemoryFile error = %v", err)
	}
}

func isolateMemoryTestHome(t *testing.T) string {
	t.Helper()
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("USERPROFILE", homeDirectory)
	return homeDirectory
}

func newMemoryTestProject(t *testing.T) string {
	t.Helper()
	projectRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(projectRoot, projectContextDirectoryName), 0o755); err != nil {
		t.Fatal(err)
	}
	return projectRoot
}

func mustResolveMemoryRoot(t *testing.T, projectRoot string) string {
	t.Helper()
	memoryRoot, err := ResolveProjectMemoryRoot(projectRoot)
	if err != nil {
		t.Fatalf("ResolveProjectMemoryRoot: %v", err)
	}
	return memoryRoot
}

func readMemoryTestFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(content)
}

func assertContains(t *testing.T, content string, want string) {
	t.Helper()
	if !strings.Contains(content, want) {
		t.Fatalf("content does not contain %q:\n%s", want, content)
	}
}

func TestStoreMemoryEntry_IsSearchableAfterExplicitReconcile(t *testing.T) {
	isolateMemoryTestHome(t)
	projectRoot := newMemoryTestProject(t)
	if _, err := StoreMemoryEntry(projectRoot, MemorySectionDecisions,
		"Deliver the CLI capabilities before MCP wrappers.", "2026-11-12"); err != nil {
		t.Fatalf("StoreMemoryEntry: %v", err)
	}
	db, err := OpenDB(filepath.Join(t.TempDir(), "memory.db"))
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer db.Close()
	before, err := db.SearchMemory(SearchInput{Query: "capabilities", ProjectID: "project-1", Scope: "project"})
	if err != nil {
		t.Fatalf("SearchMemory before reconcile: %v", err)
	}
	if len(before) != 0 {
		t.Fatalf("search before reconcile returned %#v", before)
	}
	refs := []WorkspaceRef{{WorktreePath: projectRoot, ProjectID: "project-1"}}
	if _, err := db.ReconcileWithTaskContexts(refs, filepath.Join(t.TempDir(), "global"), nil); err != nil {
		t.Fatalf("ReconcileWithTaskContexts: %v", err)
	}
	results, err := db.SearchMemory(SearchInput{Query: "capabilities", ProjectID: "project-1", Scope: "project"})
	if err != nil {
		t.Fatalf("SearchMemory: %v", err)
	}
	if len(results) == 0 || !strings.HasSuffix(results[0].Path, memoryFileName) {
		t.Fatalf("search results = %#v", results)
	}
}
