package setup

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSyncManagedPiAgentFile_PreservesUserModified(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "---\nname: general\ndescription: General\n---\n# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	// First sync writes the file and records the manifest hash.
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}
	// User modifies the file.
	userEdit := shipped + "# user edit\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write user edit: %v", err)
	}
	// Second sync must preserve the edit.
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_MissingManifestKeepsEdits(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	userEdit := "# user edit from pre-upgrade install\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved without manifest, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_CorruptManifestKeepsEdits(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	userEdit := "# user edit\n"
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}
	if err := os.WriteFile(filepath.Join(targetDir, ".managed.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatalf("write corrupt manifest: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != userEdit {
		t.Fatalf("expected user edit preserved with corrupt manifest, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_FreshInstallWritesAll(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != shipped {
		t.Fatalf("expected shipped content on fresh install, got %q", string(content))
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] == "" {
		t.Fatal("expected manifest hash recorded after fresh write")
	}
}

func TestSyncManagedPiAgentFile_PropagatesSourceUpdateToUntouchedFile(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	v1 := "# v1\n"
	v2 := "# v2\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v1), 0o644); err != nil {
		t.Fatalf("write source v1: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}
	// Shipped source advances; the target is untouched (hash matches manifest).
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v2), 0o644); err != nil {
		t.Fatalf("write source v2: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != v2 {
		t.Fatalf("expected official update propagated to untouched file, got %q", string(content))
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] != fileSHA256Bytes([]byte(v2)) {
		t.Fatal("expected manifest refreshed after official update")
	}
}

func TestSyncManagedPiAgentFile_NoManifestIdenticalFileHealsBaseline(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()
	shipped := "# shipped\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	// Pre-upgrade install: file on disk identical to source, no manifest yet.
	if err := os.WriteFile(filepath.Join(targetDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	manifest := loadManagedAgentManifest(targetDir)
	if manifest.Files["general.md"] != fileSHA256Bytes([]byte(shipped)) {
		t.Fatal("expected identical no-manifest file to heal its manifest baseline")
	}
	// And the healed baseline lets a later source update propagate.
	v2 := "# v2\n"
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(v2), 0o644); err != nil {
		t.Fatalf("write source v2: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, targetDir, "general.md"); err != nil {
		t.Fatalf("second sync: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(targetDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != v2 {
		t.Fatalf("expected healed baseline to propagate update, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFile_PreservesUpdatePiAgentOverwrite(t *testing.T) {
	homeDir := withPiHome(t)
	agentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	sourceDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-subagents", "agents")
	shipped := "---\nname: general\ndescription: General\nread_only: false\n---\n# shipped\n"
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "general.md"), []byte(shipped), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		t.Fatalf("create agents dir: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, agentsDir, "general.md"); err != nil {
		t.Fatalf("first sync: %v", err)
	}

	overwrite := "---\nname: general\ndescription: General\n---\n# my override via RPC\n"
	if err := UpdatePiAgent("general", overwrite); err != nil {
		t.Fatalf("UpdatePiAgent: %v", err)
	}
	if err := syncManagedPiAgentFile(sourceDir, agentsDir, "general.md"); err != nil {
		t.Fatalf("sync after overwrite: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(agentsDir, "general.md"))
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != overwrite {
		t.Fatalf("expected RPC overwrite preserved across sync, got %q", string(content))
	}
}

func TestSyncManagedPiAgentFilesUsesMutationLock(t *testing.T) {
	source, target := t.TempDir(), t.TempDir()
	agentMutationMu.Lock()
	done := make(chan error, 1)
	go func() { done <- syncManagedPiAgentFiles(source, target) }()
	select {
	case err := <-done:
		agentMutationMu.Unlock()
		t.Fatalf("sync completed while mutation lock held: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	agentMutationMu.Unlock()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("sync did not finish after unlock")
	}
}
