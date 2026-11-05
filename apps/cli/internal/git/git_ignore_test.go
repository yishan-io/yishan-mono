package git

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

type commandContextFunc func(context.Context, ...string) (*exec.Cmd, bool)

func (f commandContextFunc) CommandContext(ctx context.Context, args ...string) (*exec.Cmd, bool) {
	return f(ctx, args...)
}

func TestCheckIgnoredPaths_RealGit(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	writeIgnoreFixture(t, root)
	runGit(t, root, "add", "-f", "tracked/child")
	svc := NewGitService()
	paths := []string{" spaced ", "line\nbreak", "-dash", "ignored/child", "tracked/child", "plain", " spaced ", ""}
	got, err := svc.CheckIgnoredPaths(context.Background(), root, paths)
	want := map[string]bool{" spaced ": true, "line\nbreak": true, "-dash": true, "ignored/child": true, "tracked/child": false, "plain": false}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, %v; want %v", got, err, want)
	}
	got, err = svc.CheckIgnoredPaths(context.Background(), root, []string{"plain", "tracked/child"})
	if err != nil || len(got) != 2 || got["plain"] || got["tracked/child"] {
		t.Fatalf("nonmatches: %v, %v", got, err)
	}
	if err := svc.WorktreeReady(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	assertGitToolError(t, svc.WorktreeReady(context.Background(), t.TempDir()))
	runGit(t, root, "commit", "--allow-empty", "-m", "seed")
	branch, err := svc.HeadName(context.Background(), root)
	if err != nil || branch == "" || branch == "HEAD" {
		t.Fatalf("branch: %q, %v", branch, err)
	}
	runGit(t, root, "checkout", "--detach")
	head, err := svc.HeadName(context.Background(), root)
	if err != nil || head != "HEAD" {
		t.Fatalf("detached: %q, %v", head, err)
	}
	_, err = svc.CurrentBranch(context.Background(), root)
	assertGitToolError(t, err)
}

func writeIgnoreFixture(t *testing.T, root string) {
	t.Helper()
	for _, dir := range []string{"tracked", "ignored"} {
		if err := os.Mkdir(filepath.Join(root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{" spaced ", "line\nbreak", "-dash", "tracked/child", "ignored/child", "plain"} {
		if err := os.WriteFile(filepath.Join(root, path), nil, 0644); err != nil {
			t.Fatal(err)
		}
	}
	// Git ignore patterns escape the trailing space; '*' also matches newlines.
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(" spaced\\ \nline*break\n-dash\ntracked/\nignored/\n"), 0644); err != nil {
		t.Fatal(err)
	}
}

func assertGitToolError(t *testing.T, err error) {
	t.Helper()
	var gitErr *Error
	if !errors.As(err, &gitErr) || gitErr.Code != ErrCodeToolUnavailable {
		t.Fatalf("expected typed Git error, got %v", err)
	}
}

func processCommand(ctx context.Context, output string, code int, stdin string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestGitCommandProcess$", "--", strings.ReplaceAll(output, "\x00", "|"), strconv.Itoa(code))
	cmd.Env = append(os.Environ(), "GIT_TEST_PROCESS=1", "GIT_TEST_STDIN="+stdin)
	return cmd
}

func TestGitCommandProcess(t *testing.T) {
	if os.Getenv("GIT_TEST_PROCESS") != "1" {
		return
	}
	stdin, err := io.ReadAll(os.Stdin)
	if err != nil || string(stdin) != strings.ReplaceAll(os.Getenv("GIT_TEST_STDIN"), "|", "\x00") {
		os.Exit(99)
	}
	output := os.Args[len(os.Args)-2]
	if output == "wait" {
		time.Sleep(10 * time.Second)
	}
	fmt.Fprint(os.Stdout, strings.ReplaceAll(output, "|", "\x00"))
	fmt.Fprint(os.Stderr, "git diagnostic")
	code, _ := strconv.Atoi(os.Args[len(os.Args)-1])
	os.Exit(code)
}

func TestCheckIgnoredPaths_CommandContract(t *testing.T) {
	calls := 0
	svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		calls++
		want := []string{"-C", "workspace", "check-ignore", "-z", "--stdin"}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("args: %q", args)
		}
		return processCommand(ctx, "-dash\x00", 0, "-dash| spaced |"), true
	}))
	for _, paths := range [][]string{nil, {}, {"", ""}} {
		got, err := svc.CheckIgnoredPaths(context.Background(), "workspace", paths)
		if err != nil || len(got) != 0 || calls != 0 {
			t.Fatalf("empty: %v, %v, calls=%d", got, err, calls)
		}
	}
	got, err := svc.CheckIgnoredPaths(context.Background(), "workspace", []string{"-dash", " spaced ", "-dash", ""})
	if err != nil || !reflect.DeepEqual(got, map[string]bool{"-dash": true, " spaced ": false}) || calls != 1 {
		t.Fatalf("got %v, %v, calls=%d", got, err, calls)
	}
}

