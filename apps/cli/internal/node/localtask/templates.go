package localtask

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"unicode/utf8"

	domain "yishan/apps/cli/internal/localtask"
)

const (
	maxTemplates             = 20
	maxTemplateNameLength    = 100
	maxTemplateContentLength = 10_000
	builtInTemplateID        = "default"
	templatesFileName        = "task-templates.json"
	templatesVersion         = 1
)

var ErrInvalidTemplates = errors.New("invalid task templates")

var builtInTemplate = domain.Template{
	ID:      builtInTemplateID,
	Name:    "Standard task",
	Content: "## Goal\n\n## Context\n\n## Acceptance Criteria\n\n- \n\n## Notes\n",
}

// TemplateStore reads and atomically writes task-templates.json inside DataDir.
type TemplateStore struct{ dataDir string }

// NewTemplateStore creates a profile/account-scoped task template store.
func NewTemplateStore(dataDir string) *TemplateStore {
	return &TemplateStore{dataDir: dataDir}
}

// Load returns current data, replacing missing or corrupt data with defaults.
func (s *TemplateStore) Load() (domain.TemplatesData, error) {
	contents, err := os.ReadFile(s.path())
	if err == nil {
		if templates, isValid := parseLoadedTemplates(contents); isValid {
			return templates, nil
		}
	} else if !os.IsNotExist(err) {
		return domain.TemplatesData{}, fmt.Errorf("read task templates: %w", err)
	}
	defaults := defaultTemplatesData()
	if err := s.write(defaults); err != nil {
		return domain.TemplatesData{}, err
	}
	return defaults, nil
}

func parseLoadedTemplates(contents []byte) (domain.TemplatesData, bool) {
	var templates domain.TemplatesData
	if err := json.Unmarshal(contents, &templates); err != nil {
		return domain.TemplatesData{}, false
	}
	templates = normalizeTemplates(templates)
	if templates.AgentDefaultID == "" || !hasTemplate(templates.Templates, templates.AgentDefaultID) {
		templates.AgentDefaultID = builtInTemplateID
	}
	return templates, validateTemplates(templates) == nil
}

// Save validates then atomically writes the data.
func (s *TemplateStore) Save(templates domain.TemplatesData) error {
	templates = normalizeTemplates(templates)
	if err := validateTemplates(templates); err != nil {
		return err
	}
	return s.write(templates)
}

func (s *TemplateStore) path() string {
	return filepath.Join(s.dataDir, templatesFileName)
}

func (s *TemplateStore) write(templates domain.TemplatesData) error {
	contents, err := json.Marshal(templates)
	if err != nil {
		return fmt.Errorf("marshal task templates: %w", err)
	}
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return fmt.Errorf("create task templates directory: %w", err)
	}
	temporary, err := os.CreateTemp(s.dataDir, templatesFileName+"-*")
	if err != nil {
		return fmt.Errorf("create task templates temporary file: %w", err)
	}
	return writeAndReplace(temporary, s.path(), contents)
}

func writeAndReplace(temporary *os.File, destination string, contents []byte) error {
	temporaryPath := temporary.Name()
	if _, err := temporary.Write(contents); err != nil {
		_ = temporary.Close() // best-effort cleanup before removal
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("write task templates temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("close task templates temporary file: %w", err)
	}
	if err := os.Rename(temporaryPath, destination); err != nil {
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("replace task templates file: %w", err)
	}
	return nil
}

func defaultTemplateList() []domain.Template {
	return []domain.Template{builtInTemplate}
}

func defaultTemplatesData() domain.TemplatesData {
	return domain.TemplatesData{Version: templatesVersion, Templates: defaultTemplateList(), AgentDefaultID: builtInTemplateID}
}

func normalizeTemplates(templates domain.TemplatesData) domain.TemplatesData {
	customTemplates := make([]domain.Template, 0, len(templates.Templates)+1)
	customTemplates = append(customTemplates, builtInTemplate)
	for _, template := range templates.Templates {
		if template.ID != builtInTemplateID {
			customTemplates = append(customTemplates, template)
		}
	}
	templates.Version = templatesVersion
	templates.Templates = customTemplates
	return templates
}

func validateTemplates(templates domain.TemplatesData) error {
	if len(templates.Templates) == 0 || templates.Templates[0] != builtInTemplate {
		return ErrInvalidTemplates
	}
	customCount := len(templates.Templates) - 1
	if customCount > maxTemplates {
		return ErrInvalidTemplates
	}
	seenIDs := make(map[string]struct{}, customCount)
	for _, template := range templates.Templates[1:] {
		if !isValidCustomTemplate(template, seenIDs) {
			return ErrInvalidTemplates
		}
	}
	if !hasTemplate(templates.Templates, templates.AgentDefaultID) {
		return ErrInvalidTemplates
	}
	return nil
}

func isValidCustomTemplate(template domain.Template, seenIDs map[string]struct{}) bool {
	if template.ID == "" || template.ID == builtInTemplateID || template.Name == "" || template.Content == "" {
		return false
	}
	if utf8.RuneCountInString(template.Name) > maxTemplateNameLength || utf8.RuneCountInString(template.Content) > maxTemplateContentLength {
		return false
	}
	if _, exists := seenIDs[template.ID]; exists {
		return false
	}
	seenIDs[template.ID] = struct{}{}
	return true
}

func hasTemplate(templates []domain.Template, id string) bool {
	for _, template := range templates {
		if template.ID == id {
			return true
		}
	}
	return false
}
