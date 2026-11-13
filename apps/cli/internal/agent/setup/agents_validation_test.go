package setup

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestUpdatePiAgentRejectsInvalidDefinitionPreservingBytes(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	dir := filepath.Join(home, ".yishan", "pi", "agent", "agents")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "helper.md")
	original := "---\nname: helper\ndescription: good\n---\nPrompt\n"
	cases := map[string]string{
		"missing name":                   "---\ndescription: good\n---\nPrompt\n",
		"empty description":              "---\nname: helper\ndescription: \" \"\n---\nPrompt\n",
		"invalid model":                  "---\nname: helper\ndescription: good\nmodel: 3\n---\nPrompt\n",
		"invalid thinking":               "---\nname: helper\ndescription: good\nthinking: extreme\n---\nPrompt\n",
		"invalid boolean":                "---\nname: helper\ndescription: good\nread_only: wrong\n---\nPrompt\n",
		"self-referential tools":         "---\nname: helper\ndescription: good\ntools: &a [*a]\n---\nPrompt\n",
		"nested aliased tools":           "---\nname: helper\ndescription: good\ntools: [&a [read], *a]\n---\nPrompt\n",
		"empty array tool":               "---\nname: helper\ndescription: good\ntools: [read, \"\"]\n---\nPrompt\n",
		"combined tool name":             "---\nname: helper\ndescription: good\ntools: [\"write,edit,bash\"]\n---\nPrompt\n",
		"merged description":             "---\nname: helper\ndefaults: &defaults {description: good}\n<<: *defaults\n---\nPrompt\n",
		"merged name":                    "---\ndescription: good\ndefaults: &defaults {name: helper}\n<<: *defaults\n---\nPrompt\n",
		"invalid timeout":                "---\nname: helper\ndescription: good\ntimeout_seconds: 0\n---\nPrompt\n",
		"missing description":            "---\nname: helper\n---\nPrompt\n",
		"malformed YAML":                 "---\nname: helper\ndescription: [broken\n---\nPrompt\n",
		"non-string description":         "---\nname: helper\ndescription: 42\n---\nPrompt\n",
		"empty prompt":                   "---\nname: helper\ndescription: good\n---\n  \n",
		"explicit timestamp description": "---\nname: helper\ndescription: !!timestamp 2026-01-01\n---\nPrompt\n",
		"underscore max turns":           "---\nname: helper\ndescription: good\nmax_turns: 1_000\n---\nPrompt\n",
		"invalid runtime field":          "---\nname: helper\ndescription: good\nmax_turns: -1\n---\nPrompt\n",
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			if err := os.WriteFile(path, []byte(original), 0644); err != nil {
				t.Fatal(err)
			}
			if err := UpdatePiAgent("helper", content); err == nil {
				t.Error("expected validation error")
			}
			got, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != original {
				t.Errorf("original overwritten: %q", got)
			}
		})
	}
}

func TestUpdatePiAgent_ExpectedContent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := CreatePiAgent("helper", "Description", "body", "", "", nil); err != nil {
		t.Fatal(err)
	}
	detail, err := GetPiAgentDetail("helper")
	if err != nil {
		t.Fatal(err)
	}
	updated := "---\nname: helper\ndescription: updated\n---\nbody\n"
	if err := UpdatePiAgent("helper", updated, &detail.Content); err != nil {
		t.Fatal(err)
	}
	if err := RemovePiAgent("helper"); err != nil {
		t.Fatal(err)
	}
	if err := UpdatePiAgent("helper", updated, &updated); !errors.Is(err, ErrStaleAgentDefinition) {
		t.Fatalf("expected stale error after deletion, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(home, ".yishan", "pi", "agent", "agents", "helper.md")); !os.IsNotExist(err) {
		t.Fatalf("deleted file recreated: %v", err)
	}
}

func TestCreatePiAgent_RejectsMissingMetadata(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := CreatePiAgent("helper", " ", "body", "", "", nil); !errors.Is(err, ErrInvalidAgentDefinition) {
		t.Fatalf("expected invalid definition, got %v", err)
	}
	if _, err := GetPiAgentDetail("helper"); !errors.Is(err, ErrAgentNotFound) {
		t.Fatalf("invalid file created: %v", err)
	}
}

func TestUpdatePiAgentAcceptsExtensionTool(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := CreatePiAgent("helper", "good", "body", "", "", nil); err != nil {
		t.Fatal(err)
	}
	content := `---
name: helper
description: good
tools: [extension-tool]
---
Prompt
`
	if err := UpdatePiAgent("helper", content); err != nil {
		t.Fatal(err)
	}
	detail, err := GetPiAgentDetail("helper")
	if err != nil {
		t.Fatal(err)
	}
	if detail.Content != content {
		t.Fatalf("content = %q", detail.Content)
	}
}

func TestUpdatePiAgentAcceptsCoreStringScalars(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := CreatePiAgent("helper", "good", "body", "", "", nil); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: helper\ndescription: 2026-01-01\nmodel: 1_000\n---\nPrompt\n"
	if err := UpdatePiAgent("helper", content); err != nil {
		t.Fatal(err)
	}
	detail, err := GetPiAgentDetail("helper")
	if err != nil {
		t.Fatal(err)
	}
	if detail.Content != content {
		t.Fatalf("content = %q", detail.Content)
	}
}

func TestValidateAgentDefinitionCoreScalarVariants(t *testing.T) {
	cases := []struct {
		name, fields string
		valid        bool
	}{
		{"underscored description", "description: 1_000", true},
		{"date model", "description: good\nmodel: 2026-01-01", true},
		{"decimal leading zero", "description: good\nmax_turns: 08", true},
		{"explicit string number", "description: good\nmax_turns: !!str 1000", false},
		{"explicit integer underscore", "description: good\nmax_turns: !!int 1_000", true},
		{"underscore timeout", "description: good\ntimeout_seconds: 1_000", false},
		{"extension metadata", "description: good\nextension: {date: 2026-01-01, value: 1_000}", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAgentDefinition("helper", "---\nname: helper\n"+tc.fields+"\n---\nPrompt\n")
			if (err == nil) != tc.valid {
				t.Fatalf("valid = %v, error = %v", tc.valid, err)
			}
		})
	}
}

func TestNormalizeAgentCoreValueDoesNotExpandNestedAliases(t *testing.T) {
	var document yaml.Node
	if err := yaml.Unmarshal([]byte("tools: [&a [2026-01-01], *a]"), &document); err != nil {
		t.Fatal(err)
	}
	tools := document.Content[0].Content[1]
	normalizeAgentCoreValue(tools)
	if tools.Content[1].Kind != yaml.AliasNode || tools.Content[0].Content[0].Tag != "!!timestamp" {
		t.Fatal("nested sequences or aliases were normalized")
	}
}

func TestUpdatePiAgentIgnoresTopLevelMerge(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := CreatePiAgent("helper", "good", "body", "", "", nil); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: helper\ndescription: good\ndefaults: &d {timeout_seconds: 0}\n<<: *d\n---\nPrompt\n"
	if err := UpdatePiAgent("helper", content); err != nil {
		t.Fatal(err)
	}
	detail, err := GetPiAgentDetail("helper")
	if err != nil {
		t.Fatal(err)
	}
	if detail.Content != content {
		t.Fatalf("content = %q", detail.Content)
	}
}
