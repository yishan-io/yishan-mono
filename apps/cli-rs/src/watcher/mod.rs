use crate::daemon::event_hub::{EventHub, FrontendEvent};
use crate::workspace::file_service::IGNORED_DIRS;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::time::sleep;
use tracing::{debug, warn};

const DEBOUNCE_MS: u64 = 200;
/// After emitting a `gitChanged` event, suppress further git events for this
/// long.  Breaks the feedback loop where `git.status` refreshes the index
/// mtime → watcher fires again → loop.
const GIT_COOLDOWN_MS: u64 = 1500;
const CONTEXT_LINK_NAME: &str = ".my-context";

/// Per-workspace fsnotify watcher with debounce + gitignore filtering.
/// Publishes `workspaceFilesChanged` and `gitChanged` events to the EventHub.
#[allow(dead_code)]
struct WorktreeWatcher {
    path: PathBuf,
    git_dir: PathBuf,
    context_dir: Option<PathBuf>,
    events: Arc<EventHub>,
    on_git_changed: Option<Arc<dyn Fn(PathBuf) + Send + Sync>>,
    ignored_dirs: Mutex<HashMap<String, bool>>,
    git_ignore_usable: Mutex<Option<bool>>,
    // Pending changed relative paths (pre-debounce).
    pending_file_paths: Arc<Mutex<Vec<String>>>,
    // Channel to cancel the background task.
    cancel_tx: mpsc::Sender<()>,
}

/// Shared watcher for one `.my-context` real target directory.
/// All workspaces whose `.my-context` symlink resolves to the same real path
/// share a single OS-level watcher. When a file changes in the context dir,
/// `workspaceFilesChanged` is emitted for every registered workspace path.
struct ContextWatcher {
    /// Real path being watched (kept for diagnostics / future use).
    #[allow(dead_code)]
    target: PathBuf,
    /// Workspace worktree paths that share this context dir (shared with the task).
    workspace_paths: Arc<Mutex<Vec<PathBuf>>>,
    /// Cancel channel for the background task.
    cancel_tx: mpsc::Sender<()>,
}

/// Manages watchers for all open workspaces.
pub struct WorkspaceWatchers {
    inner: Mutex<HashMap<PathBuf, Arc<WorktreeWatcher>>>,
    /// Shared context watchers, keyed by real context target path.
    context_watchers: Mutex<HashMap<PathBuf, ContextWatcher>>,
    events: Arc<EventHub>,
    on_git_changed: Option<Arc<dyn Fn(PathBuf) + Send + Sync>>,
}

impl WorkspaceWatchers {
    pub fn new(events: Arc<EventHub>) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            context_watchers: Mutex::new(HashMap::new()),
            events,
            on_git_changed: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_git_callback(mut self, cb: impl Fn(PathBuf) + Send + Sync + 'static) -> Self {
        self.on_git_changed = Some(Arc::new(cb));
        self
    }

    /// Start watching a workspace directory (idempotent).
    pub fn watch(&self, workspace_path: &Path) {
        let mut map = self.inner.lock().unwrap();
        if map.contains_key(workspace_path) {
            return;
        }

        // Only watch git repositories.
        if !workspace_path.join(".git").exists() {
            return;
        }

        let git_dir = resolve_git_dir(workspace_path);
        let context_dir = resolve_context_dir(workspace_path);

        let (cancel_tx, cancel_rx) = mpsc::channel(1);
        let pending = Arc::new(Mutex::new(Vec::<String>::new()));
        let pending_clone = pending.clone();
        let events = self.events.clone();
        let ws_path = workspace_path.to_path_buf();
        let git_dir_clone = git_dir.clone();
        // Pass None for ctx_dir here — context events are now handled by the
        // shared ContextWatcher, not the per-workspace watcher.
        let ctx_dir: Option<PathBuf> = None;

        // Set up notify watcher on a background thread.
        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<Event>>(256);

        let mut fw = match RecommendedWatcher::new(
            move |res| {
                let _ = notify_tx.blocking_send(res);
            },
            notify::Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                warn!(err = %e, path = %workspace_path.display(), "failed to create watcher");
                return;
            }
        };

        // Watch workspace root recursively.
        if let Err(e) = fw.watch(workspace_path, RecursiveMode::Recursive) {
            debug!(err = %e, "failed to watch workspace root");
        }

        // Watch git internals.
        for target in git_targets(&git_dir) {
            if let Err(e) = fw.watch(&target, RecursiveMode::NonRecursive) {
                debug!(err = %e, target = %target.display(), "failed to watch git target");
            }
        }

