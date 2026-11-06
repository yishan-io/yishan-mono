package git

import (
	"context"
	"fmt"
	"os/exec"
	"reflect"
	"testing"
	"time"
)

func projectionReadOperations(svc *GitService) map[string]func(context.Context) error {
	return map[string]func(context.Context) error{
		"changes": func(ctx context.Context) error { _, err := svc.ListChanges(ctx, "root"); return err },
		"summary": func(ctx context.Context) error { _, err := svc.BranchDiffSummary(ctx, "root", "main"); return err },
	}
}

func TestProjectionReads_SharedDeadline(t *testing.T) {
	for _, isShortParent := range []bool{false, true} {
		for _, name := range []string{"changes", "summary"} {
			t.Run(fmt.Sprintf("%s/short=%t", name, isShortParent), func(t *testing.T) {
				ctx := context.Background()
				var parentDeadline time.Time
				if isShortParent {
					var cancel context.CancelFunc
					ctx, cancel = context.WithTimeout(ctx, 5*time.Second)
					defer cancel()
					parentDeadline, _ = ctx.Deadline()
				}
				assertProjectionDeadline(t, ctx, name, parentDeadline)
			})
		}
	}
}

func assertProjectionDeadline(t *testing.T, ctx context.Context, name string, parentDeadline time.Time) {
	t.Helper()
	budget := 15 * time.Second
	outputs := []string{" M file.ts\n", "2\t1\tfile.ts\n", ""}
	commands := [][]string{{"status", "--porcelain", "--untracked-files=all"}, {"diff", "--numstat"}, {"diff", "--cached", "--numstat"}}
	if name == "summary" {
		budget, outputs, commands = 10*time.Second, outputs[1:2], [][]string{{"diff", "--numstat", "main...HEAD"}}
	}
	started := time.Now()
	calls := 0
	var sharedDeadline time.Time
	svc := NewGitServiceWithRunner(commandContextFunc(func(commandCtx context.Context, args ...string) (*exec.Cmd, bool) {
		deadline, hasDeadline := commandCtx.Deadline()
		if !hasDeadline || deadline.Before(started) || deadline.After(time.Now().Add(budget)) {
			t.Fatalf("deadline %v outside %v budget", deadline, budget)
		}
		if parentDeadline.IsZero() && deadline.Before(started.Add(budget)) {
			t.Fatal("operation budget is shorter than configured")
		}
		if !parentDeadline.IsZero() && deadline != parentDeadline {
			t.Fatal("shorter parent deadline not preserved")
		}
		if calls > 0 && deadline != sharedDeadline {
			t.Fatal("deadline restarted between commands")
		}
		sharedDeadline = deadline
		if calls >= len(outputs) || !reflect.DeepEqual(args, append([]string{"-C", "root"}, commands[calls]...)) {
			t.Fatalf("unexpected command %q", args)
		}
		cmd := processCommand(commandCtx, outputs[calls], 0, "")
		cmd.Env = append(cmd.Env, "GORACE=atexit_sleep_ms=0")
		calls++
		return cmd, true
	}))
	assertProjectionOutput(t, svc, ctx, name)
	if calls != len(outputs) {
		t.Fatalf("calls=%d, want %d", calls, len(outputs))
	}
}

func TestProjectionReads_ContextStopsCommands(t *testing.T) {
	for _, name := range []string{"changes", "summary"} {
		maxCalls := 3
		if name == "summary" {
			maxCalls = 1
		}
		for stopAt := 1; stopAt <= maxCalls; stopAt++ {
			for _, isDeadline := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%d/deadline=%t", name, stopAt, isDeadline), func(t *testing.T) {
					assertProjectionStops(t, name, stopAt, isDeadline)
				})
			}
		}
	}
}

func assertProjectionStops(t *testing.T, name string, stopAt int, isDeadline bool) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	want := context.Canceled
	if isDeadline {
		cancel()
		ctx, cancel = context.WithTimeout(context.Background(), time.Second)
		want = context.DeadlineExceeded
	}
	defer cancel()
	calls := 0
	svc := NewGitServiceWithRunner(commandContextFunc(func(commandCtx context.Context, _ ...string) (*exec.Cmd, bool) {
		calls++
		output := ""
		if calls == stopAt {
			if isDeadline {
				output = "wait"
			} else {
				cancel()
			}
		}
		cmd := processCommand(commandCtx, output, 0, "")
		cmd.Env = append(cmd.Env, "GORACE=atexit_sleep_ms=0")
		return cmd, true
	}))
	if err := projectionReadOperations(svc)[name](ctx); err != want {
		t.Fatalf("got %v, want identical %v", err, want)
	}
	if calls != stopAt {
		t.Fatalf("calls=%d, want %d", calls, stopAt)
	}
	calls = 0
	if err := projectionReadOperations(svc)[name](ctx); err != want || calls != 0 {
		t.Fatalf("expired context: err=%v calls=%d", err, calls)
	}
}

func assertProjectionOutput(t *testing.T, svc *GitService, ctx context.Context, name string) {
	t.Helper()
	if name == "changes" {
		sections, err := svc.ListChanges(ctx, "root")
		if err != nil || len(sections.Unstaged) != 1 || len(sections.Staged) != 0 || len(sections.Untracked) != 0 {
			t.Fatalf("sections=%+v err=%v", sections, err)
		}
		if sections.Unstaged[0] != (gitChange{Path: "file.ts", Kind: "modified", Additions: 2, Deletions: 1}) {
			t.Fatalf("change=%+v", sections.Unstaged[0])
		}
		return
	}
	summary, err := svc.BranchDiffSummary(ctx, "root", "main")
	if err != nil || summary.FileCount != 1 || summary.Additions != 2 || summary.Deletions != 1 || !reflect.DeepEqual(summary.Files, []string{"file.ts"}) {
		t.Fatalf("summary=%+v err=%v", summary, err)
	}
}
