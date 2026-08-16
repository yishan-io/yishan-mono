package system

import "yishan/apps/cli/internal/computer"

// NewDefaultComputerService builds the computer-use service with the platform
// runtime: the darwin cgo runtime on macOS, the unavailable runtime elsewhere.
func NewDefaultComputerService() *computer.Service {
	return computer.NewService(newComputerRuntime())
}
