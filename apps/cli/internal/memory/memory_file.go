package memory

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"yishan/apps/cli/internal/platform/lockfile"
)

// MemorySection identifies one MEMORY.md section that accepts stored entries.
type MemorySection string

const (
	// MemorySectionDecisions is the dated decisions section.
	MemorySectionDecisions MemorySection = "locked_decisions"
	// MemorySectionDiscoveries is the durable discoveries section.
	MemorySectionDiscoveries MemorySection = "durable_discoveries"
)

var (
	// ErrUnsafeMemoryPath indicates a memory path cannot be trusted for filesystem access.
	ErrUnsafeMemoryPath = errors.New("unsafe memory path")
	// ErrMemoryFileNotFound indicates a requested memory file does not exist.
	ErrMemoryFileNotFound = errors.New("memory file not found")
	// ErrInvalidMemoryEntry indicates an empty entry, section, or malformed date.
	ErrInvalidMemoryEntry = errors.New("invalid memory entry")
)

const (
	projectContextDirectoryName = ".my-context"
	memoryFileName              = "MEMORY.md"
	memoryLockFileSuffix        = ".lock"
	memoryLockTimeout           = 10 * time.Second
	memoryFileMode              = 0o644
	memoryDirectoryMode         = 0o755
)

var memorySectionHeadings = map[MemorySection]string{
	MemorySectionDecisions:   "## Decisions",
	MemorySectionDiscoveries: "## Durable Discoveries",
}

// ResolveProjectRoot resolves the project root a memory command operates on. An
// explicit root wins; otherwise the working directory walks up to the nearest
// ancestor carrying .my-context or .git.
func ResolveProjectRoot(projectRoot string, workingDirectory string) (string, error) {
	root := strings.TrimSpace(projectRoot)
	if root == "" {
		if strings.TrimSpace(workingDirectory) == "" {
			return "", fmt.Errorf("%w: project root is required", ErrUnsafeMemoryPath)
		}
		root = findProjectRoot(workingDirectory)
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve project root: %w", err)
	}
	if filepath.Base(absoluteRoot) == projectContextDirectoryName {
		return "", fmt.Errorf("%w: project root must be the parent of %s, not the directory itself",
			ErrUnsafeMemoryPath, projectContextDirectoryName)
	}
	if isUnderYishanStore(absoluteRoot) {
		return "", fmt.Errorf("%w: project root must not be a Yishan context or memory directory", ErrUnsafeMemoryPath)
	}
	return absoluteRoot, nil
}

// ResolveProjectMemoryRoot resolves the canonical .my-context directory of a
// project root, following the project's legitimate context symlink.
func ResolveProjectMemoryRoot(projectRoot string) (string, error) {
	memoryRoot, err := filepath.EvalSymlinks(filepath.Join(projectRoot, projectContextDirectoryName))
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", projectContextDirectoryName, err)
	}
	info, err := os.Stat(memoryRoot)
	if err != nil {
		return "", fmt.Errorf("stat project memory root: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: project memory root is not a directory", ErrUnsafeMemoryPath)
	}
	return memoryRoot, nil
}

// ReadMemoryFile reads one file inside the resolved memory root. The relative
// path must stay inside the root and must not resolve through a symlink.
func ReadMemoryFile(memoryRoot string, relativePath string) (string, error) {
	path, err := resolveMemoryPath(memoryRoot, relativePath)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("%s: %w", relativePath, ErrMemoryFileNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("read memory file: %w", err)
	}
	return string(content), nil
}

// StoreMemoryEntry appends one entry to MEMORY.md. The read-modify-write runs
// inside the cross-process memory lock with a re-read, so a concurrent store or
// summarizer run never loses the other writer's content.
func StoreMemoryEntry(projectRoot string, section MemorySection, entry string, date string) (string, error) {
	if _, ok := memorySectionHeadings[section]; !ok {
		return "", fmt.Errorf("%w: section %q must be locked_decisions or durable_discoveries",
			ErrInvalidMemoryEntry, section)
	}
	trimmedEntry := strings.TrimSpace(entry)
	if trimmedEntry == "" {
		return "", fmt.Errorf("%w: entry must not be empty", ErrInvalidMemoryEntry)
	}
	trimmedDate := strings.TrimSpace(date)
	if _, err := time.Parse("2006-01-02", trimmedDate); err != nil {
		return "", fmt.Errorf("%w: date %q must be YYYY-MM-DD", ErrInvalidMemoryEntry, date)
	}
	memoryRoot, err := ResolveProjectMemoryRoot(projectRoot)
	if err != nil {
		return "", err
	}
	memoryPath := filepath.Join(memoryRoot, memoryFileName)
	if err := withMemoryLock(memoryPath, func() error {
		return storeEntryLocked(memoryPath, section, trimmedEntry, trimmedDate)
	}); err != nil {
		return "", err
	}
	return memoryPath, nil
}

