# Workspace file watchers

## Status

This document describes the watcher ignore-batching implementation.
Native Git classification, queue integration, notification shutdown, and GitService integration passed scoped and combined code review.
Git and watcher tests passed normally and under the race detector. Full CLI tests and vet passed. Scoped gopls reported no diagnostics.
These checks do not prove that the reported macOS CPU/RPC incident is resolved.

## Ownership and platforms

`Watchers` owns workspace registrations and shared context watchers. Each `worktreeWatcher` owns its queue, ignore cache, timers, and command cancellation policy.
`internal/git.GitService` owns command arguments, NUL stdin/output, exit-code interpretation, readiness and HEAD reads.
The watcher consumes only `WorktreeReady`, `CheckIgnoredPaths`, and `HeadName`; it owns caching, generations,
serialized readiness, 128-path chunks, and deadlines. Manual fixtures use a non-mutating nil-service fallback.

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
GitService executes context-bound commands with watcher deadlines and lifecycle cancellation.
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

## Notification shutdown contract

File notifications register admission under the entry state mutex before invoking a sink, then complete their registration afterward.
Closure seals admission under that same mutex. Git branch lookup runs before admission with watcher command cancellation.
Cancelled or closed watchers reject admission. Once admitted, the entire Git sink → `onGitChanged` sequence can continue during shutdown.
Directory availability is still checked before delivery and before the Git callback.

`Close` and `Unwatch` cancel commands, stop timers, clear pending work, advance the cache generation, and wait for all admitted sequences.
Repeated and overlapping callers join the same completion, including entries already closing.
Every targeted entry is sealed before waiting for the first drain. Callbacks and completion waits run outside state and registry mutexes.
This is a notification completion guarantee, not a worker/backend goroutine join guarantee.

Closing entries stay discoverable until completion. Same-path `Watch` waits outside the registry lock before replacement;
old drains cannot remove replacements. `Close` captures active and closing registrations at its registry-lock linearization point.
It does not permanently disable later `Watch` calls. Shared context backends detach under that lock and close outside it;
a shared registration remains while another workspace uses it.

Sink callbacks and `onGitChanged` must not synchronously call `Watch`, `Unwatch`, or `Close`
on their owning `Watchers`. They can request lifecycle work asynchronously, but must not wait for it inside the callback.
A callback that never returns also prevents notification shutdown from completing. No goroutine identity detection or public stop/wait API is provided.

## Source and tests

| File | Responsibility |
| --- | --- |
| `watchers.go` | Registration, per-workspace state, shared context routing |
| `state.go` | Event classification, path predicates, cache invalidation |
| `ignore.go` | Git operation batching, readiness policy, cache generation checks |
| `ingress.go` | Ordinary queue, serialization, overflow and retry fallback |
| `emit.go` | Bounded notification scheduling and payloads |
| `lifecycle.go` | Cancellation, detach, and close |
| `notification.go` | Atomic sequence admission and completion registration |
| `lifecycle_test.go` | Notification drains, overlapping closure, cancellation and replacement |
| `ignore_test.go` | Counts, filenames, tracked descendants, failures, invalidation, readiness |
| `ingress_test.go` | Deduplication, arrivals during checks, invalidation, sustained publication, cancellation |

From `apps/cli`, run the focused checks:

```sh
go test ./internal/git/... ./internal/workspace/watchers/...
go test -race ./internal/git/... ./internal/workspace/watchers/...
```

Full CLI verification also passed with `go test ./...` and `go vet ./...` from `apps/cli`.
`workload_test.go` records the following deterministic process counts, excluding branch reads and directory discovery:

| Workload | Readiness | check-ignore | Total |
| --- | --- | --- | --- |
| 257 distinct cold paths | 1 | 3 | 4 |
| Same 257 exact warm paths | 0 | 0 | 0 |
| 1,000 events across two paths, with in-flight arrivals | 1 | 2 | 3 |

The cold workload uses batch sizes 128, 128, and 1 instead of the old modeled 257 per-miss checks.
The repeated workload observes peak asynchronous classification concurrency of one per workspace.
These are subprocess-count results, not measurements of incident-time CPU usage.

Known nonblocking test gaps: queue-overflow and repeated-generation fallback branches lack direct full-refresh regression tests.
Lifecycle join tests also depend on test-only runtime stack formatting. Production code does not inspect goroutine identities.
