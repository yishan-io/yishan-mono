package localtask

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

func TestResolveDocumentPath_AllowsOnlyApprovedDocuments(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "context", "task-1")
	for document, basename := range map[TaskContextDocument]string{
		DocumentNotes:   "notes.md",
		DocumentPlan:    "plan.md",
		DocumentOutcome: "outcome.md",
	} {
		path, err := ResolveDocumentPath(directory, document)
		if err != nil || path != filepath.Join(directory, basename) {
			t.Fatalf("ResolveDocumentPath(%q) = %q, %v", document, path, err)
		}
	}
}

func TestResolveDocumentPath_RejectsUnsafeInput(t *testing.T) {
	cases := []struct {
		name      string
		directory string
		document  TaskContextDocument
		want      error
	}{
		{"relative directory", "context/task-1", DocumentNotes, ErrUnsafeContextPath},
		{"unclean directory", "/tmp/context/../task-1", DocumentNotes, ErrUnsafeContextPath},
		{"empty directory", "", DocumentNotes, ErrUnsafeContextPath},
		{"unsupported document", "/tmp/context/task-1", TaskContextDocument("../../etc/passwd"), ErrInvalidDocument},
		{"empty document", "/tmp/context/task-1", TaskContextDocument(""), ErrInvalidDocument},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, err := ResolveDocumentPath(test.directory, test.document)
			if !errors.Is(err, test.want) {
				t.Fatalf("ResolveDocumentPath error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestReadDocument_ReportsMissingDocument(t *testing.T) {
	directory := t.TempDir()
	_, err := ReadDocument(directory, DocumentNotes)
	if !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("ReadDocument error = %v", err)
	}
}

func TestWriteDocument_ReplacesContentAtomically(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "task-1")
	if err := WriteDocument(directory, DocumentPlan, "first"); err != nil {
		t.Fatalf("WriteDocument: %v", err)
	}
	if err := WriteDocument(directory, DocumentPlan, "second"); err != nil {
		t.Fatalf("WriteDocument replace: %v", err)
	}
	content, err := ReadDocument(directory, DocumentPlan)
	if err != nil || content != "second" {
		t.Fatalf("ReadDocument = %q, %v", content, err)
	}
	assertNoTemporaryDocuments(t, directory)
}

func TestAppendNote_CreatesAndAppends(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "task-1")
	if err := AppendNote(directory, "first\n"); err != nil {
		t.Fatalf("AppendNote: %v", err)
	}
	if err := AppendNote(directory, "second\n"); err != nil {
		t.Fatalf("AppendNote second: %v", err)
	}
	content, err := ReadDocument(directory, DocumentNotes)
	if err != nil || content != "first\nsecond\n" {
		t.Fatalf("ReadDocument = %q, %v", content, err)
	}
}

func TestAppendNote_ConcurrentWritersLoseNoContent(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "task-1")
	const writers = 16
	var waitGroup sync.WaitGroup
	for index := 0; index < writers; index++ {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			if err := AppendNote(directory, fmt.Sprintf("note-%02d\n", index)); err != nil {
				t.Errorf("AppendNote %d: %v", index, err)
			}
		}(index)
	}
	waitGroup.Wait()
	assertAppendedNotes(t, directory, writers)
}

func TestAppendNote_CrossProcessWritersLoseNoContent(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "task-1")
	const writers = 8
	commands := make([]*exec.Cmd, 0, writers)
	for index := 0; index < writers; index++ {
		command := exec.Command(os.Args[0], "-test.run=TestDocumentAppendProcessHelper", "-test.v=false")
		command.Env = append(os.Environ(),
			"YISHAN_DOCUMENT_HELPER_DIR="+directory,
			fmt.Sprintf("YISHAN_DOCUMENT_HELPER_NOTE=process-%02d", index),
		)
		commands = append(commands, command)
	}
	for _, command := range commands {
		if err := command.Start(); err != nil {
			t.Fatalf("start helper process: %v", err)
		}
	}
	for _, command := range commands {
		if err := command.Wait(); err != nil {
			t.Fatalf("helper process: %v", err)
		}
	}
	assertAppendedNotes(t, directory, writers)
}

