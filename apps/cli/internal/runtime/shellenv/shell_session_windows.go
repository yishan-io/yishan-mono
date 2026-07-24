//go:build windows

package shellenv

import (
	"fmt"
	"sync"
)

type LoginShell struct {
	path string
}

func startLoginShell(shellPath string) (*LoginShell, error) {
	return nil, fmt.Errorf("login shell not supported on windows")
}

func (s *LoginShell) Path() string  { return s.path }
func (s *LoginShell) FullEnv() []string { return nil }
func (s *LoginShell) Exec(cmd string) (string, error) {
	return "", fmt.Errorf("login shell not supported on windows")
}
func (s *LoginShell) Close() error { return nil }

var (
	globalShell     *LoginShell
	globalShellOnce sync.Once
	globalShellErr  error
)

func GetLoginShell() (*LoginShell, error) {
	globalShellOnce.Do(func() {
		globalShell, globalShellErr = startLoginShell("")
	})
	return globalShell, globalShellErr
}

func ShutdownLoginShell() {}
