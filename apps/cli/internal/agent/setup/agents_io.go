package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"yishan/apps/cli/internal/platform/config"
)

// Agent file I/O: path resolution, existence checks, and read/write of pi
// agent definition files in the managed pi agents dir. No frontmatter
// parsing and no official-agent policy live here.

// piAgentPath resolves <agentsDir>/<name>.md without requiring existence.
func piAgentPath(name string) string {
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return ""
	}
	return filepath.Join(agentsDir, name+".md")
}

// piAgentFilePath resolves <agentsDir>/<name>.md, erroring when the agent
// does not exist.
func piAgentFilePath(name string) (string, error) {
	path := piAgentPath(name)
	if path == "" {
		return "", fmt.Errorf("resolve pi agents dir: %w", ErrAgentNotFound)
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %q", ErrAgentNotFound, name)
		}
		return "", fmt.Errorf("stat pi agent %s: %w", name, err)
	}
	return path, nil
}

// writePiAgentFile writes <agentsDir>/<name>.md, creating the dir as needed.
func writePiAgentFile(name string, content string) error {
	agentsDir, err := configManagedPiAgentsDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		return fmt.Errorf("create pi agents dir: %w", err)
	}
	path := filepath.Join(agentsDir, name+".md")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write pi agent %s: %w", name, err)
	}
	return nil
}

func readPiAgentFile(name string) ([]byte, error) {
	path, err := piAgentFilePath(name)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read pi agent %s: %w", name, err)
	}
	return content, nil
}

// validateAgentPathName guards agent file paths: the name becomes a file
// basename in the agents dir, so it must not contain separators, parent
// references, the .md suffix, Windows drive characters, or control chars.
// (Create applies the stricter slug pattern on top.)
func validateAgentPathName(name string) error {
	if name == "" {
		return fmt.Errorf("%w: empty name", ErrInvalidAgentName)
	}
	if strings.ContainsAny(name, `/:\`) || strings.ContainsFunc(name, unicode.IsControl) || name == "." || name == ".." || strings.HasSuffix(name, ".md") {
		return fmt.Errorf("%w: %q", ErrInvalidAgentName, name)
	}
	return nil
}

// configManagedPiAgentsDir resolves the managed pi agents dir via config.
func configManagedPiAgentsDir() (string, error) {
	return config.ManagedPiAgentsDir()
}
