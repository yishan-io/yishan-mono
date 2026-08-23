package memory

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// WorkspaceRef carries the workspace metadata needed for memory indexing.
// WorktreePath is the git worktree directory that contains the .my-context symlink.
// ProjectID is the project ID from the Workspace struct (may be empty for unregistered workspaces).
type WorkspaceRef struct {
	WorktreePath string
	ProjectID    string
}

const (
	myContextDir    = ".my-context"
	architectureDir = "architecture"
	archiveDir      = "archive"
	tasksDir        = "tasks"
	futureDir       = "future-improvement"
)

// classifyFileType derives fileType from the path relative to the canonical
// context root (~/.yishan/contexts/<repoKey>/).
// contextRoot must be the resolved (non-symlink) context directory.
func classifyFileType(absPath string, contextRoot string) fileType {
	if contextRoot == "" {
		return FileTypeGlobal
	}
	rel, err := filepath.Rel(contextRoot, absPath)
	if err != nil {
		return FileTypeGlobal
	}
	parts := strings.SplitN(filepath.ToSlash(rel), "/", 3)
	if len(parts) == 0 || parts[0] == ".." {
		// Path is not under contextRoot.
		return FileTypeGlobal
	}
	// Files directly under contextRoot (e.g. MEMORY.md) are type memory.
	if len(parts) == 1 {
		return FileTypeMemory
	}
	switch parts[0] {
	case architectureDir:
		return FileTypeArchitecture
	case archiveDir:
		return FileTypeArchive
	case tasksDir:
		return FileTypeTask
	case futureDir:
		return FileTypeFuture
	default:
		return FileTypeMemory
	}
}

// resolveContextRoot resolves the .my-context symlink inside worktreePath to
// its canonical target. Returns "" if the symlink does not exist.
func resolveContextRoot(worktreePath string) string {
	linkPath := filepath.Join(worktreePath, myContextDir)
	resolved, err := filepath.EvalSymlinks(linkPath)
	if err != nil {
		// Symlink absent or broken — fall back to the literal path.
		// This handles the case where .my-context is a real directory
		// (e.g. in tests or non-standard setups).
		info, statErr := os.Stat(linkPath)
		if statErr != nil || !info.IsDir() {
			return ""
		}
		return linkPath
	}
	return resolved
}

type diskFile struct {
	Path        string
	Body        string
	Fingerprint string
	// ProjectPath is the canonical context root for this file, used for filtering.
	ProjectPath string
	ProjectID   string
	// explicitType overrides classifyFileType when non-empty.
	// Set for global files which have a known type independent of path structure.
	explicitType fileType
	Source       string
	TaskID       string
	TaskTitle    string
	DocumentType string
}

func scanWorkspaces(refs []WorkspaceRef, globalMemoryDir string, taskContexts []TaskContextRef) ([]diskFile, error) {
	var files []diskFile
	for _, ref := range refs {
		contextRoot := resolveContextRoot(ref.WorktreePath)
		if contextRoot == "" {
			continue
		}
		wtFiles, err := scanContextDir(contextRoot, ref.ProjectID)
		if err != nil {
			continue
		}
		files = append(files, wtFiles...)
	}

	if globalMemoryDir != "" {
		globalFiles, err := scanGlobalDir(globalMemoryDir)
		if err == nil {
			files = append(files, globalFiles...)
		}
	}

	taskFiles, err := scanTaskContexts(taskContexts)
	if err != nil {
		return nil, err
	}
	return append(files, taskFiles...), nil
}

