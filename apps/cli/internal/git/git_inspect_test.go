package git

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGitServiceInspect_CanonicalCheckoutRoot(t *testing.T) {
	root, canonicalRoot, subdir, alias, relativeRoot := createInspectPaths(t)
	for _, path := range []string{root, root + "/", root + "/subdir/..", relativeRoot, subdir, alias, filepath.Join(alias, "subdir")} {
		t.Run(path, func(t *testing.T) {
			inspection, err := NewGitService().Inspect(context.Background(), path)
			if err != nil {
				t.Fatal(err)
			}
			payload, err := json.Marshal(inspection)
			if err != nil {
				t.Fatal(err)
			}
			var wire struct {
				IsGitRepository bool   `json:"isGitRepository"`
				RepositoryRoot  string `json:"repositoryRoot"`
			}
			if err := json.Unmarshal(payload, &wire); err != nil {
				t.Fatal(err)
			}
			if !wire.IsGitRepository || wire.RepositoryRoot != canonicalRoot {
				t.Fatalf("inspection = %s, want repository root %q", payload, canonicalRoot)
			}
		})
	}
}

func createInspectPaths(t *testing.T) (string, string, string, string, string) {
	t.Helper()
	root := t.TempDir()
	initGitRepo(t, root)
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	subdir := filepath.Join(root, "subdir")
	if err := os.Mkdir(subdir, 0o755); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	relativeRoot, err := filepath.Rel(mustWorkingDirectory(t), root)
	if err != nil {
		t.Fatal(err)
	}
	return root, canonicalRoot, subdir, alias, relativeRoot
}

func mustWorkingDirectory(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return directory
}

func TestGitServiceInspect_NonRepositoryOmitsRoot(t *testing.T) {
	inspection, err := NewGitService().Inspect(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(inspection)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != `{"isGitRepository":false}` {
		t.Fatalf("inspection = %s", payload)
	}
}
