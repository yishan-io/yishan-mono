package system

import (
	"context"
	"errors"
	"strings"
	"testing"

	clidetector "yishan/apps/cli/internal/agent/catalog/detect"
	clitoolinstall "yishan/apps/cli/internal/agent/catalog/install"
)

func TestInstallCLIToolRejectsUnknownTool(t *testing.T) {
	t.Parallel()

	_, err := installCLITool(context.Background(), "unknown-tool")
	if err == nil || !strings.Contains(err.Error(), "unknown CLI tool") {
		t.Fatalf("expected unknown CLI tool error, got %v", err)
	}
}

func TestUninstallCLIToolRejectsUnknownTool(t *testing.T) {
	t.Parallel()

	_, err := uninstallCLITool(context.Background(), "unknown-tool")
	if err == nil || !strings.Contains(err.Error(), "unknown CLI tool") {
		t.Fatalf("expected unknown CLI tool error, got %v", err)
	}
}

func TestUninstallCLIToolRejectsUnsupportedUninstall(t *testing.T) {
	t.Parallel()

	// pi has no uninstall path; this must not touch the filesystem.
	_, err := uninstallCLITool(context.Background(), "pi")
	if err == nil || !strings.Contains(err.Error(), "uninstall is not supported") {
		t.Fatalf("expected unsupported uninstall error, got %v", err)
	}
}

type stubCLIToolInstaller struct {
	toolID      string
	installFunc func(context.Context) error
}

func (s stubCLIToolInstaller) ToolID() string { return s.toolID }
func (s stubCLIToolInstaller) Install(ctx context.Context) error {
	return s.installFunc(ctx)
}
func (s stubCLIToolInstaller) Uninstall(context.Context) error { return nil }
func (s stubCLIToolInstaller) SupportsUninstall() bool         { return true }

func TestInstallCLITool_PiSuccessRunsManagedSetupWithExactContext(t *testing.T) {
	ctx := context.WithValue(context.Background(), struct{ name string }{"test"}, "value")
	installCalls := 0
	setupCalls := 0
	statusCalls := 0
	withCLIToolInstallSeams(t,
		clitoolinstall.NewRegistry(stubCLIToolInstaller{toolID: clitoolinstall.PiToolID, installFunc: func(got context.Context) error {
			installCalls++
			if got != ctx {
				t.Fatal("installer did not receive exact context")
			}
			return nil
		}}),
		func(got context.Context) error {
			setupCalls++
			if got != ctx {
				t.Fatal("managed setup did not receive exact context")
			}
			return nil
		},
		func(toolID string) (clidetector.Status, error) {
			statusCalls++
			return clidetector.Status{ToolID: toolID}, nil
		},
	)

	if _, err := installCLITool(ctx, clitoolinstall.PiToolID); err != nil {
		t.Fatalf("installCLITool: %v", err)
	}
	if installCalls != 1 || setupCalls != 1 || statusCalls != 1 {
		t.Fatalf("calls = installer:%d setup:%d status:%d, want 1 each", installCalls, setupCalls, statusCalls)
	}
}

func TestInstallCLITool_NonPiSkipsManagedSetup(t *testing.T) {
	setupCalls := 0
	withCLIToolInstallSeams(t,
		clitoolinstall.NewRegistry(stubCLIToolInstaller{toolID: "other", installFunc: func(context.Context) error { return nil }}),
		func(context.Context) error { setupCalls++; return nil },
		func(toolID string) (clidetector.Status, error) { return clidetector.Status{ToolID: toolID}, nil },
	)

	if _, err := installCLITool(context.Background(), "other"); err != nil {
		t.Fatalf("installCLITool: %v", err)
	}
	if setupCalls != 0 {
		t.Fatalf("managed setup called %d times, want 0", setupCalls)
	}
}

func TestInstallCLITool_InstallerFailureSkipsSetupAndReturnsOriginalError(t *testing.T) {
	installErr := errors.New("install failed")
	setupCalls := 0
	statusCalls := 0
	withCLIToolInstallSeams(t,
		clitoolinstall.NewRegistry(stubCLIToolInstaller{toolID: clitoolinstall.PiToolID, installFunc: func(context.Context) error { return installErr }}),
		func(context.Context) error { setupCalls++; return nil },
		func(string) (clidetector.Status, error) { statusCalls++; return clidetector.Status{}, nil },
	)

	_, err := installCLITool(context.Background(), clitoolinstall.PiToolID)
	if err != installErr {
		t.Fatalf("error = %v, want original %v", err, installErr)
	}
	if setupCalls != 0 || statusCalls != 0 {
		t.Fatalf("calls = setup:%d status:%d, want 0", setupCalls, statusCalls)
	}
}

func TestInstallCLITool_CanceledContextReachesManagedSetup(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	withCLIToolInstallSeams(t,
		clitoolinstall.NewRegistry(stubCLIToolInstaller{toolID: clitoolinstall.PiToolID, installFunc: func(context.Context) error { return nil }}),
		func(got context.Context) error {
			if got != ctx || !errors.Is(got.Err(), context.Canceled) {
				t.Fatalf("setup context = %v, want canceled original context", got.Err())
			}
			return nil
		},
		func(toolID string) (clidetector.Status, error) { return clidetector.Status{ToolID: toolID}, nil },
	)

	if _, err := installCLITool(ctx, clitoolinstall.PiToolID); err != nil {
		t.Fatalf("installCLITool: %v", err)
	}
}

func TestInstallCLITool_ManagedSetupFailurePropagatesAndSkipsStatus(t *testing.T) {
	setupErr := errors.New("setup failed")
	statusCalls := 0
	withCLIToolInstallSeams(t,
		clitoolinstall.NewRegistry(stubCLIToolInstaller{toolID: clitoolinstall.PiToolID, installFunc: func(context.Context) error { return nil }}),
		func(context.Context) error { return setupErr },
		func(string) (clidetector.Status, error) { statusCalls++; return clidetector.Status{}, nil },
	)

	_, err := installCLITool(context.Background(), clitoolinstall.PiToolID)
	if !errors.Is(err, setupErr) || !strings.Contains(err.Error(), "set up default Pi extensions") {
		t.Fatalf("error = %v, want contextual setup error", err)
	}
	if statusCalls != 0 {
		t.Fatalf("status lookup called %d times, want 0", statusCalls)
	}
}

func withCLIToolInstallSeams(t *testing.T, registry *clitoolinstall.Registry, managedSetup func(context.Context) error, statusLookup func(string) (clidetector.Status, error)) {
	t.Helper()
	originalRegistry := cliToolInstallerRegistry
	originalManagedSetup := ensureDefaultPiExtensionSetup
	originalStatusLookup := findCLIToolStatusAfterInstall
	cliToolInstallerRegistry = registry
	ensureDefaultPiExtensionSetup = managedSetup
	findCLIToolStatusAfterInstall = statusLookup
	t.Cleanup(func() {
		cliToolInstallerRegistry = originalRegistry
		ensureDefaultPiExtensionSetup = originalManagedSetup
		findCLIToolStatusAfterInstall = originalStatusLookup
	})
}
