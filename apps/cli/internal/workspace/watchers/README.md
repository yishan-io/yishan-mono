# Workspace file watchers

## Status

This document describes the current worktree implementation. The ignore batching change is not fully accepted yet.
Native Git classification passed scoped review. Queue integration passed focused tests, but a shutdown race remains open.
Full CLI validation and final review are pending. These changes do not prove that the reported macOS CPU/RPC incident is resolved.

## Ownership and platforms

`Watchers` owns workspace registrations and shared context watchers. Each `worktreeWatcher` owns its queue, ignore cache, timers, and command cancellation.

The macOS backend uses FSEvents, not per-directory kqueue watches. The non-Darwin backend uses fsnotify and retains synchronous directory filtering.
Event-path batching does not replace that synchronous traversal contract. Backend code lives in `fswatch/`.

## Event flow

`state.go` classifies incoming paths before expensive ignore checks:

1. Reject events during the 300 ms startup interval or when the worktree directory is unavailable or the watcher is closed.
2. Invalidate the ignore cache when a recognized ignore configuration path changes.
3. Route Git metadata events to the Git timer. Suppress `.lock` events and retain branch-affecting classification.
4. Route shared `.my-context` events and always-watched context paths to file notification scheduling.
5. Apply cheap path exclusions, then enqueue ordinary workspace-relative paths.

`ingress.go` deduplicates both pending and in-flight ordinary paths. Each workspace runs at most one asynchronous queue drain.
New distinct paths remain queued while Git runs. The watcher state mutex is not held during Git execution.

The first ordinary event starts a 200 ms timer. Later arrivals do not reset it.
The drain takes at most 128 paths per batch. A queue with 1,024 pending paths falls back to a full-refresh notification on overflow.
This fallback avoids silent event loss and unbounded queue growth.

## Native Git classification

`ignore.go` reuses exact positive and negative cache entries. Cache misses use:

```sh
git -C <worktreePath> check-ignore -z --stdin
```

Input and output use NUL separators. Paths retain spaces, newlines, and leading dashes.
Git exit codes 0 and 1 represent successful classification. Other errors do not become cached negative matches.

A cold cache first runs `rev-parse --is-inside-work-tree`. Concurrent callers share an active readiness probe.
Successful readiness is cached until invalidation. Failed probes remain retryable.
For N distinct cold misses, a successful classification uses one readiness process plus `ceil(N / 128)` check-ignore processes.
Exact warm-cache hits use neither process. These counts exclude unrelated branch reads and synchronous directory discovery.

An ignored parent cache entry does not suppress descendants. Git can contain a force-added tracked child inside an ignored directory.
Only exact cache entries are reused. Git decides uncached descendant paths.

Each classification call has a two-second deadline shared by its readiness probe and chunks.
Commands use `internal/git/exec.Runner.CommandContext` and watcher lifecycle cancellation.
On non-cancellation errors, ordinary events fail open: paths remain visible instead of being permanently cached as non-ignored.

## Ignore configuration changes

Recognized changes to `.gitignore`, the `.git` entry, and `.git/info/exclude` clear the complete ignore and readiness caches.
Each invalidation increments a generation, which is a version number for the rules.
Readiness and classification results can populate caches only when their captured generation is still current.

The ordinary drain reclassifies in-flight paths when the generation changes. It makes at most two classification attempts per batch.
Repeated invalidation falls back to a full refresh rather than suppressing a newly visible change or retrying indefinitely.
This change does not add new monitoring for global ignore configuration.

## Notifications and progress

`emit.go` uses non-sliding 200 ms file and Git timers. Continuous arrivals do not postpone an existing timer.
A timer remains occupied during sink execution, which prevents slow sinks from creating unbounded concurrent timer callbacks.
Arrivals during a callback schedule a later flush after that callback completes.

Ordinary paths pass through queue scheduling, classification, and file notification scheduling.
Without queued work or command delay, the two scheduling intervals total approximately 400 ms.
Queued batches, bounded command execution, sink execution, and scheduler delay add latency. This is not a fixed wall-clock guarantee.

File notifications retain at most 250 distinct paths. Larger bursts publish a non-nil empty `ChangedRelativePaths` array.
The empty array means a full refresh. Queue overflow and repeated rule invalidation use the same contract.
Git notifications retain branch-affecting information and read the current branch when required.

## Shutdown limitation

`lifecycle.go` marks a watcher closed, cancels Git commands, stops timers, clears pending work, and advances the cache generation.
Backend shutdown occurs outside registry locks. Shared context registrations remain until their last workspace detaches.

Strict notification shutdown is not yet guaranteed. `canNotify()` releases the state mutex before sink or `onGitChanged` invocation.
`Close()` can return between that check and the invocation. A callback can therefore start after `Close()` returns.

Do not treat passing race tests as proof that this ordering race is fixed.
The remaining design must define notification admission and callback-reentrant close behavior without holding watcher mutexes across user callbacks.

## Source and tests

| File | Responsibility |
| --- | --- |
| `watchers.go` | Registration, per-workspace state, shared context routing |
| `state.go` | Event classification, path predicates, cache invalidation |
| `ignore.go` | Native Git batching, readiness, cache generation checks |
| `ingress.go` | Ordinary queue, serialization, overflow and retry fallback |
| `emit.go` | Bounded notification scheduling and payloads |
| `lifecycle.go` | Cancellation, detach, and close |
| `ignore_test.go` | Counts, filenames, tracked descendants, failures, invalidation, readiness |
| `ingress_test.go` | Deduplication, arrivals during checks, invalidation, sustained publication, cancellation |

From `apps/cli`, run the focused checks:

```sh
go test ./internal/workspace/watchers/...
go test -race ./internal/workspace/watchers/...
```

Existing close-cancellation coverage does not close the notification check/invocation gap described above.
The task handoff records completed checks separately from the pending full CLI test, vet, performance report, and final review.
