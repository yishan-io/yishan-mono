#![allow(dead_code)]

/// CLI detector — detects installed agent CLIs and GitHub CLI.
/// Results are cached for 1 hour (configurable via env AGENT_CLI_DETECTION_CACHE_TTL_SECS).
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::debug;

const DEFAULT_CACHE_TTL_SECS: u64 = 3600; // 1 hour
const VERSION_TIMEOUT_SECS: u64 = 5;

/// Supported agent CLI definitions.
static AGENT_CLIS: &[(&str, &str)] = &[
    ("opencode", "opencode"),
    ("codex", "codex"),
    ("claude", "claude"),
    ("gemini", "gemini"),
    ("pi", "pi"),
    ("copilot", "copilot"),
    ("cursor-agent", "cursor"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub tool_id: String,
    pub category: String,
    pub label: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub status_detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub tool_id: String,
    pub category: String,
    pub label: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authenticated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    pub status_detail: String,
}

struct CachedResult<T: Clone> {
    value: T,
    cached_at: Instant,
    ttl: Duration,
}

impl<T: Clone> CachedResult<T> {
    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() < self.ttl
    }
}

static AGENT_CACHE: Mutex<Option<CachedResult<Vec<CliStatus>>>> = Mutex::new(None);
static GH_CACHE: Mutex<Option<CachedResult<GhStatus>>> = Mutex::new(None);

fn cache_ttl() -> Duration {
    let secs = std::env::var("AGENT_CLI_DETECTION_CACHE_TTL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(DEFAULT_CACHE_TTL_SECS);
    Duration::from_secs(secs)
}

/// Detect all agent CLIs. Returns cached results unless `force_refresh` is true.
pub fn detect_agent_clis(force_refresh: bool) -> Vec<CliStatus> {
    {
        let guard = AGENT_CACHE.lock().unwrap();
        if let Some(ref cached) = *guard {
            if !force_refresh && cached.is_fresh() {
                return cached.value.clone();
            }
        }
    }

    let statuses: Vec<CliStatus> = AGENT_CLIS
        .iter()
        .map(|(kind, cmd)| detect_one_agent(kind, cmd))
        .collect();

    let ttl = cache_ttl();
    let mut guard = AGENT_CACHE.lock().unwrap();
    *guard = Some(CachedResult { value: statuses.clone(), cached_at: Instant::now(), ttl });
    statuses
}

fn detect_one_agent(kind: &str, cmd: &str) -> CliStatus {
    let label = agent_label(kind);
    let path = which::which(cmd).ok();
    let (installed, version, detail) = if let Some(p) = path {
        let version = run_version_check(cmd);
        let detail = version.as_deref().unwrap_or("installed").to_string();
        debug!(tool = kind, path = %p.display(), version = ?version, "agent CLI detected");
        (true, version, detail)
    } else {
        (false, None, "not installed".to_string())
    };
    CliStatus {
        tool_id: kind.to_string(),
        category: "agent".to_string(),
        label,
        installed,
        version,
        status_detail: detail,
    }
}

/// Detect GitHub CLI installation and authentication status.
pub fn detect_gh(force_refresh: bool) -> GhStatus {
    {
        let guard = GH_CACHE.lock().unwrap();
        if let Some(ref cached) = *guard {
            if !force_refresh && cached.is_fresh() {
                return cached.value.clone();
            }
        }
    }

    let status = detect_gh_inner();
    let ttl = cache_ttl();
    let mut guard = GH_CACHE.lock().unwrap();
    *guard = Some(CachedResult { value: status.clone(), cached_at: Instant::now(), ttl });
    status
}

fn detect_gh_inner() -> GhStatus {
    let installed = which::which("gh").is_ok();
    if !installed {
        return GhStatus {
            tool_id: "gh".to_string(),
            category: "vcs".to_string(),
            label: "GitHub CLI".to_string(),
            installed: false,
            version: None,
            authenticated: None,
            account: None,
            status_detail: "not installed".to_string(),
        };
    }

    let version = run_version_check("gh");

    // Check auth status: `gh auth status --hostname github.com`
    let auth_output = std::process::Command::new("gh")
        .args(["auth", "status"])
        .output()
        .ok();

    let (authenticated, account) = if let Some(out) = auth_output {
        let combined = String::from_utf8_lossy(&out.stdout).to_string()
            + &String::from_utf8_lossy(&out.stderr);
        let authed = out.status.success() || combined.to_lowercase().contains("logged in");
        let acct = extract_gh_account(&combined);
        (Some(authed), acct)
    } else {
        (None, None)
    };

    let detail = match authenticated {
        Some(true) => account.as_deref().map(|a| format!("authenticated as {a}")).unwrap_or_else(|| "authenticated".into()),
        Some(false) => "not authenticated".into(),
        None => "installed".into(),
    };

    GhStatus {
        tool_id: "gh".to_string(),
        category: "vcs".to_string(),
        label: "GitHub CLI".to_string(),
        installed: true,
        version,
        authenticated,
        account,
        status_detail: detail,
    }
}

/// Detect all supported tools and return a unified list sorted by category + id.
pub fn detect_all(force_refresh: bool) -> Vec<serde_json::Value> {
    let mut results: Vec<serde_json::Value> = detect_agent_clis(force_refresh)
        .into_iter()
        .map(|s| serde_json::to_value(s).unwrap_or_default())
        .collect();
    results.push(serde_json::to_value(detect_gh(force_refresh)).unwrap_or_default());

    results.sort_by(|a, b| {
        let cat_a = a["category"].as_str().unwrap_or("");
        let cat_b = b["category"].as_str().unwrap_or("");
        cat_a.cmp(cat_b).then_with(|| {
            let id_a = a["toolId"].as_str().unwrap_or("");
            let id_b = b["toolId"].as_str().unwrap_or("");
            id_a.cmp(id_b)
        })
    });
    results
}

// ── helpers ────────────────────────────────────────────────────────────────

fn run_version_check(cmd: &str) -> Option<String> {
    let output = Command::new(cmd).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    extract_semver(&text)
}

static SEMVER_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
    regex::Regex::new(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?").unwrap()
});

fn extract_semver(text: &str) -> Option<String> {
    SEMVER_RE.find(text).map(|m| m.as_str().to_string())
}

fn extract_gh_account(text: &str) -> Option<String> {
    // Look for lines like "Logged in to github.com account <user> ..."
    for line in text.lines() {
        let l = line.trim().to_lowercase();
        if l.contains("logged in") || l.contains("account") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // Find "account" keyword and take the next token.
            for (i, p) in parts.iter().enumerate() {
                if p.to_lowercase() == "account" {
                    if let Some(acct) = parts.get(i + 1) {
                        return Some(acct.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_').to_string());
                    }
                }
            }
        }
    }
    None
}

fn agent_label(kind: &str) -> String {
    match kind {
        "opencode" => "OpenCode",
        "codex" => "Codex CLI",
        "claude" => "Claude Code",
        "gemini" => "Gemini CLI",
        "pi" => "Pi CLI",
        "copilot" => "GitHub Copilot",
        "cursor-agent" => "Cursor Agent",
        _ => kind,
    }
    .to_string()
}
