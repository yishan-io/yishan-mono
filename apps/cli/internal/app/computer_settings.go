package app

import (
	"fmt"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/platform/config"
)

// applyComputerSettings loads the computer-use feature config from
// settings.yaml. A missing/empty settings path leaves the defaults.
func (a *App) applyComputerSettings() error {
	if a.settingsPath == "" || a.computer == nil {
		return nil
	}
	cfg, err := config.LoadSettings(a.settingsPath, nil)
	if err != nil {
		return fmt.Errorf("load computer settings: %w", err)
	}
	a.computer.UpdateConfig(computer.FeatureConfig{
		Enabled:            cfg.ComputerUse.Enabled,
		Observe:            cfg.ComputerUse.Observe,
		Capture:            cfg.ComputerUse.Capture,
		Inspect:            cfg.ComputerUse.Inspect,
		Actions:            cfg.ComputerUse.Actions,
		Mouse:              cfg.ComputerUse.Mouse,
		Keyboard:           cfg.ComputerUse.Keyboard,
		ClipboardRead:      cfg.ComputerUse.ClipboardRead,
		ClipboardWrite:     cfg.ComputerUse.ClipboardWrite,
		ApplicationControl: cfg.ComputerUse.ApplicationControl,
	})
	return nil
}
