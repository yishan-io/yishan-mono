package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveManagedWindowsBinaryInPath_UsesPathAndPATHEXTExtensionOrder(t *testing.T) {
	firstDir := t.TempDir()
	secondDir := t.TempDir()
	want := filepath.Join(secondDir, "pi.EXE")
	if err := os.WriteFile(want, nil, 0o755); err != nil {
		t.Fatalf("write managed shim: %v", err)
	}
	got := resolveManagedWindowsBinaryInPath("pi", strings.Join([]string{"", firstDir, secondDir}, ":"), " .CMD; .EXE; ", ":", func(candidate string) bool {
		info, err := os.Stat(candidate)
		return err == nil && !info.IsDir()
	})
	if got != want {
		t.Fatalf("managed Windows shim = %q, want %q", got, want)
	}
}
