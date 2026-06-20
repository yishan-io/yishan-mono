//go:build darwin

package darwin

import "yishan/apps/cli/internal/computer"

func nativeFailure(message string, details map[string]any) error {
	return computer.NewErrorWithDetails(computer.ErrorCodeNativeAPIFailed, message, details, false)
}