func TestWorktreeReady_Output(t *testing.T) {
	for _, output := range []string{" true \n", "false\n", "", "true extra"} {
		t.Run("ready/"+output, func(t *testing.T) {
			svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
				if !reflect.DeepEqual(args, []string{"-C", "root", "rev-parse", "--is-inside-work-tree"}) {
					t.Fatalf("args %q", args)
				}
				return processCommand(ctx, output, 0, ""), true
			}))
			err := svc.WorktreeReady(context.Background(), "root")
			if strings.TrimSpace(output) == "true" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				assertGitToolError(t, err)
			}
		})
	}
}

func TestHeadName_Output(t *testing.T) {
	for _, output := range []string{" branch \n", " HEAD\n", " \n"} {
		t.Run("head/"+output, func(t *testing.T) {
			calls := 0
			svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
				calls++
				if !reflect.DeepEqual(args, []string{"-C", "root", "rev-parse", "--abbrev-ref", "HEAD"}) {
					t.Fatalf("args %q", args)
				}
				return processCommand(ctx, output, 0, ""), true
			}))
			head, err := svc.HeadName(context.Background(), "root")
			if err != nil || head != strings.TrimSpace(output) {
				t.Fatalf("head %q, %v", head, err)
			}
			branch, err := svc.CurrentBranch(context.Background(), "root")
			if head == "" || head == "HEAD" {
				assertGitToolError(t, err)
			} else if err != nil || branch != head {
				t.Fatalf("branch %q, %v", branch, err)
			}
			if calls != 2 {
				t.Fatalf("calls=%d", calls)
			}
		})
	}
}

func gitReadOperations(svc *GitService) map[string]func(context.Context) error {
	return map[string]func(context.Context) error{
		"ready":  func(ctx context.Context) error { return svc.WorktreeReady(ctx, "root") },
		"head":   func(ctx context.Context) error { _, err := svc.HeadName(ctx, "root"); return err },
		"branch": func(ctx context.Context) error { _, err := svc.CurrentBranch(ctx, "root"); return err },
		"ignore": func(ctx context.Context) error {
			_, err := svc.CheckIgnoredPaths(ctx, "root", []string{"plain"})
			return err
		},
	}
}

func TestGitReadOperations_Failures(t *testing.T) {
	for _, code := range []int{1, 2, 128} {
		svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
			stdin := ""
			if args[2] == "check-ignore" {
				stdin = "plain|"
			}
			return processCommand(ctx, "", code, stdin), true
		}))
		// Only check-ignore receives stdin, and only it accepts exit 1.
		for name, operation := range gitReadOperations(svc) {
			t.Run(fmt.Sprintf("%s/%d", name, code), func(t *testing.T) {
				err := operation(context.Background())
				if name == "ignore" && code == 1 {
					if err != nil {
						t.Fatal(err)
					}
				} else {
					assertGitToolError(t, err)
				}
			})
		}
	}
	for _, isAvailable := range []bool{false, true} {
		svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, _ ...string) (*exec.Cmd, bool) {
			return exec.CommandContext(ctx, filepath.Join(t.TempDir(), "missing-git")), isAvailable
		}))
		for name, operation := range gitReadOperations(svc) {
			t.Run(fmt.Sprintf("missing/%s/%t", name, isAvailable), func(t *testing.T) { assertGitToolError(t, operation(context.Background())) })
		}
	}
}

func TestGitReadOperations_ContextPrecedence(t *testing.T) {
	for _, isDeadline := range []bool{false, true} {
		svc := NewGitServiceWithRunner(commandContextFunc(func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
			stdin := ""
			if args[2] == "check-ignore" {
				stdin = "plain|"
			}
			return processCommand(ctx, "wait", 1, stdin), true
		}))
		for name, operation := range gitReadOperations(svc) {
			t.Run(fmt.Sprintf("%s/%t", name, isDeadline), func(t *testing.T) {
				var ctx context.Context
				var cancel context.CancelFunc
				want := context.Canceled
				if isDeadline {
					ctx, cancel = context.WithTimeout(context.Background(), 100*time.Millisecond)
					want = context.DeadlineExceeded
				} else {
					ctx, cancel = context.WithCancel(context.Background())
					cancel()
				}
				defer cancel()
				if err := operation(ctx); !errors.Is(err, want) {
					t.Fatalf("want %v, got %v", want, err)
				}
			})
		}
	}
}

func TestGitReadOperations_NilRunnerDefault(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	for _, svc := range []*GitService{NewGitServiceWithRunner(nil), {}, nil} {
		if err := svc.WorktreeReady(context.Background(), root); err != nil {
			t.Fatal(err)
		}
		if svc != nil && svc.runner != nil {
			t.Fatal("default lookup mutated service")
		}
	}
}
