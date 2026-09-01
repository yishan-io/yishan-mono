package localtask

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

var taskDocumentFiles = map[string]string{
	"plan": "plan.md", "notes": "notes.md", "outcome": "outcome.md",
}

// TaskDocumentRequest identifies one admitted-workspace Task Context document operation.
type TaskDocumentRequest struct {
	TaskID        string
	WorkspaceRoot string
	Document      string
	Content       string
}

type taskDocumentPath struct {
	root          *os.Root
	canonicalRoot string
	workspaceRoot string
	directory     string
	file          string
}

type documentLock struct {
	mutex sync.Mutex
	refs  int
}

type documentLockSet struct {
	mutex sync.Mutex
	locks map[string]*documentLock
}

// ReadTaskDocument reads one regular Task Context document from the admitted workspace root.
func (s *Service) ReadTaskDocument(ctx context.Context, request TaskDocumentRequest) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	_, path, err := s.taskDocumentTarget(ctx, request, false)
	if err != nil {
		return "", err
	}
	defer path.root.Close()
	var content string
	err = s.documents.withLock(path.absolutePath(), func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		data, readErr := readRootDocument(path)
		content = string(data)
		return readErr
	})
	return content, err
}

// WriteTaskDocument atomically replaces one Task Context document.
func (s *Service) WriteTaskDocument(ctx context.Context, request TaskDocumentRequest) error {
	task, path, err := s.taskDocumentTarget(ctx, request, true)
	if err != nil {
		return err
	}
	defer path.root.Close()
	return s.documents.withLock(path.absolutePath(), func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		return s.writeAndNotifyTaskDocument(ctx, task, path, request.Content)
	})
}

// AppendTaskNote serializes one complete notes read-modify-write operation.
func (s *Service) AppendTaskNote(ctx context.Context, request TaskDocumentRequest) error {
	if request.Document != "notes" {
		return errors.New("task append requires notes document")
	}
	task, path, err := s.taskDocumentTarget(ctx, request, true)
	if err != nil {
		return err
	}
	defer path.root.Close()
	return s.documents.withLock(path.absolutePath(), func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		existing, readErr := readOptionalRootDocument(path)
		if readErr != nil {
			return readErr
		}
		return s.writeAndNotifyTaskDocument(ctx, task, path, string(existing)+request.Content)
	})
}

// FinishTask stores outcome before changing task status to done.
func (s *Service) FinishTask(ctx context.Context, request TaskDocumentRequest) (domain.Task, error) {
	if request.Document != "outcome" {
		return domain.Task{}, errors.New("task finish requires outcome document")
	}
	task, path, err := s.taskDocumentTarget(ctx, request, true)
	if err != nil {
		return domain.Task{}, err
	}
	defer path.root.Close()
	var finished domain.Task
	err = s.documents.withLock(path.absolutePath(), func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if writeErr := s.writeAndNotifyTaskDocument(ctx, task, path, request.Content); writeErr != nil {
			return writeErr
		}
		if task.Status == domain.StatusDone {
			finished = task
			return nil
		}
		status := domain.StatusDone
		value, updateErr := s.Update(ctx, rpc.LocalTaskUpdateParams{ID: task.ID, Status: &status})
		if updateErr != nil {
			return fmt.Errorf("outcome was saved, but task completion failed; retry task_finish: %w", updateErr)
		}
		finished = value.(domain.Task)
		return nil
	})
	return finished, err
}

func (s *Service) taskDocumentTarget(ctx context.Context, request TaskDocumentRequest, create bool) (domain.Task, taskDocumentPath, error) {
	task, err := s.deps.Repository.Get(ctx, request.TaskID)
	if err != nil {
		return domain.Task{}, taskDocumentPath{}, err
	}
	path, err := resolveTaskDocumentPath(request, create)
	return task, path, err
}

