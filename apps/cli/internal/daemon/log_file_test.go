package daemon

import (
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/platform/logging"
)

func TestResolveLogFilePath_UsesSystemLog(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")

	got, err := ResolveLogFilePath(credentialPath)
	if err != nil {
		t.Fatalf("ResolveLogFilePath: %v", err)
	}
	want := filepath.Join(filepath.Dir(credentialPath), LogDirName, SystemLogFileName)
	if got != want {
		t.Fatalf("system log path = %q, want %q", got, want)
	}
}

func TestResolveRuntimeLogFilePath_UsesAccountPathAfterUserIDResolves(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(credentialPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "user_123")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	profileLogPath, err := ResolveLogFilePath(credentialPath)
	if err != nil {
		t.Fatalf("ResolveLogFilePath: %v", err)
	}

	got, err := resolveRuntimeLogFilePath(RunConfig{LogFilePath: profileLogPath}, credentialPath)
	if err != nil {
		t.Fatalf("resolveRuntimeLogFilePath: %v", err)
	}
	want := filepath.Join(filepath.Dir(credentialPath), config.AccountDirName, "user_123", LogDirName, RuntimeLogFileName)
	if got != want {
		t.Fatalf("runtime log path = %q, want %q", got, want)
	}
}

func TestResolveRuntimeLogFilePath_PreservesCustomPath(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(credentialPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "user_123")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	customPath := filepath.Join(t.TempDir(), "custom.log")

	got, err := resolveRuntimeLogFilePath(RunConfig{
		LogFilePath:      customPath,
		HasCustomLogFile: true,
	}, credentialPath)
	if err != nil {
		t.Fatalf("resolveRuntimeLogFilePath: %v", err)
	}
	if got != customPath {
		t.Fatalf("runtime log path = %q, want custom path %q", got, customPath)
	}
}

func TestResolveRuntimeLogFilePath_KeepsProfilePathWithoutUserID(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")
	profileLogPath, err := ResolveLogFilePath(credentialPath)
	if err != nil {
		t.Fatalf("ResolveLogFilePath: %v", err)
	}

	got, err := resolveRuntimeLogFilePath(RunConfig{LogFilePath: profileLogPath}, credentialPath)
	if err != nil {
		t.Fatalf("resolveRuntimeLogFilePath: %v", err)
	}
	if got != profileLogPath {
		t.Fatalf("runtime log path = %q, want profile path %q", got, profileLogPath)
	}
}

func TestResolveRuntimeLogFilePath_KeepsProfilePathForUnsafeUserID(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(credentialPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "../../another-profile")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	profileLogPath, err := ResolveLogFilePath(credentialPath)
	if err != nil {
		t.Fatalf("ResolveLogFilePath: %v", err)
	}

	got, err := resolveRuntimeLogFilePath(RunConfig{LogFilePath: profileLogPath}, credentialPath)
	if err != nil {
		t.Fatalf("resolveRuntimeLogFilePath: %v", err)
	}
	if got != profileLogPath {
		t.Fatalf("runtime log path = %q, want profile path %q", got, profileLogPath)
	}
}

func TestSwitchRuntimeLogFile_ChangesWriterAfterAccountResolution(t *testing.T) {
	credentialPath := filepath.Join(t.TempDir(), "credential.yaml")
	if err := config.UpdateFile(credentialPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, "user_123")
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	profileLogPath, err := ResolveLogFilePath(credentialPath)
	if err != nil {
		t.Fatalf("ResolveLogFilePath: %v", err)
	}
	writer, err := logging.NewFileWriter(logging.FileWriterConfig{Path: profileLogPath})
	if err != nil {
		t.Fatalf("NewFileWriter: %v", err)
	}
	t.Cleanup(func() { _ = writer.Close() })

	cfg := RunConfig{LogFilePath: profileLogPath, LogFileWriter: writer}
	if err := switchRuntimeLogFile(&cfg, credentialPath); err != nil {
		t.Fatalf("switchRuntimeLogFile: %v", err)
	}

	want := filepath.Join(filepath.Dir(credentialPath), config.AccountDirName, "user_123", LogDirName, RuntimeLogFileName)
	if cfg.LogFilePath != want {
		t.Fatalf("config log path = %q, want %q", cfg.LogFilePath, want)
	}
	if writer.Path() != want {
		t.Fatalf("writer path = %q, want %q", writer.Path(), want)
	}
}
