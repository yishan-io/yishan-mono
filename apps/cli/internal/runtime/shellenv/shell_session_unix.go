//go:build !windows

package shellenv

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

const execTimeout = 30 * time.Second

type LoginShell struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	mu      sync.Mutex
	buf     []byte
	bufCond *sync.Cond
	closed  bool
	path    string
}

func startLoginShell(shellPath string) (*LoginShell, error) {
	resolved := ResolveUserShell(shellPath)
	if strings.TrimSpace(resolved) == "" {
		return nil, fmt.Errorf("no shell found")
	}

	cmd := exec.Command(resolved, "-li")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stderr = nil

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start login shell: %w", err)
	}

	sh := &LoginShell{
		cmd:   cmd,
		stdin: stdin,
	}
	sh.bufCond = sync.NewCond(&sh.mu)

	go sh.readLoop(stdout)

	sh.exec("unset PROMPT 2>/dev/null; unset RPROMPT 2>/dev/null; PS1='' 2>/dev/null; true")

	pathOutput := sh.exec(`printf '%s' "$PATH"`)
	sh.path = strings.TrimSpace(pathOutput)

	return sh, nil
}

func (s *LoginShell) readLoop(stdout io.ReadCloser) {
	buf := make([]byte, 4096)
	for {
		n, err := stdout.Read(buf)
		if n > 0 {
			s.mu.Lock()
			if !s.closed {
				s.buf = append(s.buf, buf[:n]...)
				s.bufCond.Broadcast()
			}
			s.mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}

func (s *LoginShell) Path() string {
	return s.path
}

func (s *LoginShell) Exec(command string) (string, error) {
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()

	if closed {
		return "", fmt.Errorf("login shell is closed")
	}

	return s.exec(command), nil
}

func (s *LoginShell) exec(command string) string {
	marker := fmt.Sprintf("__SH_EXIT_%d__", time.Now().UnixNano())
	if _, err := fmt.Fprintf(s.stdin, "%s\necho %s $?\n", command, marker); err != nil {
		return ""
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	deadline := time.Now().Add(execTimeout)
	for {
		if time.Now().After(deadline) {
			return ""
		}

		bufStr := string(s.buf)
		idx := strings.Index(bufStr, marker)
		if idx < 0 {
			s.bufCond.Wait()
			continue
		}

		output := bufStr[:idx]
		rest := bufStr[idx+len(marker):]

		if nl := strings.IndexByte(rest, '\n'); nl >= 0 {
			s.buf = []byte(rest[nl+1:])
		} else {
			s.buf = s.buf[idx+len(marker):]
		}

		return s.trimTrailingNewline(output)
	}
}

func (s *LoginShell) trimTrailingNewline(output string) string {
	return strings.TrimRight(output, "\n\r")
}

func (s *LoginShell) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.bufCond.Broadcast()
	s.mu.Unlock()

	if err := s.stdin.Close(); err != nil {
		s.cmd.Process.Kill()
		return err
	}

	done := make(chan error, 1)
	go func() {
		done <- s.cmd.Wait()
	}()
	select {
	case err := <-done:
		return err
	case <-time.After(3 * time.Second):
		s.cmd.Process.Kill()
		return <-done
	}
}

var (
	globalShell     *LoginShell
	globalShellOnce sync.Once
	globalShellErr  error
)

func GetLoginShell() (*LoginShell, error) {
	globalShellOnce.Do(func() {
		globalShell, globalShellErr = startLoginShell(os.Getenv("SHELL"))
	})
	return globalShell, globalShellErr
}

func ShutdownLoginShell() {
	if globalShell != nil {
		globalShell.Close()
	}
}
