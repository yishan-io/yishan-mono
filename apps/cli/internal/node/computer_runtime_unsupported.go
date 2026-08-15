//go:build !darwin

package node

import (
	stdruntime "runtime"

	"yishan/apps/cli/internal/computer"
)

func newComputerRuntime() computer.Runtime {
	return computer.NewUnavailableRuntime(stdruntime.GOOS)
}
