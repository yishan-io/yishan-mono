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

func TestBuildRunConfig_PropagatesDisabledDSHByDefault(t *testing.T) {
	previousConfig := appConfig
	defer func() { appConfig = previousConfig }()
	appConfig.Daemon.DSHEnabled = false

	runConfig := buildRunConfig("")
	if runConfig.DSHEnabled {
		t.Fatal("DSH is enabled by default")
	}
}