// TestDocumentAppendProcessHelper is the child process used by the
// cross-process append test; it is skipped unless the test binary was
// re-executed with the helper environment.
func TestDocumentAppendProcessHelper(t *testing.T) {
	directory := os.Getenv("YISHAN_DOCUMENT_HELPER_DIR")
	if directory == "" {
		t.Skip("helper process only")
	}
	note := os.Getenv("YISHAN_DOCUMENT_HELPER_NOTE")
	if err := AppendNote(directory, note+"\n"); err != nil {
		t.Fatalf("AppendNote: %v", err)
	}
}

func TestReadDocument_RejectsSymlinkedDocument(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(target, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(directory, "notes.md")); err != nil {
		t.Fatal(err)
	}
	_, err := ReadDocument(directory, DocumentNotes)
	if !errors.Is(err, ErrUnsafeContextPath) {
		t.Fatalf("ReadDocument error = %v", err)
	}
}

func TestWriteDocument_RejectsSymlinkedDirectory(t *testing.T) {
	outside := t.TempDir()
	directory := filepath.Join(t.TempDir(), "task-1")
	if err := os.Symlink(outside, directory); err != nil {
		t.Fatal(err)
	}
	err := WriteDocument(directory, DocumentNotes, "content")
	if !errors.Is(err, ErrUnsafeContextPath) {
		t.Fatalf("WriteDocument error = %v", err)
	}
	if _, readErr := os.Stat(filepath.Join(outside, "notes.md")); !errors.Is(readErr, os.ErrNotExist) {
		t.Fatalf("symlink target was written: %v", readErr)
	}
}

func TestWriteDocument_RejectsSymlinkedTaskContextParent(t *testing.T) {
	canonicalRoot := t.TempDir()
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(canonicalRoot, "task-context")); err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(canonicalRoot, "task-context", "task-1")
	err := AppendNote(directory, "leaked note\n")
	if !errors.Is(err, ErrUnsafeContextPath) {
		t.Fatalf("AppendNote error = %v", err)
	}
	if _, readErr := os.Stat(filepath.Join(outside, "task-1", "notes.md")); !errors.Is(readErr, os.ErrNotExist) {
		t.Fatalf("symlinked parent was written: %v", readErr)
	}
}

func TestWriteDocument_RejectsSymlinkedDirectoryLeavesNoTemporaryFile(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(target, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(directory, "notes.md")); err != nil {
		t.Fatal(err)
	}
	if err := WriteDocument(directory, DocumentNotes, "content"); !errors.Is(err, ErrUnsafeContextPath) {
		t.Fatalf("WriteDocument error = %v", err)
	}
	assertNoTemporaryDocuments(t, directory)
	content, err := os.ReadFile(target)
	if err != nil || string(content) != "secret" {
		t.Fatalf("symlink target changed to %q, %v", content, err)
	}
}

func assertAppendedNotes(t *testing.T, directory string, expected int) {
	t.Helper()
	content, err := ReadDocument(directory, DocumentNotes)
	if err != nil {
		t.Fatalf("ReadDocument: %v", err)
	}
	lines := strings.Fields(strings.TrimSpace(content))
	if len(lines) != expected {
		t.Fatalf("appended note count = %d, want %d (%q)", len(lines), expected, content)
	}
	seen := make(map[string]struct{}, len(lines))
	for _, line := range lines {
		if _, duplicate := seen[line]; duplicate {
			t.Fatalf("duplicate appended note %q in %q", line, content)
		}
		seen[line] = struct{}{}
	}
	assertNoTemporaryDocuments(t, directory)
}

func assertNoTemporaryDocuments(t *testing.T, directory string) {
	t.Helper()
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatalf("read context directory: %v", err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".local-task-document-") && entry.Name() != contextLockFileName {
			t.Fatalf("temporary document left behind: %s", entry.Name())
		}
	}
}
