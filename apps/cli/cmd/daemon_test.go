package cmd

import (
	"path/filepath"
	"testing"
)

func TestStopDaemon_SucceedsWhenDaemonNotRunning(t *testing.T) {
	previousConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	defer func() {
		appConfig.ConfigPath = previousConfigPath
	}()

	if err := stopDaemon(nil, nil); err != nil {
		t.Fatalf("stopDaemon returned error for missing daemon: %v", err)
	}
}
