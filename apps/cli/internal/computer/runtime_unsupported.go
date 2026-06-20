//go:build !darwin

package computer

import goruntime "runtime"

func NewCurrentPlatformRuntime() Runtime {
	return NewUnavailableRuntime(goruntime.GOOS)
}