        // Note: context dir is NOT watched here — handled by the shared ContextWatcher below.

        let ws_path_task = ws_path.clone();
        let events_task = events.clone();
        let on_git = self.on_git_changed.clone();
        let git_dir_task = git_dir_clone.clone();

        // Spawn the event consumer task.
        tokio::spawn(async move {
            consume_events(
                notify_rx,
                cancel_rx,
                ws_path_task,
                git_dir_task,
                ctx_dir,
                pending_clone,
                events_task,
                on_git,
            )
            .await;
            // Keep watcher alive by moving it into the task.
            drop(fw);
        });

        let watcher = Arc::new(WorktreeWatcher {
            path: ws_path.clone(),
            git_dir,
            context_dir: context_dir.clone(),
            events,
            on_git_changed: self.on_git_changed.clone(),
            ignored_dirs: Mutex::new(HashMap::new()),
            git_ignore_usable: Mutex::new(None),
            pending_file_paths: pending,
            cancel_tx,
        });

        map.insert(workspace_path.to_path_buf(), watcher);
        drop(map);

        // Register this workspace with the shared context watcher (if it has one).
        if let Some(ctx_target) = context_dir {
            self.register_context_workspace(&ctx_target, ws_path);
        }
    }

    /// Ensure there is exactly one OS-level watcher for `ctx_target`, and that
    /// `workspace_path` is in the subscriber list.  If the ContextWatcher
    /// already exists we just add the subscriber; otherwise we create a new one.
    fn register_context_workspace(&self, ctx_target: &PathBuf, workspace_path: PathBuf) {
        let mut ctx_map = self.context_watchers.lock().unwrap();

        if let Some(cw) = ctx_map.get_mut(ctx_target) {
            // Already watching this context dir — just add the subscriber.
            let mut paths = cw.workspace_paths.lock().unwrap();
            if !paths.contains(&workspace_path) {
                paths.push(workspace_path);
            }
            return;
        }

        // First workspace to use this context dir — start a new OS watcher.
        let (cancel_tx, cancel_rx) = mpsc::channel(1);
        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<Event>>(256);

        let mut fw = match RecommendedWatcher::new(
            move |res| { let _ = notify_tx.blocking_send(res); },
            notify::Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                warn!(err = %e, target = %ctx_target.display(), "failed to create context watcher");
                return;
            }
        };

        if let Err(e) = fw.watch(ctx_target, RecursiveMode::Recursive) {
            debug!(err = %e, target = %ctx_target.display(), "failed to watch context dir");
        }

        let workspace_paths_shared: Arc<Mutex<Vec<PathBuf>>> =
            Arc::new(Mutex::new(vec![workspace_path.clone()]));
        let workspace_paths_task = workspace_paths_shared.clone();
        let ctx_target_clone = ctx_target.clone();
        let events_task = self.events.clone();

        tokio::spawn(async move {
            consume_context_events(
                notify_rx,
                cancel_rx,
                ctx_target_clone,
                workspace_paths_task,
                events_task,
            )
            .await;
            drop(fw);
        });

        ctx_map.insert(ctx_target.clone(), ContextWatcher {
            target: ctx_target.clone(),
            workspace_paths: workspace_paths_shared,
            cancel_tx,
        });
    }

    /// Stop watching a workspace directory.
    pub fn unwatch(&self, workspace_path: &Path) {
        let mut map = self.inner.lock().unwrap();
        if let Some(w) = map.remove(workspace_path) {
            let _ = w.cancel_tx.try_send(());

            // Remove this workspace from any shared context watcher subscriber list.
            if let Some(ref ctx_target) = w.context_dir {
                let mut ctx_map = self.context_watchers.lock().unwrap();
                if let Some(cw) = ctx_map.get(ctx_target) {
                    let mut paths = cw.workspace_paths.lock().unwrap();
                    paths.retain(|p| p != workspace_path);
                    let is_empty = paths.is_empty();
                    drop(paths);
                    if is_empty {
                        if let Some(removed) = ctx_map.remove(ctx_target) {
                            let _ = removed.cancel_tx.try_send(());
                        }
                    }
                }
            }
        }
    }

    /// Stop all watchers.
    #[allow(dead_code)]
    pub fn close(&self) {
        let mut map = self.inner.lock().unwrap();
        for (_, w) in map.drain() {
            let _ = w.cancel_tx.try_send(());
        }
        let mut ctx_map = self.context_watchers.lock().unwrap();
        for (_, cw) in ctx_map.drain() {
            let _ = cw.cancel_tx.try_send(());
        }
    }
}

