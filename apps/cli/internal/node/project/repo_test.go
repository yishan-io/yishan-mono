package project

import "testing"

func TestInferRepoSource(t *testing.T) {
	cases := []struct {
		url      string
		provider string
		key      string
	}{
		{"https://github.com/Acme/Repo.git", "github", "acme/repo"},
		{"git@github.com:acme/repo.git", "github", "acme/repo"},
		{"ssh://git@gitlab.com/group/sub/repo", "gitlab", "sub/repo"},
		{"https://git.example.com/team/tool.git", "generic", "team/tool"},
		{"https://bitbucket.org/team/tool", "bitbucket", "team/tool"},
	}
	for _, tc := range cases {
		source, err := inferRepoSource(tc.url)
		if err != nil {
			t.Fatalf("%s: %v", tc.url, err)
		}
		if source.Provider != tc.provider || source.Key != tc.key {
			t.Fatalf("%s: got %#v", tc.url, source)
		}
	}
	for _, invalid := range []string{"", "not a url", "file:///tmp/repo", "https://github.com/only"} {
		if _, err := inferRepoSource(invalid); err == nil {
			t.Fatalf("expected %q to be rejected", invalid)
		}
	}
}

func TestValidateTaskPrefix(t *testing.T) {
	for _, valid := range []string{"ABC", "ABCDE"} {
		if err := validateTaskPrefix(valid); err != nil {
			t.Fatalf("%s: %v", valid, err)
		}
	}
	for _, invalid := range []string{"AB", "ABCDEF", "abc", "PERS", "AB1"} {
		if err := validateTaskPrefix(invalid); err == nil {
			t.Fatalf("expected %q to be rejected", invalid)
		}
	}
}
