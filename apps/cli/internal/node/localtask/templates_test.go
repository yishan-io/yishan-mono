package localtask

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
)

func TestTemplateStore_LoadDefaultsForMissingAndCorruptFiles(t *testing.T) {
	for _, test := range []struct {
		name     string
		contents string
	}{
		{name: "missing"},
		{name: "corrupt", contents: "not json"},
	} {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			if test.contents != "" {
				if err := os.WriteFile(filepath.Join(directory, templatesFileName), []byte(test.contents), 0o600); err != nil {
					t.Fatalf("write corrupt file: %v", err)
				}
			}
			templates, err := NewTemplateStore(directory).Load()
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			assertDefaultTemplates(t, templates)
		})
	}
}

func TestTemplateStore_LoadFallsBackToBuiltInAgentDefault(t *testing.T) {
	directory := t.TempDir()
	store := NewTemplateStore(directory)
	custom := domain.Template{ID: "custom", Name: "Custom", Content: "Content"}
	if err := store.Save(domain.TemplatesData{Templates: []domain.Template{custom}, AgentDefaultID: custom.ID}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	path := filepath.Join(directory, templatesFileName)
	if err := os.WriteFile(path, []byte(`{"templates":[{"id":"custom","name":"Custom","content":"Content"}],"agentDefaultId":"missing"}`), 0o600); err != nil {
		t.Fatalf("write templates: %v", err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.AgentDefaultID != builtInTemplateID || len(loaded.Templates) != 2 {
		t.Fatalf("loaded templates = %#v", loaded)
	}
}

func TestTemplateStore_SaveAndLoadCRUD(t *testing.T) {
	store := NewTemplateStore(t.TempDir())
	custom := domain.Template{ID: "custom", Name: "Custom", Content: "Describe work"}
	if err := store.Save(domain.TemplatesData{Templates: []domain.Template{custom}, AgentDefaultID: "custom"}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(loaded.Templates) != 2 || loaded.Templates[1] != custom || loaded.AgentDefaultID != custom.ID {
		t.Fatalf("loaded templates = %#v", loaded)
	}
	if err := store.Save(domain.TemplatesData{Templates: []domain.Template{builtInTemplate, custom}, AgentDefaultID: "default"}); err != nil {
		t.Fatalf("Save with built-in: %v", err)
	}
}

func TestTemplateStore_SaveProtectsBuiltInTemplate(t *testing.T) {
	store := NewTemplateStore(t.TempDir())
	custom := domain.Template{ID: "custom", Name: "Custom", Content: "Content"}
	replaced := domain.Template{ID: "default", Name: "Changed", Content: "Changed"}
	if err := store.Save(domain.TemplatesData{Templates: []domain.Template{replaced, custom}, AgentDefaultID: "default"}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Templates[0] != builtInTemplate || len(loaded.Templates) != 2 {
		t.Fatalf("loaded templates = %#v", loaded.Templates)
	}
}

func TestTemplateStore_RejectsInvalidData(t *testing.T) {
	valid := domain.Template{ID: "custom", Name: "Custom", Content: "Content"}
	for _, test := range []struct {
		name string
		data domain.TemplatesData
	}{
		{name: "no custom templates", data: domain.TemplatesData{AgentDefaultID: "default"}},
		{name: "duplicate IDs", data: domain.TemplatesData{Templates: []domain.Template{valid, valid}, AgentDefaultID: "custom"}},
		{name: "missing ID", data: domain.TemplatesData{Templates: []domain.Template{{Name: "Name", Content: "Content"}}, AgentDefaultID: "default"}},
		{name: "long name", data: domain.TemplatesData{Templates: []domain.Template{{ID: "custom", Name: strings.Repeat("x", maxTemplateNameLength+1), Content: "Content"}}, AgentDefaultID: "custom"}},
		{name: "long content", data: domain.TemplatesData{Templates: []domain.Template{{ID: "custom", Name: "Name", Content: strings.Repeat("x", maxTemplateContentLength+1)}}, AgentDefaultID: "custom"}},
		{name: "invalid agent default", data: domain.TemplatesData{Templates: []domain.Template{valid}, AgentDefaultID: "missing"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := NewTemplateStore(t.TempDir()).Save(test.data)
			if !errors.Is(err, ErrInvalidTemplates) {
				t.Fatalf("Save error = %v, want invalid templates", err)
			}
		})
	}
}

func TestTemplateStore_SaveIsAtomic(t *testing.T) {
	directory := t.TempDir()
	store := NewTemplateStore(directory)
	first := domain.TemplatesData{Templates: []domain.Template{{ID: "one", Name: "One", Content: "First"}}, AgentDefaultID: "one"}
	if err := store.Save(first); err != nil {
		t.Fatalf("initial Save: %v", err)
	}
	before, err := os.ReadFile(filepath.Join(directory, templatesFileName))
	if err != nil {
		t.Fatalf("read initial file: %v", err)
	}
	if err := store.Save(domain.TemplatesData{AgentDefaultID: "default"}); !errors.Is(err, ErrInvalidTemplates) {
		t.Fatalf("invalid Save error = %v, want invalid templates", err)
	}
	after, err := os.ReadFile(filepath.Join(directory, templatesFileName))
	if err != nil {
		t.Fatalf("read final file: %v", err)
	}
	if string(after) != string(before) {
		t.Fatal("invalid Save changed the persisted file")
	}
}

func assertDefaultTemplates(t *testing.T, templates domain.TemplatesData) {
	t.Helper()
	if templates.Version != templatesVersion || templates.AgentDefaultID != builtInTemplateID || len(templates.Templates) != 1 || templates.Templates[0] != builtInTemplate {
		t.Fatalf("templates = %#v, want built-in defaults", templates)
	}
}
