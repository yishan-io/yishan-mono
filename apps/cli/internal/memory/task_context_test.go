package memory

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReconcileWithTaskContexts_IndexesOnlySupportedDocuments(t *testing.T) {
	db := openTestDB(t)
	contextRoot := t.TempDir()
	taskRoot := filepath.Join(contextRoot, taskContextDirectory, "task-1")
	writeTaskContextFixture(t, taskRoot)
	nestedPath := filepath.Join(contextRoot, architectureDir, taskContextDirectory, "design.md")
	if err := os.MkdirAll(filepath.Dir(nestedPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(nestedPath, []byte("nested architecture context"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := db.ReconcileWithTaskContexts(
		[]WorkspaceRef{{WorktreePath: workspaceWithContext(t, contextRoot), ProjectID: "project-1"}}, "",
		[]TaskContextRef{{Directory: taskRoot, TaskID: "task-1", TaskTitle: "Index task", ProjectID: "project-1"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 5 {
		t.Fatalf("inserted = %d, want task documents, Memory, and nested architecture", result.Inserted)
	}
	assertIndexed(t, db, filepath.Join(taskRoot, "plan.md"), true)
	assertIndexed(t, db, filepath.Join(taskRoot, "notes.md"), true)
	assertIndexed(t, db, filepath.Join(taskRoot, "outcome.md"), true)
	assertIndexed(t, db, filepath.Join(taskRoot, "task.md"), false)
	assertIndexed(t, db, filepath.Join(taskRoot, "research", "detail.md"), false)
	canonicalNestedPath, err := filepath.EvalSymlinks(nestedPath)
	if err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, canonicalNestedPath, true)
}

func TestReconcileWithTaskContexts_SkipsOrphanTopLevelTaskContext(t *testing.T) {
	db := openTestDB(t)
	contextRoot := t.TempDir()
	orphanRoot := filepath.Join(contextRoot, taskContextDirectory, "orphan-task")
	writeTaskContextFixture(t, orphanRoot)
	nestedPath := filepath.Join(contextRoot, architectureDir, taskContextDirectory, "design.md")
	if err := os.MkdirAll(filepath.Dir(nestedPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(nestedPath, []byte("nested task-context design"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := db.ReconcileWithTaskContexts(
		[]WorkspaceRef{{WorktreePath: workspaceWithContext(t, contextRoot), ProjectID: "project-1"}}, "", nil,
	); err != nil {
		t.Fatal(err)
	}
	for _, relativePath := range []string{"plan.md", "notes.md", "outcome.md", "task.md", filepath.Join("research", "detail.md")} {
		assertIndexed(t, db, filepath.Join(orphanRoot, relativePath), false)
	}
	canonicalNestedPath, err := filepath.EvalSymlinks(nestedPath)
	if err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, canonicalNestedPath, true)
}

func TestReplaceTaskContexts_PurgesOnlyUnregisteredTaskContextRows(t *testing.T) {
	db := openTestDB(t)
	projectRoot := t.TempDir()
	globalRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(projectRoot, "plan.md"), []byte("project purge phrase"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(globalRoot, "plan.md"), []byte("global retention phrase"), 0o644); err != nil {
		t.Fatal(err)
	}
	refs := []TaskContextRef{
		{Directory: projectRoot, TaskID: "project-task", ProjectID: "project-1"},
		{Directory: globalRoot, TaskID: "global-task"},
	}
	if _, err := db.ReconcileWithTaskContexts(nil, "", refs); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: db}
	if err := service.ReplaceTaskContexts(refs[1:]); err != nil {
		t.Fatal(err)
	}
	projectResults, err := db.Search("project purge", "", "", 10)
	if err != nil || len(projectResults) != 0 {
		t.Fatalf("purged project results = %#v, %v", projectResults, err)
	}
	if _, found, getErr := db.GetByPath(filepath.Join(globalRoot, "plan.md")); getErr != nil || !found {
		t.Fatalf("global path after replacement found = %t, %v", found, getErr)
	}
	globalResults, err := db.Search("global retention", "", "", 10)
	if err != nil || len(globalResults) != 1 || globalResults[0].TaskID != "global-task" {
		t.Fatalf("retained global results = %#v, %v", globalResults, err)
	}
}

func TestSearch_TaskContextAttributionAndMetadataFTSIsolation(t *testing.T) {
	db := openTestDB(t)
	taskRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(taskRoot, "plan.md"), []byte("quartz implementation detail"), 0o644); err != nil {
		t.Fatal(err)
	}
	ref := TaskContextRef{Directory: taskRoot, TaskID: "task-7", TaskTitle: "Unsearchable title", ProjectID: "project-7"}
	if _, err := db.ReconcileWithTaskContexts(nil, "", []TaskContextRef{ref}); err != nil {
		t.Fatal(err)
	}

	results, err := db.Search("quartz", "project-7", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("results = %#v", results)
	}
	result := results[0]
	if result.Source != SourceTaskContext || result.TaskID != ref.TaskID || result.TaskTitle != ref.TaskTitle ||
		result.DocumentType != "plan" || result.Path != filepath.Join(taskRoot, "plan.md") {
		t.Fatalf("attributed result = %#v", result)
	}
	titleResults, err := db.Search("Unsearchable", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(titleResults) != 0 {
		t.Fatalf("Local Task title leaked into Memory FTS: %#v", titleResults)
	}
}

func TestSearch_ExistingMemoryResultShapeIsPreserved(t *testing.T) {
	db := openTestDB(t)
	if err := db.UpsertFile(memoryFile{
		Path: "/ctx/MEMORY.md", ProjectPath: "/ctx", Type: FileTypeMemory,
		Body: "existing heliotrope memory", Fingerprint: "fp", IndexedAt: 1,
	}); err != nil {
		t.Fatal(err)
	}
	results, err := db.Search("heliotrope", "", "", 10)
	if err != nil || len(results) != 1 {
		t.Fatalf("Search = %#v, %v", results, err)
	}
	result := results[0]
	if result.Path != "/ctx/MEMORY.md" || result.Source != "" || result.TaskID != "" || result.TaskTitle != "" || result.DocumentType != "" {
		t.Fatalf("existing Memory result changed: %#v", result)
	}
}

func writeTaskContextFixture(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, "research"), 0o755); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"plan.md": "plan quartz", "notes.md": "notes quartz", "outcome.md": "outcome quartz",
		"task.md": "metadata quartz", filepath.Join("research", "detail.md"): "research quartz",
	}
	for path, body := range files {
		if err := os.WriteFile(filepath.Join(root, path), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func workspaceWithContext(t *testing.T, contextRoot string) string {
	t.Helper()
	worktree := t.TempDir()
	if err := os.Symlink(contextRoot, filepath.Join(worktree, myContextDir)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(contextRoot, "MEMORY.md"), []byte("existing memory"), 0o644); err != nil {
		t.Fatal(err)
	}
	return worktree
}

func assertIndexed(t *testing.T, db *DB, path string, want bool) {
	t.Helper()
	_, found, err := db.GetByPath(path)
	if err != nil {
		t.Fatal(err)
	}
	if found != want {
		t.Fatalf("indexed %q = %t, want %t", path, found, want)
	}
}