// withMemoryLock runs one MEMORY.md mutation under the cross-process lock.
func withMemoryLock(memoryPath string, operation func() error) error {
	if err := os.MkdirAll(filepath.Dir(memoryPath), memoryDirectoryMode); err != nil {
		return fmt.Errorf("create memory directory: %w", err)
	}
	lock, err := lockfile.Acquire(memoryPath+memoryLockFileSuffix, memoryLockTimeout)
	if err != nil {
		return fmt.Errorf("lock memory file: %w", err)
	}
	defer lock.Release()
	return operation()
}

func storeEntryLocked(memoryPath string, section MemorySection, entry string, date string) error {
	existing, err := readMemoryFileIfPresent(memoryPath)
	if err != nil {
		return err
	}
	content, err := updateMemoryMarkdown(existing, section, entry, date)
	if err != nil {
		return err
	}
	return writeMemoryFileAtomic(memoryPath, content)
}

func readMemoryFileIfPresent(memoryPath string) (string, error) {
	content, err := os.ReadFile(memoryPath)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read memory file: %w", err)
	}
	return string(content), nil
}

func writeMemoryFileAtomic(memoryPath string, content string) error {
	directory := filepath.Dir(memoryPath)
	if err := os.MkdirAll(directory, memoryDirectoryMode); err != nil {
		return fmt.Errorf("create memory directory: %w", err)
	}
	if info, err := os.Lstat(memoryPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%w: %s must not be a symbolic link", ErrUnsafeMemoryPath, memoryFileName)
	}
	temporaryFile, err := os.CreateTemp(directory, ".MEMORY.md-*")
	if err != nil {
		return fmt.Errorf("create temporary memory file: %w", err)
	}
	temporaryPath := temporaryFile.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if err := writeTemporaryContent(temporaryFile, content); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, memoryPath); err != nil {
		return fmt.Errorf("replace memory file: %w", err)
	}
	return nil
}

func writeTemporaryContent(file *os.File, content string) error {
	if err := file.Chmod(memoryFileMode); err != nil {
		_ = file.Close()
		return fmt.Errorf("set temporary memory file mode: %w", err)
	}
	if _, err := file.WriteString(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("write temporary memory file: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync temporary memory file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close temporary memory file: %w", err)
	}
	return nil
}

func resolveMemoryPath(memoryRoot string, relativePath string) (string, error) {
	trimmedPath := strings.TrimSpace(relativePath)
	if trimmedPath == "" || filepath.IsAbs(trimmedPath) || strings.ContainsRune(trimmedPath, 0) {
		return "", fmt.Errorf("%w: memory path must be relative to %s", ErrUnsafeMemoryPath, projectContextDirectoryName)
	}
	path := filepath.Join(memoryRoot, filepath.Clean(trimmedPath))
	relative, err := filepath.Rel(memoryRoot, path)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%w: memory path must stay inside %s", ErrUnsafeMemoryPath, projectContextDirectoryName)
	}
	if err := assertNoSymlinkAncestors(memoryRoot, path); err != nil {
		return "", err
	}
	return path, nil
}

// assertNoSymlinkAncestors rejects symlinked directories or files below the
// resolved memory root, so a checked-in symlink cannot escape the root.
func assertNoSymlinkAncestors(memoryRoot string, path string) error {
	relative, err := filepath.Rel(memoryRoot, path)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnsafeMemoryPath, err)
	}
	current := memoryRoot
	for segment := range strings.SplitSeq(relative, string(filepath.Separator)) {
		current = filepath.Join(current, segment)
		info, statErr := os.Lstat(current)
		if errors.Is(statErr, os.ErrNotExist) {
			return nil
		}
		if statErr != nil {
			return fmt.Errorf("inspect memory path: %w", statErr)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%w: %s must not be a symbolic link", ErrUnsafeMemoryPath, current)
		}
	}
	return nil
}

func findProjectRoot(startDirectory string) string {
	current, err := filepath.Abs(startDirectory)
	if err != nil {
		return startDirectory
	}
	for {
		if pathExists(filepath.Join(current, projectContextDirectoryName)) || pathExists(filepath.Join(current, ".git")) {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return current
		}
		current = parent
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// isUnderYishanStore rejects the Yishan context and memory stores as project
// roots; the real project root is the worktree that links its .my-context.
func isUnderYishanStore(projectRoot string) bool {
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	for _, subdirectory := range []string{"contexts", "memory"} {
		storeRoot := filepath.Join(homeDirectory, ".yishan", subdirectory)
		relative, relErr := filepath.Rel(storeRoot, projectRoot)
		if relErr == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			return true
		}
	}
	return false
}
