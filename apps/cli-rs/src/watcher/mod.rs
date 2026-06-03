use crate::daemon::event_hub::{EventHub, FrontendEvent};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tracing::{debug, warn};

const DEBOUNCE_MS: u64 = 200;
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

/// Manages watchers for all open workspaces.
pub struct WorkspaceWatchers {
    inner: Mutex<HashMap<PathBuf, Arc<WorktreeWatcher>>>,
    events: Arc<EventHub>,
    on_git_changed: Option<Arc<dyn Fn(PathBuf) + Send + Sync>>,
}

impl WorkspaceWatchers {
    pub fn new(events: Arc<EventHub>) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
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
        let ctx_dir = context_dir.clone();

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

        // Watch context symlink target.
        if let Some(ref ctx) = context_dir {
            if let Err(e) = fw.watch(ctx, RecursiveMode::Recursive) {
                debug!(err = %e, "failed to watch context dir");
            }
        }

        let ws_path_task = ws_path.clone();
        let events_task = events.clone();
        let on_git = self.on_git_changed.clone();
        let git_dir_task = git_dir_clone.clone();
        let ctx_dir_task = ctx_dir.clone();

        // Spawn the event consumer task.
        tokio::spawn(async move {
            consume_events(
                notify_rx,
                cancel_rx,
                ws_path_task,
                git_dir_task,
                ctx_dir_task,
                pending_clone,
                events_task,
                on_git,
            )
            .await;
            // Keep watcher alive by moving it into the task.
            drop(fw);
        });

        let watcher = Arc::new(WorktreeWatcher {
            path: ws_path,
            git_dir,
            context_dir,
            events,
            on_git_changed: self.on_git_changed.clone(),
            ignored_dirs: Mutex::new(HashMap::new()),
            git_ignore_usable: Mutex::new(None),
            pending_file_paths: pending,
            cancel_tx,
        });

        map.insert(workspace_path.to_path_buf(), watcher);
    }

    /// Stop watching a workspace directory.
    pub fn unwatch(&self, workspace_path: &Path) {
        let mut map = self.inner.lock().unwrap();
        if let Some(w) = map.remove(workspace_path) {
            let _ = w.cancel_tx.try_send(());
        }
    }

    /// Stop all watchers.
    #[allow(dead_code)]
    pub fn close(&self) {
        let mut map = self.inner.lock().unwrap();
        for (_, w) in map.drain() {
            let _ = w.cancel_tx.try_send(());
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
                    // Classify: git event vs file event vs context event.
                    let is_git = path.starts_with(&git_entry)
                        || (git_dir != git_entry && path.starts_with(&git_dir));

                    if is_git {
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
