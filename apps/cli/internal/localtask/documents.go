package localtask

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"yishan/apps/cli/internal/platform/lockfile"
)

// TaskContextDocument identifies one writable Task Context document.
type TaskContextDocument string

const (
	// DocumentNotes is the task notes document.
	DocumentNotes TaskContextDocument = "notes"
	// DocumentPlan is the task plan document.
	DocumentPlan TaskContextDocument = "plan"
	// DocumentOutcome is the task outcome document.
	DocumentOutcome TaskContextDocument = "outcome"
)

var (
	// ErrInvalidDocument indicates an unsupported Task Context document name.
	ErrInvalidDocument = errors.New("invalid local task context document")
	// ErrUnsafeContextPath indicates a Task Context path cannot be trusted for filesystem access.
	ErrUnsafeContextPath = errors.New("unsafe local task context path")
	// ErrDocumentNotFound indicates a Task Context document does not exist yet.
	ErrDocumentNotFound = errors.New("local task context document not found")
)

const (
	contextLockFileName   = ".local-task-document.lock"
	contextLockTimeout    = 10 * time.Second
	contextDocumentMode   = 0o600
	contextDirectoryMode  = 0o755
	temporaryDocumentGlob = ".local-task-document-*"
)

var documentBasenames = map[TaskContextDocument]string{
	DocumentNotes:   "notes.md",
	DocumentPlan:    "plan.md",
	DocumentOutcome: "outcome.md",
}

// ParseTaskDocument validates one writable Task Context document name.
func ParseTaskDocument(value string) (TaskContextDocument, error) {
	document := TaskContextDocument(strings.TrimSpace(value))
	if _, ok := documentBasenames[document]; !ok {
		return "", fmt.Errorf("%w: %q must be notes, plan, or outcome", ErrInvalidDocument, value)
	}
	return document, nil
}

// ResolveDocumentPath derives the only writable path for a document inside a
// daemon-derived Task Context directory.
func ResolveDocumentPath(directory string, document TaskContextDocument) (string, error) {
	basename, ok := documentBasenames[document]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrInvalidDocument, document)
	}
	path := filepath.Join(directory, basename)
	if strings.ContainsRune(directory, 0) || !filepath.IsAbs(directory) || filepath.Clean(directory) != directory ||
		filepath.Dir(path) != directory || filepath.Base(path) != basename {
		return "", fmt.Errorf("%w: context directory %q", ErrUnsafeContextPath, directory)
	}
	return path, nil
}

// ReadDocument reads one approved Task Context document body.
func ReadDocument(directory string, document TaskContextDocument) (string, error) {
	path, err := ResolveDocumentPath(directory, document)
	if err != nil {
		return "", err
	}
	content, err := readDocumentContent(directory, path, document)
	if errors.Is(err, ErrDocumentNotFound) {
		return "", err
	}
	return content, err
}

// WriteDocument atomically replaces one approved Task Context document under a
// cross-process lock, so concurrent CLI, MCP, and agent writers never interleave.
func WriteDocument(directory string, document TaskContextDocument, content string) error {
	path, err := ResolveDocumentPath(directory, document)
	if err != nil {
		return err
	}
	return withContextLock(directory, func() error {
		return writeAtomic(directory, path, document, content)
	})
}

// AppendNote appends content to the notes document with a read-modify-write
// inside the same cross-process lock used by WriteDocument.
func AppendNote(directory string, content string) error {
	path, err := ResolveDocumentPath(directory, DocumentNotes)
	if err != nil {
		return err
	}
	return withContextLock(directory, func() error {
		existing, err := readDocumentIfPresent(directory, path, DocumentNotes)
		if err != nil {
			return err
		}
		return writeAtomic(directory, path, DocumentNotes, existing+content)
	})
}

func withContextLock(directory string, operation func() error) error {
	if err := EnsureContextDirectory(directory); err != nil {
		return err
	}
	if err := os.MkdirAll(directory, contextDirectoryMode); err != nil {
		return fmt.Errorf("create task context directory: %w", err)
	}
	if err := EnsureContextDirectory(directory); err != nil {
		return err
	}
	lock, err := lockfile.Acquire(filepath.Join(directory, contextLockFileName), contextLockTimeout)
	if err != nil {
		return fmt.Errorf("lock task context directory: %w", err)
	}
	defer lock.Release()
	return operation()
}

// EnsureContextDirectory rejects a task context directory whose own path or
// "task-context" parent is a symbolic link. The canonical context root is
// already resolved by EvalSymlinks, so a link at or below it is never trusted.
func EnsureContextDirectory(directory string) error {
	current := directory
	for range 2 {
		if err := requireRealDirectory(current); err != nil {
			return err
		}
		parent := filepath.Dir(current)
		if parent == current {
			return nil
		}
		current = parent
	}
	return nil
}

// requireRealDirectory rejects a path that exists but is not a plain directory.
func requireRealDirectory(path string) error {
	info, err := os.Lstat(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("inspect task context directory: %w", err)
	case info.Mode()&os.ModeSymlink != 0:
		return fmt.Errorf("%w: task context directory must not be a symbolic link", ErrUnsafeContextPath)
	case !info.IsDir():
		return fmt.Errorf("%w: task context directory is not a directory", ErrUnsafeContextPath)
	}
	return nil
}

func readDocumentIfPresent(directory string, path string, document TaskContextDocument) (string, error) {
	content, err := readDocumentContent(directory, path, document)
	if errors.Is(err, ErrDocumentNotFound) {
		return "", nil
	}
	return content, err
}

func readDocumentContent(directory string, path string, document TaskContextDocument) (string, error) {
	if err := EnsureContextDirectory(directory); err != nil {
		return "", err
	}
	if err := assertSafeDocumentPath(directory, path, document); err != nil {
		return "", err
	}
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("%s: %w", document, ErrDocumentNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("read task context document: %w", err)
	}
	return string(content), nil
}

func writeAtomic(directory string, path string, document TaskContextDocument, content string) error {
	if err := assertSafeDocumentPath(directory, path, document); err != nil {
		return err
	}
	temporaryFile, err := os.CreateTemp(directory, temporaryDocumentGlob)
	if err != nil {
		return fmt.Errorf("create temporary task context document: %w", err)
	}
	temporaryPath := temporaryFile.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if err := writeTemporaryDocument(temporaryFile, content); err != nil {
		return err
	}
	if err := assertSafeDocumentPath(directory, path, document); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace task context document: %w", err)
	}
	return nil
}

func writeTemporaryDocument(file *os.File, content string) error {
	if err := file.Chmod(contextDocumentMode); err != nil {
		_ = file.Close()
		return fmt.Errorf("set temporary task context document mode: %w", err)
	}
	if _, err := file.WriteString(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("write temporary task context document: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync temporary task context document: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close temporary task context document: %w", err)
	}
	return nil
}

func assertSafeDocumentPath(directory string, path string, document TaskContextDocument) error {
	if err := requireRealDirectory(directory); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("inspect task context document: %w", err)
	case info.Mode()&os.ModeSymlink != 0:
		return fmt.Errorf("%w: %s must not be a symbolic link", ErrUnsafeContextPath, document)
	}
	return nil
}
