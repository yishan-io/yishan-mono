package memory

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const taskContextDirectory = "task-context"

var taskContextDocuments = map[string]string{
	"plan.md": "plan", "notes.md": "notes", "outcome.md": "outcome",
}

// TaskContextRef registers one Local Task context root for Memory indexing.
type TaskContextRef struct {
	Directory string
	TaskID    string
	TaskTitle string
	ProjectID string
}

func canonicalTaskContextRoot(root string) string {
	cleaned := filepath.Clean(root)
	resolved, err := filepath.EvalSymlinks(cleaned)
	if err == nil {
		return filepath.Clean(resolved)
	}
	existing := cleaned
	missing := make([]string, 0)
	for {
		parent := filepath.Dir(existing)
		if parent == existing {
			return cleaned
		}
		missing = append(missing, filepath.Base(existing))
		existing = parent
		resolved, err = filepath.EvalSymlinks(existing)
		if err == nil {
			break
		}
	}
	for index := len(missing) - 1; index >= 0; index-- {
		resolved = filepath.Join(resolved, missing[index])
	}
	return filepath.Clean(resolved)
}

func scanTaskContexts(refs []TaskContextRef) ([]diskFile, error) {
	files := make([]diskFile, 0, len(refs)*len(taskContextDocuments))
	for _, ref := range refs {
		for fileName, documentType := range taskContextDocuments {
			taskFile, err := readTaskContextFile(ref, fileName, documentType)
			if err != nil {
				return nil, err
			}
			if taskFile.Path != "" {
				files = append(files, taskFile)
			}
		}
	}
	return files, nil
}

func readTaskContextFile(ref TaskContextRef, fileName string, documentType string) (diskFile, error) {
	path := filepath.Join(ref.Directory, fileName)
	body, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return diskFile{}, nil
	}
	if err != nil {
		return diskFile{}, fmt.Errorf("read task context file %s: %w", path, err)
	}
	return diskFile{
		Path: path, Body: string(body), Fingerprint: fingerprint(body),
		ProjectPath: ref.Directory, ProjectID: ref.ProjectID, explicitType: FileTypeTaskContext,
		Source: SourceTaskContext, TaskID: ref.TaskID, TaskTitle: ref.TaskTitle, DocumentType: documentType,
	}, nil
}

func isTopLevelTaskContextPath(path string, contextRoot string) bool {
	if strings.TrimSpace(contextRoot) == "" {
		return false
	}
	taskRoot := filepath.Join(canonicalTaskContextRoot(contextRoot), taskContextDirectory)
	relative, err := filepath.Rel(taskRoot, canonicalTaskContextRoot(path))
	return err == nil && relative != ".." && !filepath.IsAbs(relative) &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func isSupportedTaskContextPath(path string, root string) (string, bool) {
	path = canonicalTaskContextRoot(path)
	if filepath.Dir(path) != filepath.Clean(root) {
		return "", false
	}
	documentType, ok := taskContextDocuments[filepath.Base(path)]
	return documentType, ok
}

// RegisterTaskContexts replaces the managed Local Task context registrations without reconciling the index.
func (s *Service) RegisterTaskContexts(refs []TaskContextRef) {
	s.registerTaskContexts(refs)
}

func (s *Service) registerTaskContexts(refs []TaskContextRef) {
	s.taskContextsMu.Lock()
	defer s.taskContextsMu.Unlock()
	s.taskContexts = make(map[string]TaskContextRef, len(refs))
	for _, ref := range refs {
		root := canonicalTaskContextRoot(ref.Directory)
		ref.Directory = root
		s.taskContexts[root] = ref
	}
}

// UpdateTaskContextTitle updates registered metadata and existing indexed rows for one Local Task.
func (s *Service) UpdateTaskContextTitle(taskID string, taskTitle string) error {
	s.taskContextsMu.Lock()
	for root, ref := range s.taskContexts {
		if ref.TaskID == taskID {
			ref.TaskTitle = taskTitle
			s.taskContexts[root] = ref
		}
	}
	s.taskContextsMu.Unlock()
	return s.db.UpdateTaskContextTitle(taskID, taskTitle)
}

func (s *Service) findTaskContext(path string) (TaskContextRef, string, bool) {
	s.taskContextsMu.RLock()
	defer s.taskContextsMu.RUnlock()
	for root, ref := range s.taskContexts {
		if documentType, ok := isSupportedTaskContextPath(path, root); ok {
			return ref, documentType, true
		}
	}
	return TaskContextRef{}, "", false
}

func (s *Service) isManagedTaskContextPath(path string) bool {
	path = canonicalTaskContextRoot(path)
	s.taskContextsMu.RLock()
	defer s.taskContextsMu.RUnlock()
	for root := range s.taskContexts {
		relative, err := filepath.Rel(root, path)
		if err == nil && relative != "." && relative != ".." && !filepath.IsAbs(relative) &&
			!strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// IndexTaskContextFileOnDisk refreshes one supported registered Task Context document.
func (db *DB) IndexTaskContextFileOnDisk(path string, ref TaskContextRef, documentType string) error {
	taskFile, err := readTaskContextFile(ref, filepath.Base(path), documentType)
	if err != nil {
		return err
	}
	if taskFile.Path == "" {
		return db.DeleteByPath(path)
	}
	return db.UpsertFile(memoryFile{
		Path: taskFile.Path, ProjectPath: taskFile.ProjectPath, ProjectID: taskFile.ProjectID,
		Type: taskFile.explicitType, Source: taskFile.Source, TaskID: taskFile.TaskID,
		TaskTitle: taskFile.TaskTitle, DocumentType: taskFile.DocumentType, Body: taskFile.Body,
		Fingerprint: taskFile.Fingerprint, IndexedAt: time.Now().Unix(),
	})
}