func scanContextDir(contextRoot string, projectID string) ([]diskFile, error) {
	var files []diskFile
	err := filepath.WalkDir(contextRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if filepath.Clean(path) == filepath.Join(filepath.Clean(contextRoot), taskContextDirectory) {
				return filepath.SkipDir
			}
			// Skip nested .my-context duplicates under the canonical context root.
			if entry.Name() == myContextDir && path != contextRoot {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(entry.Name(), ".md") {
			return nil
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		files = append(files, diskFile{
			Path:        path,
			Body:        string(body),
			Fingerprint: fingerprint(body),
			ProjectPath: contextRoot,
			ProjectID:   projectID,
		})
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("walk context dir %s: %w", contextRoot, err)
	}
	return files, nil
}

func scanGlobalDir(globalDir string) ([]diskFile, error) {
	var files []diskFile
	err := filepath.WalkDir(globalDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			// Skip nested .my-context duplicates, mirroring scanContextDir.
			if entry.Name() == myContextDir && path != globalDir {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(entry.Name(), ".md") {
			return nil
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		files = append(files, diskFile{
			Path:         path,
			Body:         string(body),
			Fingerprint:  fingerprint(body),
			ProjectPath:  globalDir,
			ProjectID:    "",
			explicitType: FileTypeGlobal,
		})
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("walk global dir %s: %w", globalDir, err)
	}
	return files, nil
}

func fingerprint(body []byte) string {
	sum := sha256.Sum256(body)
	return fmt.Sprintf("%x", sum[:8])
}

type reconcileResult struct {
	Inserted int
	Updated  int
	Deleted  int
}

func (db *DB) Reconcile(refs []WorkspaceRef, globalMemoryDir string) (reconcileResult, error) {
	return db.ReconcileWithTaskContexts(refs, globalMemoryDir, nil)
}

func (db *DB) ReconcileWithTaskContexts(refs []WorkspaceRef, globalMemoryDir string, taskContexts []TaskContextRef) (reconcileResult, error) {
	diskFiles, err := scanWorkspaces(refs, globalMemoryDir, taskContexts)
	if err != nil {
		return reconcileResult{}, err
	}
	dbPaths, err := db.AllPaths()
	if err != nil {
		return reconcileResult{}, fmt.Errorf("read db paths: %w", err)
	}
	result, diskPaths, err := db.reconcileDiskFiles(diskFiles)
	if err != nil {
		return result, err
	}
	if err := db.deleteMissingFiles(dbPaths, diskPaths, &result); err != nil {
		return result, err
	}
	return result, nil
}

func (db *DB) reconcileDiskFiles(files []diskFile) (reconcileResult, map[string]bool, error) {
	result := reconcileResult{}
	diskPaths := make(map[string]bool, len(files))
	now := time.Now().Unix()
	for _, candidate := range files {
		diskPaths[candidate.Path] = true
		wasFound, wasChanged, err := db.reconcileDiskFile(candidate, now)
		if err != nil {
			return result, diskPaths, err
		}
		if wasChanged && wasFound {
			result.Updated++
		} else if wasChanged {
			result.Inserted++
		}
	}
	return result, diskPaths, nil
}

func (db *DB) reconcileDiskFile(candidate diskFile, indexedAt int64) (bool, bool, error) {
	existing, wasFound, err := db.GetByPath(candidate.Path)
	if err != nil {
		return false, false, fmt.Errorf("get db file %s: %w", candidate.Path, err)
	}
	if wasFound && isUnchanged(existing, candidate) {
		return true, false, nil
	}
	fileType := candidate.explicitType
	if fileType == "" {
		fileType = classifyFileType(candidate.Path, candidate.ProjectPath)
	}
	err = db.UpsertFile(memoryFile{
		Path: candidate.Path, ProjectPath: candidate.ProjectPath, ProjectID: candidate.ProjectID,
		Type: fileType, Source: candidate.Source, TaskID: candidate.TaskID,
		TaskTitle: candidate.TaskTitle, DocumentType: candidate.DocumentType, Body: candidate.Body,
		Fingerprint: candidate.Fingerprint, IndexedAt: indexedAt,
	})
	if err != nil {
		return wasFound, false, fmt.Errorf("upsert %s: %w", candidate.Path, err)
	}
	return wasFound, true, nil
}

func (db *DB) deleteMissingFiles(dbPaths []string, diskPaths map[string]bool, result *reconcileResult) error {
	for _, dbPath := range dbPaths {
		if diskPaths[dbPath] {
			continue
		}
		if err := db.DeleteByPath(dbPath); err != nil {
			return fmt.Errorf("delete db %s: %w", dbPath, err)
		}
		result.Deleted++
	}
	return nil
}

func isUnchanged(existing memoryFile, disk diskFile) bool {
	source := disk.Source
	if source == "" {
		source = SourceMemory
	}
	return existing.Fingerprint == disk.Fingerprint &&
		existing.ProjectID == disk.ProjectID && existing.Source == source &&
		existing.TaskID == disk.TaskID && existing.TaskTitle == disk.TaskTitle &&
		existing.DocumentType == disk.DocumentType
}

// IndexFileOnDisk indexes or removes a single file.
// contextRoot is the canonical context directory resolved via EvalSymlinks;
// the caller derives it from resolveContextRoot(worktreePath).
func (db *DB) IndexFileOnDisk(filePath string, contextRoot string, projectID string) error {
	body, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return db.DeleteByPath(filePath)
		}
		return fmt.Errorf("read file %s: %w", filePath, err)
	}

	now := time.Now().Unix()
	fileType := classifyFileType(filePath, contextRoot)

	return db.UpsertFile(memoryFile{
		Path:        filePath,
		ProjectPath: contextRoot,
		ProjectID:   projectID,
		Type:        fileType,
		Body:        string(body),
		Fingerprint: fingerprint(body),
		IndexedAt:   now,
	})
}
