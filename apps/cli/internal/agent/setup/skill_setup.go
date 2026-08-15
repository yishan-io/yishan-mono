package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/memory"
)

// EnsurePersonaSetup writes the initial PERSONA.md template to
// ~/.yishan/memory/PERSONA.md if the file does not already exist.
// This is called during `yishan setup` so new users get a starter file.
func EnsurePersonaSetup(disablePersona bool) error {
	if disablePersona {
		return nil
	}
	personaPath, err := memory.PersonaFilePath()
	if err != nil {
		return fmt.Errorf("resolve persona path: %w", err)
	}
	if _, err := os.Stat(personaPath); err == nil {
		return nil // already exists — don't overwrite user edits
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("check persona file: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(personaPath), 0o755); err != nil {
		return fmt.Errorf("create persona dir: %w", err)
	}
	content := memory.BuildEmptyPersonaMarkdown()
	if err := os.WriteFile(personaPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write persona template: %w", err)
	}
	return nil
}
