package logx

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileWriter_BasicWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")

	fw, err := NewFileWriter(FileWriterConfig{Path: path, MaxBytes: 1024, MaxFiles: 3})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	defer fw.Close()

	msg := "hello world\n"
	n, err := fw.Write([]byte(msg))
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if n != len(msg) {
		t.Fatalf("Write: got %d bytes, want %d", n, len(msg))
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(content) != msg {
		t.Fatalf("content = %q, want %q", content, msg)
	}
}

func TestFileWriter_RotatesAtMaxBytes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")

	// Small max to trigger rotation quickly
	fw, err := NewFileWriter(FileWriterConfig{Path: path, MaxBytes: 50, MaxFiles: 3})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	defer fw.Close()

	// Write enough to trigger rotation
	line := "abcdefghij1234567890\n" // 21 bytes
	for i := 0; i < 5; i++ {
		if _, err := fw.Write([]byte(line)); err != nil {
			t.Fatalf("Write %d: %v", i, err)
		}
	}

	// The current file should exist and be small (post-rotation)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat current: %v", err)
	}
	if info.Size() > 50 {
		t.Errorf("current file size %d exceeds max 50", info.Size())
	}

	// At least one rotated file should exist
	rotated1 := path + ".1"
	if _, err := os.Stat(rotated1); os.IsNotExist(err) {
		t.Error("expected rotated file .1 to exist")
	}
}

func TestFileWriter_RespectsMaxFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")

	fw, err := NewFileWriter(FileWriterConfig{Path: path, MaxBytes: 30, MaxFiles: 2})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	defer fw.Close()

	line := strings.Repeat("x", 25) + "\n" // 26 bytes
	// Write enough to trigger multiple rotations
	for i := 0; i < 10; i++ {
		if _, err := fw.Write([]byte(line)); err != nil {
			t.Fatalf("Write %d: %v", i, err)
		}
	}

	// Should have at most maxFiles (2) rotated files
	if _, err := os.Stat(path + ".1"); os.IsNotExist(err) {
		t.Error("expected .1 to exist")
	}
	if _, err := os.Stat(path + ".2"); os.IsNotExist(err) {
		t.Error("expected .2 to exist")
	}
	// .3 should NOT exist
	if _, err := os.Stat(path + ".3"); !os.IsNotExist(err) {
		t.Error("expected .3 to NOT exist (max files = 2)")
	}
}

func TestFileWriter_AppendsOnReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")

	// First writer
	fw1, err := NewFileWriter(FileWriterConfig{Path: path, MaxBytes: 1024})
	if err != nil {
		t.Fatalf("NewFileWriter 1: %v", err)
	}
	if _, err := fw1.Write([]byte("first\n")); err != nil {
		t.Fatalf("Write 1: %v", err)
	}
	fw1.Close()

	// Second writer (simulates daemon restart)
	fw2, err := NewFileWriter(FileWriterConfig{Path: path, MaxBytes: 1024})
	if err != nil {
		t.Fatalf("NewFileWriter 2: %v", err)
	}
	if _, err := fw2.Write([]byte("second\n")); err != nil {
		t.Fatalf("Write 2: %v", err)
	}
	fw2.Close()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(content) != "first\nsecond\n" {
		t.Fatalf("content = %q, want %q", content, "first\nsecond\n")
	}
}

func TestFileWriter_CreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "deep", "nested", "dir", "test.log")

	fw, err := NewFileWriter(FileWriterConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	defer fw.Close()

	if _, err := fw.Write([]byte("test\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("log file should exist: %v", err)
	}
}

func TestFileWriter_PathReturnsConfiguredPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")

	fw, err := NewFileWriter(FileWriterConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	defer fw.Close()

	if fw.Path() != path {
		t.Fatalf("Path() = %q, want %q", fw.Path(), path)
	}
}

func TestFileWriter_RequiresPath(t *testing.T) {
	_, err := NewFileWriter(FileWriterConfig{})
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}
