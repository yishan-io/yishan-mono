package setup

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func resetExtensionUpdateCache() {
	extensionUpdateCache.Lock()
	extensionUpdateCache.entries = map[string]extensionUpdateCacheEntry{}
	extensionUpdateCache.Unlock()
}

func skipHermeticBinaryResolutionOnWindows(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("hermetic fake-binary resolution is unix-only")
	}
}

// stubManagedPiEnvWithFakeBinary swaps managedPiEnvBase for a controlled PATH
// containing a fake <binary> executable, so commands resolve binaries
// hermetically without spawning a login shell. It returns the resolved fake
// binary path.
func stubManagedPiEnvWithFakeBinary(t *testing.T, binary string) string {
	t.Helper()
	binDir := t.TempDir()
	fakePath := filepath.Join(binDir, binary)
	if err := os.WriteFile(fakePath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake %s binary: %v", binary, err)
	}
	original := managedPiEnvBase
	managedPiEnvBase = func() []string { return []string{"PATH=" + binDir} }
	t.Cleanup(func() { managedPiEnvBase = original })
	return fakePath
}

func writePkgJSON(t *testing.T, dir string, version string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"test","version":"`+version+`"}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
}

func extensionsByName(extensions []PiExtensionInfo) map[string]PiExtensionInfo {
	byName := make(map[string]PiExtensionInfo, len(extensions))
	for _, ext := range extensions {
		byName[ext.Name] = ext
	}
	return byName
}

func extensionNames(extensions []PiExtensionInfo) []string {
	names := make([]string, 0, len(extensions))
	for _, ext := range extensions {
		names = append(names, ext.Name)
	}
	return names
}
