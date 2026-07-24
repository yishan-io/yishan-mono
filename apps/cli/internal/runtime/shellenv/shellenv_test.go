package shellenv

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestNormalizePathValueExpandsTildeEntries(t *testing.T) {
	homeDir := filepath.Join(string(os.PathSeparator), "Users", "testuser")
	got := normalizePathValue("~/bin:/usr/local/bin:~:relative", homeDir)
	want := filepath.Join(homeDir, "bin") + string(os.PathListSeparator) + "/usr/local/bin" + string(os.PathListSeparator) + homeDir + string(os.PathListSeparator) + "relative"
	if got != want {
		t.Fatalf("normalizePathValue() = %q, want %q", got, want)
	}
}

func TestResolveExecutablePathFromEnvExpandsTildePathEntries(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("executable bit semantics differ on windows")
	}

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	binDir := filepath.Join(homeDir, ".opencode", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() = %v", err)
	}

	exePath := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(exePath, []byte("#!/bin/sh\necho ok\n"), 0o755); err != nil {
		t.Fatalf("WriteFile() = %v", err)
	}

	got := ResolveExecutablePathFromEnv("opencode", []string{"PATH=~/.opencode/bin"})
	if got != exePath {
		t.Fatalf("ResolveExecutablePathFromEnv() = %q, want %q", got, exePath)
	}
}

func TestMergeEnvs(t *testing.T) {
	tests := []struct {
		name     string
		base     []string
		override []string
		want     []string
	}{
		{
			name:     "nil base returns override as new slice",
			base:     nil,
			override: []string{"KEY=val"},
			want:     []string{"KEY=val"},
		},
		{
			name:     "nil override returns copy of base",
			base:     []string{"KEY=orig"},
			override: nil,
			want:     []string{"KEY=orig"},
		},
		{
			name:     "override wins on conflict",
			base:     []string{"KEY=base", "OTHER=keep"},
			override: []string{"KEY=new"},
			want:     []string{"KEY=new", "OTHER=keep"},
		},
		{
			name:     "new keys from override are appended",
			base:     []string{"A=1"},
			override: []string{"B=2"},
			want:     []string{"A=1", "B=2"},
		},
		{
			name:     "override entries without = are skipped",
			base:     []string{"A=1"},
			override: []string{"NOVALUE", "B=2"},
			want:     []string{"A=1", "B=2"},
		},
		{
			name:     "value containing = round-trips correctly",
			base:     []string{"A=1"},
			override: []string{"B=x=y=z"},
			want:     []string{"A=1", "B=x=y=z"},
		},
		{
			name:     "base is not mutated",
			base:     []string{"A=1", "B=2"},
			override: []string{"A=99"},
			want:     []string{"A=99", "B=2"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			origBase := append([]string(nil), tc.base...)
			got := mergeEnvs(tc.base, tc.override)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("mergeEnvs(%v, %v) =\n  %v\nwant\n  %v", tc.base, tc.override, got, tc.want)
			}
			// mergeEnvs must not mutate the original base slice's backing array.
			if !reflect.DeepEqual(tc.base, origBase) {
				t.Fatalf("mergeEnvs mutated base: got %v, want %v", tc.base, origBase)
			}
		})
	}
}
