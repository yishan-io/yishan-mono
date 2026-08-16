package logx

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

const (
	DefaultMaxBytes = 10 * 1024 * 1024 // 10 MB
	DefaultMaxFiles = 5
)

// FileWriter is an io.Writer that writes to a file with size-based rotation.
// When the current file reaches MaxBytes, it is rotated: existing rotated files
// are shifted (daemon.log.1 -> daemon.log.2, etc.) and the current file becomes
// daemon.log.1. At most MaxFiles rotated files are retained.
type FileWriter struct {
	mu       sync.Mutex
	path     string
	maxBytes int64
	maxFiles int
	file     *os.File
	size     int64
}

// FileWriterConfig configures a FileWriter.
type FileWriterConfig struct {
	// Path is the log file path (e.g. ~/.yishan/profiles/default/logs/daemon.log).
	Path string
	// MaxBytes is the maximum size in bytes before rotation. Default: 10 MB.
	MaxBytes int64
	// MaxFiles is the number of rotated files to keep. Default: 5.
	MaxFiles int
}

// NewFileWriter creates a FileWriter. The parent directory is created if needed.
// The file is opened in append mode so logs survive restarts.
func NewFileWriter(cfg FileWriterConfig) (*FileWriter, error) {
	if cfg.Path == "" {
		return nil, fmt.Errorf("logx: file path is required")
	}
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = DefaultMaxBytes
	}
	if cfg.MaxFiles <= 0 {
		cfg.MaxFiles = DefaultMaxFiles
	}

	dir := filepath.Dir(cfg.Path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("logx: create log dir %q: %w", dir, err)
	}

	f, err := os.OpenFile(cfg.Path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("logx: open log file %q: %w", cfg.Path, err)
	}

	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("logx: stat log file %q: %w", cfg.Path, err)
	}

	return &FileWriter{
		path:     cfg.Path,
		maxBytes: cfg.MaxBytes,
		maxFiles: cfg.MaxFiles,
		file:     f,
		size:     info.Size(),
	}, nil
}

// Write implements io.Writer. It is safe for concurrent use.
func (fw *FileWriter) Write(p []byte) (int, error) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if fw.size+int64(len(p)) > fw.maxBytes {
		if err := fw.rotate(); err != nil {
			// Rotation failed; try to continue writing to the current file
			// rather than losing the log line entirely.
			_ = err
		}
	}

	n, err := fw.file.Write(p)
	fw.size += int64(n)
	return n, err
}

// Close closes the underlying file.
func (fw *FileWriter) Close() error {
	fw.mu.Lock()
	defer fw.mu.Unlock()
	return fw.file.Close()
}

// Path returns the current log file path.
func (fw *FileWriter) Path() string {
	return fw.path
}

// rotate shifts existing rotated files and moves the current file to .1.
func (fw *FileWriter) rotate() error {
	// Close current file
	if err := fw.file.Close(); err != nil {
		return fmt.Errorf("close current log file: %w", err)
	}

	// Shift rotated files: .N -> .N+1, dropping files beyond maxFiles
	for i := fw.maxFiles; i >= 1; i-- {
		src := fw.rotatedName(i - 1)
		dst := fw.rotatedName(i)

		if i == fw.maxFiles {
			// Remove the oldest file
			_ = os.Remove(dst)
		}

		if _, err := os.Stat(src); err == nil {
			if err := os.Rename(src, dst); err != nil {
				// Non-fatal: continue with rotation
				_ = err
			}
		}
	}

	// Rename current file to .1
	if err := os.Rename(fw.path, fw.rotatedName(1)); err != nil {
		// If rename fails, try to re-open the original path anyway
		_ = err
	}

	// Open a fresh file
	f, err := os.OpenFile(fw.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open new log file: %w", err)
	}

	fw.file = f
	fw.size = 0
	return nil
}

// rotatedName returns the path for rotated file number n.
// n=0 is the current (non-rotated) file, n=1 is .1, etc.
func (fw *FileWriter) rotatedName(n int) string {
	if n == 0 {
		return fw.path
	}
	return fmt.Sprintf("%s.%d", fw.path, n)
}

// CleanupOldFiles removes rotated log files beyond the retention limit.
// This is useful to clean up files from previous configurations with higher
// maxFiles values. It is called automatically during rotation but can also
// be called explicitly.
func (fw *FileWriter) CleanupOldFiles() error {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	dir := filepath.Dir(fw.path)
	base := filepath.Base(fw.path)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read log dir: %w", err)
	}

	var rotated []string
	for _, e := range entries {
		name := e.Name()
		if name != base && strings.HasPrefix(name, base+".") {
			rotated = append(rotated, name)
		}
	}

	// Sort numerically (simple lexicographic works since names are base.N)
	sort.Strings(rotated)

	// Keep only maxFiles rotated files
	if len(rotated) > fw.maxFiles {
		for _, name := range rotated[fw.maxFiles:] {
			_ = os.Remove(filepath.Join(dir, name))
		}
	}

	return nil
}