func resolveTaskDocumentPath(request TaskDocumentRequest, create bool) (taskDocumentPath, error) {
	file, ok := taskDocumentFiles[request.Document]
	if !ok || request.TaskID == "" || request.WorkspaceRoot == "" {
		return taskDocumentPath{}, errors.New("invalid task document request")
	}
	directory, err := domain.ResolveProjectContextPath(request.WorkspaceRoot, request.TaskID)
	if err != nil {
		return taskDocumentPath{}, err
	}
	canonicalRoot, err := filepath.EvalSymlinks(filepath.Join(request.WorkspaceRoot, ".my-context"))
	if err != nil {
		return taskDocumentPath{}, fmt.Errorf("resolve task context root: %w", err)
	}
	root, err := os.OpenRoot(canonicalRoot)
	if err != nil {
		return taskDocumentPath{}, fmt.Errorf("open task context root: %w", err)
	}
	relative, err := filepath.Rel(canonicalRoot, directory)
	if err != nil || relative == ".." || filepath.IsAbs(relative) {
		root.Close()
		return taskDocumentPath{}, errors.New("task document path escapes context root")
	}
	path := taskDocumentPath{root: root, canonicalRoot: canonicalRoot, workspaceRoot: request.WorkspaceRoot, directory: relative, file: filepath.Join(relative, file)}
	if create {
		err = ensureTaskDocumentDirectory(root, relative)
	} else {
		err = validateTaskDocumentDirectory(root, relative)
	}
	if err != nil {
		root.Close()
		return taskDocumentPath{}, err
	}
	return path, nil
}

func ensureTaskDocumentDirectory(root *os.Root, directory string) error {
	parts := []string{"task-context", directory}
	for _, path := range parts {
		if err := ensureRootDirectory(root, path); err != nil {
			return err
		}
	}
	return nil
}

func ensureRootDirectory(root *os.Root, path string) error {
	info, err := root.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		if err := root.Mkdir(path, 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return fmt.Errorf("create task document directory: %w", err)
		}
		info, err = root.Lstat(path)
	}
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("task document directory is unsafe")
	}
	return nil
}

func validateTaskDocumentDirectory(root *os.Root, directory string) error {
	if err := ensureExistingRootDirectory(root, "task-context"); err != nil {
		return err
	}
	return ensureExistingRootDirectory(root, directory)
}

func ensureExistingRootDirectory(root *os.Root, path string) error {
	info, err := root.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("task document directory is unsafe")
	}
	return nil
}

func readRootDocument(path taskDocumentPath) ([]byte, error) {
	info, err := path.root.Lstat(path.file)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("task document is not a regular file")
	}
	return path.root.ReadFile(path.file)
}

func readOptionalRootDocument(path taskDocumentPath) ([]byte, error) {
	info, err := path.root.Lstat(path.file)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("task document is not a regular file")
	}
	return path.root.ReadFile(path.file)
}

func (s *Service) writeAndNotifyTaskDocument(ctx context.Context, task domain.Task, path taskDocumentPath, content string) error {
	if err := writeRootDocument(path, content); err != nil {
		return err
	}
	if s.deps.TaskDocumentChanged != nil {
		if err := s.deps.TaskDocumentChanged(ctx, path.absolutePath(), path.workspaceRoot, task); err != nil {
			return fmt.Errorf("index task document: %w", err)
		}
	}
	return nil
}

func writeRootDocument(path taskDocumentPath, content string) error {
	if info, err := path.root.Lstat(path.file); err == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return errors.New("task document is not a regular file")
	} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	staging := filepath.Join(path.directory, ".task-document-"+uuid.NewString())
	file, err := path.root.OpenFile(staging, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create task document staging file: %w", err)
	}
	defer path.root.Remove(staging)
	if _, err := file.WriteString(content); err != nil {
		file.Close()
		return fmt.Errorf("write task document: %w", err)
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return fmt.Errorf("sync task document: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close task document: %w", err)
	}
	if info, err := path.root.Lstat(path.file); err == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return errors.New("task document became unsafe")
	} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err := validateTaskDocumentDirectory(path.root, path.directory); err != nil {
		return err
	}
	if err := path.root.Rename(staging, path.file); err != nil {
		return fmt.Errorf("replace task document: %w", err)
	}
	return nil
}

func (path taskDocumentPath) absolutePath() string {
	return filepath.Join(path.canonicalRoot, path.file)
}

func (set *documentLockSet) withLock(key string, operation func() error) error {
	lock := set.acquire(key)
	defer set.release(key, lock)
	lock.mutex.Lock()
	defer lock.mutex.Unlock()
	return operation()
}

func (set *documentLockSet) acquire(key string) *documentLock {
	set.mutex.Lock()
	defer set.mutex.Unlock()
	if set.locks == nil {
		set.locks = make(map[string]*documentLock)
	}
	lock := set.locks[key]
	if lock == nil {
		lock = &documentLock{}
		set.locks[key] = lock
	}
	lock.refs++
	return lock
}

func (set *documentLockSet) release(key string, lock *documentLock) {
	set.mutex.Lock()
	defer set.mutex.Unlock()
	lock.refs--
	if lock.refs == 0 {
		delete(set.locks, key)
	}
}
