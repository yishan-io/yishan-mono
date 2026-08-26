package setup

import (
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/platform/config"
)

//go:embed assets/pi-agent/APPEND_SYSTEM.md
var managedPiAppendSystemContent string

//go:embed assets/pi-agent/keybindings.json
var managedPiKeybindingsContent string

var managedPiAgentFileNames = []string{"general.md", "explore.md", "builder.md", "code-reviewer.md", "plan-reviewer.md"}
var staleManagedPiAgentFileNames = []string{"Planner.md", "Reviewer.md"}
var managedPiRootFiles = []managedPiRootFile{
	{name: "APPEND_SYSTEM.md", content: managedPiAppendSystemContent, mode: 0o644},
	{name: "keybindings.json", content: managedPiKeybindingsContent, mode: 0o644},
}

type managedPiRootFile struct {
	name    string
	content string
	mode    os.FileMode
}

// managedAgentManifest records the sha256 of the last managed write per agent
// file (.managed.json next to the agent files), so sync can distinguish
// untouched official files from user-modified ones. User overwrites of
// official agents therefore survive `yishan setup`.
type managedAgentManifest struct {
	Files map[string]string `json:"files"`
}

// EnsureDefaultPiExtensionSetup installs default extensions and managed agent files
// with a background context for command-line setup.
func EnsureDefaultPiExtensionSetup() error {
	return EnsureDefaultPiExtensionSetupContext(context.Background())
}

// EnsureDefaultPiExtensionSetupContext installs default extensions and managed agent files with ctx.
func EnsureDefaultPiExtensionSetupContext(ctx context.Context) error {
	if err := EnsureDefaultPiExtensionsContext(ctx); err != nil {
		return err
	}
	return ensureManagedPiAgents()
}

// RemoveDefaultPiExtensionSetup removes default extensions and managed agent files
// with a background context for command-line setup.
func RemoveDefaultPiExtensionSetup() error {
	return RemoveDefaultPiExtensionSetupContext(context.Background())
}

// RemoveDefaultPiExtensionSetupContext removes default extensions and managed agent files with ctx.
func RemoveDefaultPiExtensionSetupContext(ctx context.Context) error {
	var removeErr error
	if err := RemoveDefaultPiExtensionsContext(ctx); err != nil {
		removeErr = err
	}
	if err := removeManagedPiSetupFiles(); err != nil {
		if removeErr != nil {
			removeErr = fmt.Errorf("%v; %w", removeErr, err)
		} else {
			removeErr = err
		}
	}
	return removeErr
}

func ensureManagedPiAgents() error {
	targetRootDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	if err := syncManagedPiRootFiles(targetRootDir); err != nil {
		return err
	}

	sourceDir, err := managedPiSubagentsAgentsDir()
	if err != nil {
		return err
	}
	targetDir, err := config.ManagedPiAgentsDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agents dir: %w", err)
	}
	return syncManagedPiAgentFiles(sourceDir, targetDir)
}

func syncManagedPiRootFiles(targetDir string) error {
	for _, file := range managedPiRootFiles {
		if err := writeTextFileIfChanged(filepath.Join(targetDir, file.name), file.content, file.mode); err != nil {
			return fmt.Errorf("write managed pi root file %s: %w", file.name, err)
		}
	}
	return nil
}

func removeManagedPiSetupFiles() error {
	targetRootDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	if err := removeManagedPiRootFiles(targetRootDir); err != nil {
		return err
	}
	targetDir, err := config.ManagedPiAgentsDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agents dir: %w", err)
	}
	if err := removeManagedPiAgentFiles(targetDir); err != nil {
		return err
	}
	if err := os.Remove(manifestPath(targetDir)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove managed pi agent manifest: %w", err)
	}
	return nil
}

func removeManagedPiRootFiles(targetDir string) error {
	for _, file := range managedPiRootFiles {
		if err := os.Remove(filepath.Join(targetDir, file.name)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove managed pi root file %s: %w", file.name, err)
		}
	}
	return nil
}

func syncManagedPiAgentFiles(sourceDir string, targetDir string) error {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return fmt.Errorf("create managed pi agents dir: %w", err)
	}
	for _, fileName := range managedPiAgentFileNames {
		if err := syncManagedPiAgentFile(sourceDir, targetDir, fileName); err != nil {
			return err
		}
	}
	return removeStaleManagedPiAgentFiles(targetDir)
}

// removeManagedPiAgentFiles removes the managed agent files, skipping any
// file whose content no longer matches the manifest hash — a user-modified
// official file is never deleted.
func removeManagedPiAgentFiles(targetDir string) error {
	manifest := loadManagedAgentManifest(targetDir)
	for _, fileName := range managedPiAgentFileNames {
		if !managedAgentRemoveAllowed(targetDir, fileName, manifest) {
			continue
		}
		if err := os.Remove(filepath.Join(targetDir, fileName)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove managed pi agent %s: %w", fileName, err)
		}
	}
	return removeStaleManagedPiAgentFiles(targetDir)
}

