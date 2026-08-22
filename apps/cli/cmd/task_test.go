package cmd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveLegacyImportContextRoot_UsesWorkspaceSymlink(t *testing.T) {
	worktreePath := t.TempDir()
	contextRoot := t.TempDir()
	if err := os.Symlink(contextRoot, filepath.Join(worktreePath, ".my-context")); err != nil {
		t.Fatal(err)
	}
	resolvedRoot, err := resolveLegacyImportContextRoot(worktreePath)
	if err != nil {
		t.Fatalf("resolve legacy context root: %v", err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatalf("resolve canonical context root: %v", err)
	}
	if resolvedRoot != canonicalRoot {
		t.Fatalf("resolved root = %q, want %q", resolvedRoot, canonicalRoot)
	}
}

func TestReadLegacyImportFlags_RequiresInputs(t *testing.T) {
	command := taskImportLegacyCmd
	command.SetArgs(nil)
	if _, _, err := readLegacyImportFlags(command); err == nil {
		t.Fatal("expected missing import flags error")
	}
}
