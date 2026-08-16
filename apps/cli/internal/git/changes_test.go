package git

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestGitServiceListChangesRenameScenarios(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runGit(t, root, "add", "a.txt")
	runGit(t, root, "commit", "-m", "seed")

	runGit(t, root, "mv", "a.txt", "b.txt")
	runGit(t, root, "add", "-A")
	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes for staged rename: %v", err)
	}
	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries for staged rename, got %+v", changes.Untracked)
	}
	if len(changes.Staged) != 1 || changes.Staged[0].Kind != "renamed" || changes.Staged[0].Path != "b.txt" {
		t.Fatalf("expected one staged renamed entry for b.txt, got %+v", changes.Staged)
	}

	if err := os.WriteFile(filepath.Join(root, "b.txt"), []byte("seed\nextra\n"), 0o644); err != nil {
		t.Fatalf("update renamed file: %v", err)
	}
	changes, err = svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes for renamed+modified: %v", err)
	}
	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries for renamed+modified, got %+v", changes.Untracked)
	}
	if len(changes.Staged) != 1 || changes.Staged[0].Kind != "renamed" || changes.Staged[0].Path != "b.txt" {
		t.Fatalf("expected staged rename entry for b.txt, got %+v", changes.Staged)
	}
	if len(changes.Unstaged) != 1 || changes.Unstaged[0].Kind != "modified" || changes.Unstaged[0].Path != "b.txt" {
		t.Fatalf("expected unstaged modified entry for b.txt, got %+v", changes.Unstaged)
	}
}

func TestGitServiceListChangesReconcilesDeleteAndUntrackedAsRename(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "AGENTS.md"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("write AGENTS.md: %v", err)
	}
	runGit(t, root, "add", "AGENTS.md")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.Remove(filepath.Join(root, "AGENTS.md")); err != nil {
		t.Fatalf("remove AGENTS.md: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "AGENTS1.md"), []byte("v2\n"), 0o644); err != nil {
		t.Fatalf("write AGENTS1.md: %v", err)
	}

	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes: %v", err)
	}

	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries after rename reconciliation, got %+v", changes.Untracked)
	}
	if len(changes.Unstaged) != 1 {
		t.Fatalf("expected one unstaged entry after rename reconciliation, got %+v", changes.Unstaged)
	}
	if changes.Unstaged[0].Kind != "renamed" || changes.Unstaged[0].Path != "AGENTS1.md" {
		t.Fatalf("expected one renamed unstaged entry for AGENTS1.md, got %+v", changes.Unstaged)
	}
}

func TestParseNameStatusLines(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect []gitCommitFile
	}{
		{
			name:   "empty",
			input:  "",
			expect: []gitCommitFile{},
		},
		{
			name:  "modified and added",
			input: "M\tsrc/foo.ts\nA\tsrc/bar.ts\n",
			expect: []gitCommitFile{
				{Path: "src/foo.ts", Status: "M"},
				{Path: "src/bar.ts", Status: "A"},
			},
		},
		{
			name:  "deleted",
			input: "D\told.ts",
			expect: []gitCommitFile{
				{Path: "old.ts", Status: "D"},
			},
		},
		{
			name:  "rename with similarity score",
			input: "R100\told.ts\tnew.ts",
			expect: []gitCommitFile{
				{Path: "new.ts", OldPath: "old.ts", Status: "R"},
			},
		},
		{
			name:  "copy",
			input: "C085\tsrc.ts\tdst.ts",
			expect: []gitCommitFile{
				{Path: "dst.ts", OldPath: "src.ts", Status: "C"},
			},
		},
		{
			name:  "ignores blank lines",
			input: "\nM\ta.ts\n\nD\tb.ts\n",
			expect: []gitCommitFile{
				{Path: "a.ts", Status: "M"},
				{Path: "b.ts", Status: "D"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseNameStatusLines(tc.input)
			if len(got) != len(tc.expect) {
				t.Fatalf("expected %d files, got %d: %+v", len(tc.expect), len(got), got)
			}
			for i, f := range got {
				e := tc.expect[i]
				if f.Path != e.Path || f.Status != e.Status || f.OldPath != e.OldPath {
					t.Errorf("index %d: expected %+v, got %+v", i, e, f)
				}
			}
		})
	}
}