// managedAgentRemoveAllowed reports whether a managed agent file may be
// deleted: only when it is byte-identical to the last managed write recorded
// in the manifest. Without a manifest record there is no baseline, so the
// file is left alone (it may be user content).
func managedAgentRemoveAllowed(targetDir string, fileName string, manifest managedAgentManifest) bool {
	content, err := os.ReadFile(filepath.Join(targetDir, fileName))
	if err != nil {
		return false
	}
	lastManagedHash, ok := manifest.Files[fileName]
	if !ok {
		return false
	}
	return fileSHA256Bytes(content) == lastManagedHash
}

func removeStaleManagedPiAgentFiles(targetDir string) error {
	for _, fileName := range staleManagedPiAgentFileNames {
		if err := os.Remove(filepath.Join(targetDir, fileName)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove stale managed pi agent %s: %w", fileName, err)
		}
	}
	return nil
}

// syncManagedPiAgentFile writes the official content only when the target is
// absent, byte-identical to the source, or untouched since the last managed
// write (hash matches the manifest). User-modified files are preserved with a
// debug log, and every write refreshes the manifest hash.
func syncManagedPiAgentFile(sourceDir string, targetDir string, fileName string) error {
	sourcePath := filepath.Join(sourceDir, fileName)
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read managed pi agent source %s: %w", sourcePath, err)
	}
	targetPath := filepath.Join(targetDir, fileName)
	needsWrite, err := managedAgentNeedsWrite(targetDir, fileName, content)
	if err != nil {
		return err
	}
	if !needsWrite {
		return nil
	}
	if err := os.WriteFile(targetPath, content, 0o644); err != nil {
		return fmt.Errorf("write managed pi agent file %s: %w", targetPath, err)
	}
	manifest := loadManagedAgentManifest(targetDir)
	manifest.Files[fileName] = fileSHA256Bytes(content)
	if err := saveManagedAgentManifest(targetDir, manifest); err != nil {
		return fmt.Errorf("save managed pi agent manifest: %w", err)
	}
	return nil
}

// managedAgentNeedsWrite decides whether sync may write the target file.
func managedAgentNeedsWrite(targetDir string, fileName string, content []byte) (bool, error) {
	targetPath := filepath.Join(targetDir, fileName)
	targetContent, err := os.ReadFile(targetPath)
	if os.IsNotExist(err) {
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("read managed pi agent target %s: %w", targetPath, err)
	}
	if bytes.Equal(targetContent, content) {
		// Target provably equals the current source: record the managed hash
		// so no-manifest installs (pre-upgrade, no .managed.json) establish a
		// baseline instead of freezing all future official updates.
		manifest := loadManagedAgentManifest(targetDir)
		if _, recorded := manifest.Files[fileName]; !recorded {
			manifest.Files[fileName] = fileSHA256Bytes(content)
			if err := saveManagedAgentManifest(targetDir, manifest); err != nil {
				return false, fmt.Errorf("save managed pi agent manifest: %w", err)
			}
		}
		return false, nil
	}
	manifest := loadManagedAgentManifest(targetDir)
	lastManagedHash, ok := manifest.Files[fileName]
	if !ok {
		log.Debug().Str("agent", fileName).Msg("skipping managed pi agent sync: no manifest record and file differs from source")
		return false, nil
	}
	if fileSHA256Bytes(targetContent) != lastManagedHash {
		log.Debug().Str("agent", fileName).Msg("skipping managed pi agent sync: file was user-modified")
		return false, nil
	}
	return true, nil
}

func managedPiSubagentsAgentsDir() (string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return "", fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	return filepath.Join(piAgentDir, "npm", "node_modules", "@yishan-io", "pi-subagents", "agents"), nil
}

func manifestPath(targetDir string) string {
	return filepath.Join(targetDir, ".managed.json")
}

// loadManagedAgentManifest reads <targetDir>/.managed.json. A missing file is
// a normal first-sync state (empty manifest); an unreadable or corrupt file
// is treated the same with a warning — sync then only writes absent or
// byte-identical files and never clobbers a differing file.
func loadManagedAgentManifest(targetDir string) managedAgentManifest {
	content, err := os.ReadFile(manifestPath(targetDir))
	if err != nil {
		return managedAgentManifest{Files: map[string]string{}}
	}
	var manifest managedAgentManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		log.Warn().Err(err).Str("path", manifestPath(targetDir)).Msg("managed pi agent manifest unreadable; treating as empty")
		return managedAgentManifest{Files: map[string]string{}}
	}
	if manifest.Files == nil {
		manifest.Files = map[string]string{}
	}
	return manifest
}

func saveManagedAgentManifest(targetDir string, manifest managedAgentManifest) error {
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(manifestPath(targetDir), content, 0o644)
}

func fileSHA256(path string) string {
	content, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return fileSHA256Bytes(content)
}

func fileSHA256Bytes(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
