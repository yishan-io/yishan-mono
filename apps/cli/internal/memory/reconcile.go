package memory

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	myContextDir    = ".my-context"
	architectureDir = "architecture"
	tasksDir        = "tasks"
	futureDir       = "future-improvement"
)

// classifyFileType derives FileType from the path relative to the canonical
// context root (~/.yishan/contexts/<repoKey>/).
// contextRoot must be the resolved (non-symlink) context directory.
func classifyFileType(absPath string, contextRoot string) FileType {
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
	// ProjectPath is the canonical context root for this file.
	ProjectPath string
	ProjectID   string
}

func scanWorkspaces(refs []WorkspaceRef, globalMemoryDir string) ([]diskFile, error) {
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

	return files, nil
}

func scanContextDir(contextRoot string, projectID string) ([]diskFile, error) {
	var files []diskFile
	err := filepath.WalkDir(contextRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
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
			ProjectPath: globalDir,
			ProjectID:   "",
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

type ReconcileResult struct {
	Inserted int
	Updated  int
	Deleted  int
}

func (db *DB) Reconcile(refs []WorkspaceRef, globalMemoryDir string) (ReconcileResult, error) {
	diskFiles, err := scanWorkspaces(refs, globalMemoryDir)
	if err != nil {
		return ReconcileResult{}, err
	}

	dbPaths, err := db.AllPaths()
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("read db paths: %w", err)
	}

	now := time.Now().Unix()
	var result ReconcileResult

	diskPathSet := make(map[string]bool, len(diskFiles))
	for _, df := range diskFiles {
		diskPathSet[df.Path] = true

		existing, found, getErr := db.GetByPath(df.Path)
		if getErr != nil {
			return result, fmt.Errorf("get db file %s: %w", df.Path, getErr)
		}

		// Skip if content and project metadata are unchanged.
		if found &&
			existing.Fingerprint == df.Fingerprint &&
			existing.ProjectID == df.ProjectID {
			continue
		}

		fileType := classifyFileType(df.Path, df.ProjectPath)

		if err := db.UpsertFile(MemoryFile{
			Path:        df.Path,
			ProjectPath: df.ProjectPath,
			ProjectID:   df.ProjectID,
			Type:        fileType,
			Body:        df.Body,
			Fingerprint: df.Fingerprint,
			IndexedAt:   now,
		}); err != nil {
			return result, fmt.Errorf("upsert %s: %w", df.Path, err)
		}
		if found {
			result.Updated++
		} else {
			result.Inserted++
		}
	}

	for _, dbPath := range dbPaths {
		if !diskPathSet[dbPath] {
			if err := db.DeleteByPath(dbPath); err != nil {
				return result, fmt.Errorf("delete db %s: %w", dbPath, err)
			}
			result.Deleted++
		}
	}

	return result, nil
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

	return db.UpsertFile(MemoryFile{
		Path:        filePath,
		ProjectPath: contextRoot,
		ProjectID:   projectID,
		Type:        fileType,
		Body:        string(body),
		Fingerprint: fingerprint(body),
		IndexedAt:   now,
	})
}
