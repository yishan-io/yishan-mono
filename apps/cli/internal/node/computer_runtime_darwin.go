//go:build darwin

package node

import (
	"yishan/apps/cli/internal/computer"
	computerdarwin "yishan/apps/cli/internal/computer/darwin"
)

func newComputerRuntime() computer.Runtime {
	return computerdarwin.New()
}
