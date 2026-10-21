package process

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func setupSessionLookup(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	cwd := filepath.Join(home, "workspace")
	return cwd, filepath.Join(home, ".yishan", "pi", "agent", "sessions", encodeSessionCWD(cwd))
}

func writeLookupTranscript(t *testing.T, dir, name string) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(`{"type":"session","id":"header-id"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestFindSessionFile_StorageLocations(t *testing.T) {
	cases := []struct {
		name  string
		files []string
		want  string
	}{
		{"legacy", []string{"stamp_target.jsonl"}, "stamp_target.jsonl"},
		{"child", []string{"subagents/stamp_target.jsonl"}, "subagents/stamp_target.jsonl"},
		{"bare child filename", []string{"subagents/target.jsonl"}, "subagents/target.jsonl"},
		{"missing root", nil, ""},
		{"missing child directory", []string{"stamp_other.jsonl"}, ""},
		{"missing id", []string{"subagents/stamp_other.jsonl"}, ""},
		{"duplicate precedence", []string{"z_target.jsonl", "subagents/a_target.jsonl"}, "z_target.jsonl"},
		{"not recursive", []string{"subagents/deeper/stamp_target.jsonl"}, ""},
		{"exact id only", []string{"subagents/stamp_target-extra.jsonl", "subagents/stamp_target.txt"}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cwd, dir := setupSessionLookup(t)
			for _, name := range tc.files {
				writeLookupTranscript(t, filepath.Dir(filepath.Join(dir, name)), filepath.Base(name))
			}
			want := ""
			if tc.want != "" {
				want = filepath.Join(dir, tc.want)
			}
			found, err := FindSessionFile(context.Background(), cwd, "target")
			if err != nil || found != want {
				t.Fatalf("want %q, got %q, err=%v", want, found, err)
			}
		})
	}
}

func TestFindSessionFile_CanceledContext(t *testing.T) {
	for _, location := range []string{"missing", "empty", "child"} {
		t.Run(location, func(t *testing.T) {
			cwd, dir := setupSessionLookup(t)
			if location == "empty" {
				if err := os.MkdirAll(dir, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			if location == "child" {
				writeLookupTranscript(t, filepath.Join(dir, "subagents"), "target.jsonl")
			}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			found, err := FindSessionFile(ctx, cwd, "target")
			if found != "" || !errors.Is(err, context.Canceled) {
				t.Fatalf("found=%q err=%v", found, err)
			}
		})
	}
}

func TestFindSessionFile_WrapsDirectoryErrors(t *testing.T) {
	for _, location := range []string{"root", "subagents"} {
		t.Run(location, func(t *testing.T) {
			cwd, dir := setupSessionLookup(t)
			blocked := dir
			if location == "subagents" {
				blocked = filepath.Join(dir, location)
			}
			writeLookupTranscript(t, filepath.Dir(blocked), filepath.Base(blocked))
			found, err := FindSessionFile(context.Background(), cwd, "target")
			var pathErr *os.PathError
			if found != "" || !errors.As(err, &pathErr) || pathErr.Path != blocked || err == pathErr {
				t.Fatalf("want wrapped directory error for %q, found=%q err=%v", blocked, found, err)
			}
		})
	}
}

func TestListSessionSummaries_IgnoresChildDirectory(t *testing.T) {
	cwd, dir := setupSessionLookup(t)
	writeLookupTranscript(t, dir, "main.jsonl")
	// No parentSession header: isolation must come from nonrecursive discovery.
	child := writeLookupTranscript(t, filepath.Join(dir, "subagents"), "child.jsonl")
	newer := time.Now().Add(time.Hour)
	if err := os.Chtimes(child, newer, newer); err != nil {
		t.Fatal(err)
	}
	summaries, err := ListSessionSummaries(context.Background(), cwd)
	if err != nil || len(summaries) != 1 || summaries[0].SessionID != "header-id" {
		t.Fatalf("want only top-level history, summaries=%+v err=%v", summaries, err)
	}
}
