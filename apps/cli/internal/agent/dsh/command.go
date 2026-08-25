package dsh

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	electronRunAsNodeEnvKey = "ELECTRON_RUN_AS_NODE"
	dshDataDirEnvKey        = "YISHAN_DSH_DATA_DIR"
)

// NewCommandFactory builds commands for the explicitly bundled Node runtime.
// It never resolves Node from PATH, so an absent configured path fails closed.
func NewCommandFactory(nodePath string, runtimePath string, dataDir string) CommandFactory {
	return func(ctx context.Context) (*exec.Cmd, error) {
		if err := validateCommandPaths(nodePath, runtimePath, dataDir); err != nil {
			return nil, err
		}
		command := exec.CommandContext(ctx, nodePath, runtimePath)
		command.Env = append(os.Environ(), electronRunAsNodeEnvKey+"=1", dshDataDirEnvKey+"="+dataDir)
		return command, nil
	}
}

func validateCommandPaths(nodePath string, runtimePath string, dataDir string) error {
	if !isAbsolutePath(nodePath) {
		return fmt.Errorf("DSH node executable path must be absolute")
	}
	if !isAbsolutePath(runtimePath) {
		return fmt.Errorf("DSH runtime path must be absolute")
	}
	if !isAbsolutePath(dataDir) {
		return fmt.Errorf("DSH data directory must be absolute")
	}
	return nil
}

func isAbsolutePath(path string) bool {
	return strings.TrimSpace(path) != "" && filepath.IsAbs(path)
}