/// Async task that consumes notify events, applies debounce, and publishes to the EventHub.
async fn consume_events(
    mut notify_rx: mpsc::Receiver<notify::Result<Event>>,
    mut cancel_rx: mpsc::Receiver<()>,
    ws_path: PathBuf,
    git_dir: PathBuf,
    ctx_dir: Option<PathBuf>,
    pending: Arc<Mutex<Vec<String>>>,
    events: Arc<EventHub>,
    on_git: Option<Arc<dyn Fn(PathBuf) + Send + Sync>>,
) {
    let git_entry = ws_path.join(".git");
    let mut file_debounce: Option<tokio::task::JoinHandle<()>> = None;
    let mut git_debounce: Option<tokio::task::JoinHandle<()>> = None;
    // Cooldown: timestamp of the last emitted gitChanged event.
    let mut git_last_emitted: Option<Instant> = None;

    loop {
        tokio::select! {
            _ = cancel_rx.recv() => break,
            maybe_event = notify_rx.recv() => {
                let ev = match maybe_event {
                    None => break,
                    Some(Err(e)) => {
                        warn!(err = %e, "watcher error");
                        continue;
                    }
                    Some(Ok(ev)) => ev,
                };

                for path in &ev.paths {
                    // Skip git lock files — they are created and deleted during
                    // every git operation (index.lock, HEAD.lock, etc.) and are
                    // the primary driver of the gitChanged feedback loop.
                    if path.extension().map_or(false, |e| e == "lock") {
                        continue;
                    }

                    // Skip events from ignored high-churn directories (target,
                    // node_modules, .next, …). These can produce thousands of
                    // events per second during builds and have no value to the UI.
                    let in_ignored = path.components().any(|c| {
                        IGNORED_DIRS.contains(&c.as_os_str().to_string_lossy().as_ref())
                    });
                    if in_ignored {
                        continue;
                    }

                    // Classify: git event vs file event vs context event.
                    let is_git = path.starts_with(&git_entry)
                        || (git_dir != git_entry && path.starts_with(&git_dir));

                    if is_git {
                        // Apply cooldown: if we just emitted gitChanged, ignore
                        // further git events until the cooldown expires.
                        if let Some(last) = git_last_emitted {
                            if last.elapsed() < Duration::from_millis(GIT_COOLDOWN_MS) {
                                continue;
                            }
                        }
                        // Debounce git event.
                        if let Some(h) = git_debounce.take() { h.abort(); }
                        let events2 = events.clone();
                        let ws2 = ws_path.clone();
                        let on_git2 = on_git.clone();
                        git_debounce = Some(tokio::spawn(async move {
                            sleep(Duration::from_millis(DEBOUNCE_MS)).await;
                            events2.publish(FrontendEvent::new(
                                "gitChanged",
                                json!({ "workspaceWorktreePath": ws2.to_string_lossy() }),
                            ));
                            if let Some(cb) = on_git2 {
                                cb(ws2);
                            }
                        }));
                        // Record emission time now (before the debounce fires) so
                        // that rapid follow-on events are suppressed immediately.
                        git_last_emitted = Some(Instant::now());
                    } else {
                        // Compute relative path.
                        let rel = if let Some(ref ctx) = ctx_dir {
                            if path.starts_with(ctx) {
                                let suffix = path.strip_prefix(ctx).unwrap_or(path);
                                let joined = Path::new(CONTEXT_LINK_NAME).join(suffix);
                                joined.to_string_lossy().replace('\\', "/")
                            } else {
                                path.strip_prefix(&ws_path)
                                    .unwrap_or(path)
                                    .to_string_lossy()
                                    .replace('\\', "/")
                            }
                        } else {
                            path.strip_prefix(&ws_path)
                                .unwrap_or(path)
                                .to_string_lossy()
                                .replace('\\', "/")
                        };

                        pending.lock().unwrap().push(rel);

                        // Debounce file event.
                        if let Some(h) = file_debounce.take() { h.abort(); }
                        let events2 = events.clone();
                        let ws2 = ws_path.clone();
                        let pending2 = pending.clone();
                        file_debounce = Some(tokio::spawn(async move {
                            sleep(Duration::from_millis(DEBOUNCE_MS)).await;
                            let paths: HashSet<String> = {
                                let mut p = pending2.lock().unwrap();
                                std::mem::take(&mut *p).into_iter().collect()
                            };
                            let paths_vec: Vec<String> = paths.into_iter().collect();
                            events2.publish(FrontendEvent::new(
                                "workspaceFilesChanged",
                                json!({
                                    "workspaceWorktreePath": ws2.to_string_lossy(),
                                    "changedRelativePaths": paths_vec,
                                }),
                            ));
                        }));
                    }
                }
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Shared context event consumer.
/// Receives events from the real `.my-context` target directory and emits
/// `workspaceFilesChanged` for every workspace that shares this context dir.
async fn consume_context_events(
    mut notify_rx: mpsc::Receiver<notify::Result<Event>>,
    mut cancel_rx: mpsc::Receiver<()>,
    ctx_target: PathBuf,
    workspace_paths: Arc<Mutex<Vec<PathBuf>>>,
    events: Arc<EventHub>,
) {
    let pending: Arc<Mutex<Vec<(PathBuf, String)>>> = Arc::new(Mutex::new(Vec::new()));
    let mut debounce: Option<tokio::task::JoinHandle<()>> = None;

    loop {
        tokio::select! {
            _ = cancel_rx.recv() => break,
            maybe_event = notify_rx.recv() => {
                let ev = match maybe_event {
                    None => break,
                    Some(Err(e)) => { warn!(err = %e, "context watcher error"); continue; }
                    Some(Ok(ev)) => ev,
                };

                for path in &ev.paths {
                    if path.extension().map_or(false, |e| e == "lock") { continue; }

                    // Relative path inside the context dir → ".my-context/..."
                    let suffix = path.strip_prefix(&ctx_target).unwrap_or(path);
                    let rel = Path::new(CONTEXT_LINK_NAME).join(suffix)
                        .to_string_lossy().replace('\\', "/");

                    // Snapshot workspace list and queue one pending entry per workspace.
                    let ws_paths: Vec<PathBuf> = workspace_paths.lock().unwrap().clone();
                    let mut p = pending.lock().unwrap();
                    for ws in ws_paths {
                        p.push((ws, rel.clone()));
                    }
                }

                // Debounce — fire after DEBOUNCE_MS of quiet.
                if let Some(h) = debounce.take() { h.abort(); }
                let pending2 = pending.clone();
                let events2 = events.clone();
                debounce = Some(tokio::spawn(async move {
                    sleep(Duration::from_millis(DEBOUNCE_MS)).await;
                    // Group by workspace path.
                    let entries: Vec<(PathBuf, String)> = {
                        let mut p = pending2.lock().unwrap();
                        std::mem::take(&mut *p)
                    };
                    let mut by_ws: HashMap<PathBuf, HashSet<String>> = HashMap::new();
                    for (ws, rel) in entries {
                        by_ws.entry(ws).or_default().insert(rel);
                    }
                    for (ws_path, paths_set) in by_ws {
                        let paths_vec: Vec<String> = paths_set.into_iter().collect();
                        events2.publish(FrontendEvent::new(
                            "workspaceFilesChanged",
                            json!({
                                "workspaceWorktreePath": ws_path.to_string_lossy(),
                                "changedRelativePaths": paths_vec,
                            }),
                        ));
                    }
                }));
            }
        }
    }
}

/// Resolve the actual git directory (handles worktree `.git` file pointers).
fn resolve_git_dir(worktree: &Path) -> PathBuf {
    let git_entry = worktree.join(".git");
    let meta = match std::fs::symlink_metadata(&git_entry) {
        Ok(m) => m,
        Err(_) => return git_entry,
    };
    if meta.is_dir() {
        return git_entry;
    }
    // .git is a file — read "gitdir: <path>"
    let content = match std::fs::read_to_string(&git_entry) {
        Ok(s) => s,
        Err(_) => return git_entry,
    };
    let line = content.trim();
    let Some(path_str) = line.strip_prefix("gitdir: ") else {
        return git_entry;
    };
    let p = Path::new(path_str.trim());
    let resolved = if p.is_absolute() {
        p.to_path_buf()
    } else {
        worktree.join(p)
    };
    let resolved = match resolved.canonicalize() {
        Ok(r) => r,
        Err(_) => return git_entry,
    };
    resolved
}

/// Resolve the `.my-context` symlink target, if it exists and is a directory.
fn resolve_context_dir(worktree: &Path) -> Option<PathBuf> {
    let link = worktree.join(CONTEXT_LINK_NAME);
    let target = std::fs::canonicalize(&link).ok()?;
    if target.is_dir() { Some(target) } else { None }
}

/// Returns the set of paths inside the git dir to watch.
fn git_targets(git_dir: &Path) -> Vec<PathBuf> {
    let mut targets = vec![
        git_dir.to_path_buf(),
        git_dir.join("HEAD"),
        git_dir.join("index"),
    ];
    let refs = git_dir.join("refs");
    if refs.is_dir() {
        targets.push(refs);
    }
    targets
}
