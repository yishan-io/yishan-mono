#![allow(dead_code)]

/// Token usage collector — debounces agent hook events and triggers periodic
/// syncs to the API-service.
///
/// The actual log-file scanning (Codex/Claude/OpenCode/Gemini/Pi) is a large
/// domain that lives in the separate `tokenusage` Go library. This Rust port
/// provides the scheduler/coordinator layer; scanning implementations can be
/// added per-agent when that library is ported.
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;
use tokio::time::sleep;
use tracing::debug;

const STARTUP_DELAY: Duration = Duration::from_secs(30);
const HOOK_DEBOUNCE: Duration = Duration::from_secs(45);
const SYNC_INTERVAL: Duration = Duration::from_secs(15 * 60);
const HOUR_LAG: Duration = Duration::from_secs(2 * 60);

/// Supported agent kinds that produce token-usage logs.
pub const SUPPORTED_AGENT_KINDS: &[&str] = &["codex", "claude", "opencode", "gemini", "pi"];

struct Inner {
    debounce_handles: HashMap<String, tokio::task::JoinHandle<()>>,
    in_flight: HashSet<String>,
    needs_rerun: HashSet<String>,
    closed: bool,
}

pub struct TokenUsageCollector {
    inner: Mutex<Inner>,
    cancel: Arc<Notify>,
}

impl TokenUsageCollector {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Inner {
                debounce_handles: HashMap::new(),
                in_flight: HashSet::new(),
                needs_rerun: HashSet::new(),
                closed: false,
            }),
            cancel: Arc::new(Notify::new()),
        })
    }

    /// Begin startup: schedule initial scan after STARTUP_DELAY and start
    /// the periodic sync + hour-rollover loops.
    pub fn start_startup_scan(self: &Arc<Self>) {
        {
            let guard = self.inner.lock().unwrap();
            if guard.closed { return; }
        }
        self.start_sync_loop();
        self.start_hour_rollover_loop();
        let this = self.clone();
        tokio::spawn(async move {
            sleep(STARTUP_DELAY).await;
            for &kind in SUPPORTED_AGENT_KINDS {
                this.trigger(kind, "startup");
            }
        });
    }

    /// Trigger a debounced scan for the given agent kind.
    /// If a scan is already in-flight, mark needs_rerun instead.
    pub fn trigger(self: &Arc<Self>, agent_kind: &str, source: &str) {
        let kind = normalize_agent_kind(agent_kind);
        if kind.is_empty() { return; }

        let mut guard = self.inner.lock().unwrap();
        if guard.closed { return; }
        if guard.in_flight.contains(&kind) {
            guard.needs_rerun.insert(kind);
            return;
        }
        // Cancel existing debounce.
        if let Some(h) = guard.debounce_handles.remove(&kind) {
            h.abort();
        }
        let this_weak = Arc::downgrade(self);
        let kind2 = kind.clone();
        let source2 = source.to_string();
        let handle = tokio::spawn(async move {
            sleep(HOOK_DEBOUNCE).await;
            if let Some(this) = this_weak.upgrade() {
                this.run_scan(&kind2, &source2).await;
            }
        });
        guard.debounce_handles.insert(kind, handle);
    }

    /// Shut down: cancel all pending timers and flush pending data.
    pub fn close(&self) {
        let mut guard = self.inner.lock().unwrap();
        if guard.closed { return; }
        guard.closed = true;
        for (_, h) in guard.debounce_handles.drain() {
            h.abort();
        }
        self.cancel.notify_waiters();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    async fn run_scan(self: &Arc<Self>, agent_kind: &str, source: &str) {
        {
            let mut guard = self.inner.lock().unwrap();
            if guard.closed { return; }
            guard.in_flight.insert(agent_kind.to_string());
            guard.debounce_handles.remove(agent_kind);
        }

        debug!(agent = agent_kind, source, "token usage scan starting");
        // TODO: plug in per-agent log scanner when ported from Go.
        debug!(agent = agent_kind, source, "token usage scan completed (stub)");

        let (should_rerun, closed) = {
            let mut guard = self.inner.lock().unwrap();
            guard.in_flight.remove(agent_kind);
            let r = guard.needs_rerun.remove(agent_kind);
            (r, guard.closed)
        };
        if should_rerun && !closed {
            self.trigger(agent_kind, "rerun");
        }
    }

    fn start_sync_loop(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = this.cancel.notified() => break,
                    _ = sleep(SYNC_INTERVAL) => {
                        debug!("token usage: periodic sync");
                        // TODO: sync dirty rows to API
                    }
                }
            }
        });
    }

    fn start_hour_rollover_loop(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                let wait = duration_until_next_hour_plus_lag();
                tokio::select! {
                    _ = this.cancel.notified() => break,
                    _ = sleep(wait) => {
                        debug!("token usage: hour-rollover sync");
                        // TODO: sync dirty rows to API
                    }
                }
            }
        });
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

pub fn normalize_agent_kind(kind: &str) -> String {
    match kind.trim().to_lowercase().as_str() {
        "codex" | "claude" | "opencode" | "gemini" | "pi" => kind.trim().to_lowercase(),
        _ => String::new(),
    }
}

fn duration_until_next_hour_plus_lag() -> Duration {
    let now = chrono::Utc::now();
    let now_millis = now.timestamp_millis();
    let hour_millis: i64 = 3_600_000;
    let millis_into_hour = now_millis % hour_millis;
    let millis_to_next_hour = hour_millis - millis_into_hour;
    let lag_millis = HOUR_LAG.as_millis() as i64;
    let total = millis_to_next_hour + lag_millis;
    Duration::from_millis(total.max(0) as u64)
}
