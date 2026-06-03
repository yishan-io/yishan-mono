use crate::daemon::rpc::DomainRpcError;
use crate::workspace::types::*;
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const BRANCH_CACHE_TTL: Duration = Duration::from_secs(30);
const BRANCH_PR_CACHE_TTL: Duration = Duration::from_secs(30);

struct BranchCacheEntry {
    data: GitBranchList,
    at: Instant,
}

struct BranchPrCacheEntry {
    data: GitBranchPullRequestStatus,
    at: Instant,
}

/// All git operations. Fixes A1: extracted from Go god-handler.
pub struct GitService {
    branch_cache: Mutex<HashMap<String, BranchCacheEntry>>,
    branch_pr_cache: Mutex<HashMap<String, BranchPrCacheEntry>>,
    // Lazily resolved `gh` binary path.
    gh_path: std::sync::OnceLock<Option<String>>,
}

impl GitService {
    pub fn new() -> Self {
        Self {
            branch_cache: Mutex::new(HashMap::new()),
            branch_pr_cache: Mutex::new(HashMap::new()),
            gh_path: std::sync::OnceLock::new(),
        }
    }

    fn run_git(&self, args: &[&str], cwd: &str) -> Result<String, DomainRpcError> {
        let out = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| DomainRpcError::server_error(format!("run git: {e}")))?;
        if !out.status.success() {
            return Err(DomainRpcError::server_error(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ));
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    fn gh_path(&self) -> Option<&str> {
        self.gh_path
            .get_or_init(|| which::which("gh").ok().map(|p| p.to_string_lossy().into_owned()))
            .as_deref()
    }

    fn run_gh(&self, args: &[&str], cwd: &str) -> Result<String, DomainRpcError> {
        let gh = self
            .gh_path()
            .ok_or_else(|| DomainRpcError::new(
                crate::daemon::constants::RPC_TOOL_UNAVAILABLE,
                "gh CLI is not installed or not in PATH",
            ))?;
        let out = Command::new(gh)
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| DomainRpcError::server_error(format!("run gh: {e}")))?;
        if !out.status.success() {
            return Err(DomainRpcError::server_error(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ));
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    pub fn status(&self, path: &str) -> Result<GitStatusResponse, DomainRpcError> {
        let branch = self
            .run_git(&["rev-parse", "--abbrev-ref", "HEAD"], path)
            .unwrap_or_else(|_| "HEAD".into());
        let raw = self.run_git(&["status", "--short"], path).unwrap_or_default();
        let files: Vec<String> = raw.lines().map(|l| l.to_string()).collect();
        Ok(GitStatusResponse { branch, files, raw })
    }

    pub fn inspect(&self, path: &str) -> Result<GitInspectResult, DomainRpcError> {
        let is_repo = Command::new("git")
            .args(["rev-parse", "--is-inside-work-tree"])
            .current_dir(path)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !is_repo {
            return Ok(GitInspectResult { is_git_repository: false, ..Default::default() });
        }
        let remote_url = self
            .run_git(&["remote", "get-url", "origin"], path)
            .unwrap_or_default();
        let current_branch = self
            .run_git(&["rev-parse", "--abbrev-ref", "HEAD"], path)
            .unwrap_or_default();
        Ok(GitInspectResult {
            is_git_repository: true,
            remote_url,
            current_branch,
        })
    }

    pub fn list_changes(&self, path: &str) -> Result<GitChangesBySection, DomainRpcError> {
        // `git status --porcelain=v1` gives XY status codes.
        let out = self.run_git(&["status", "--porcelain=v1"], path)?;
        let mut unstaged = Vec::new();
        let mut staged = Vec::new();
        let mut untracked = Vec::new();
        for line in out.lines() {
            if line.len() < 3 { continue; }
            let x = line.chars().next().unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let file = line[3..].to_string();
            if x == '?' && y == '?' {
                untracked.push(GitChange { path: file, kind: "untracked".into(), additions: 0, deletions: 0 });
            } else {
                if x != ' ' {
                    staged.push(GitChange { path: file.clone(), kind: status_kind(x), additions: 0, deletions: 0 });
                }
                if y != ' ' {
                    unstaged.push(GitChange { path: file, kind: status_kind(y), additions: 0, deletions: 0 });
                }
            }
        }
        Ok(GitChangesBySection { unstaged, staged, untracked })
    }

    pub fn track_changes(&self, path: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let mut args = vec!["add", "--"];
        let path_strs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend_from_slice(&path_strs);
        self.run_git(&args, path).map(|_| ())
    }

    pub fn unstage_changes(&self, path: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let mut args = vec!["reset", "HEAD", "--"];
        let path_strs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend_from_slice(&path_strs);
        self.run_git(&args, path).map(|_| ())
    }

    pub fn revert_changes(&self, path: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let mut args = vec!["checkout", "--"];
        let path_strs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend_from_slice(&path_strs);
        self.run_git(&args, path).map(|_| ())
    }

    pub fn commit_changes(
        &self,
        path: &str,
        message: &str,
        amend: bool,
        signoff: bool,
    ) -> Result<String, DomainRpcError> {
        let mut args = vec!["commit", "-m", message];
        if amend { args.push("--amend"); }
        if signoff { args.push("--signoff"); }
        self.run_git(&args, path)
    }

    pub fn branch_status(&self, path: &str) -> Result<GitBranchStatus, DomainRpcError> {
        let out = self
            .run_git(&["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], path)
            .unwrap_or_default();
        let parts: Vec<&str> = out.split_whitespace().collect();
        let has_upstream = !out.is_empty();
        let ahead_count = if parts.len() >= 2 {
            parts[1].parse().unwrap_or(0)
        } else {
            0
        };
        Ok(GitBranchStatus { has_upstream, ahead_count })
    }

    pub fn branch_pull_request(
        &self,
        path: &str,
        branch: &str,
    ) -> Result<GitBranchPullRequestStatus, DomainRpcError> {
        let cache_key = format!("{path}:{branch}");
        {
            let cache = self.branch_pr_cache.lock().unwrap();
            if let Some(entry) = cache.get(&cache_key) {
                if entry.at.elapsed() < BRANCH_PR_CACHE_TTL {
                    return Ok(entry.data.clone());
                }
            }
        }
        let result = self.fetch_branch_pr(path, branch)?;
        self.branch_pr_cache.lock().unwrap().insert(
            cache_key,
            BranchPrCacheEntry { data: result.clone(), at: Instant::now() },
        );
        Ok(result)
    }

    fn fetch_branch_pr(
        &self,
        path: &str,
        branch: &str,
    ) -> Result<GitBranchPullRequestStatus, DomainRpcError> {
        let json = self.run_gh(
            &[
                "pr",
                "view",
                branch,
                "--json",
                "number,title,url,state,reviewDecision,isDraft,mergedAt,headRefName,baseRefName,statusCheckRollup,latestReviews",
            ],
            path,
        );
        match json {
            Err(_) => Ok(GitBranchPullRequestStatus {
                found: false,
                branch: branch.to_string(),
                ..Default::default()
            }),
            Ok(raw) => {
                let v: serde_json::Value = serde_json::from_str(&raw)
                    .map_err(|e| DomainRpcError::server_error(format!("parse gh output: {e}")))?;
                Ok(GitBranchPullRequestStatus {
                    found: true,
                    branch: branch.to_string(),
                    number: v["number"].as_i64().unwrap_or(0),
                    title: v["title"].as_str().unwrap_or("").to_string(),
                    url: v["url"].as_str().unwrap_or("").to_string(),
                    state: v["state"].as_str().unwrap_or("").to_string(),
                    review_decision: v["reviewDecision"].as_str().unwrap_or("").to_string(),
                    is_draft: v["isDraft"].as_bool().unwrap_or(false),
                    merged_at: v["mergedAt"].as_str().unwrap_or("").to_string(),
                    head_ref_name: v["headRefName"].as_str().unwrap_or("").to_string(),
                    base_ref_name: v["baseRefName"].as_str().unwrap_or("").to_string(),
                    ..Default::default()
                })
            }
        }
    }

    pub fn current_branch(&self, path: &str) -> Result<String, DomainRpcError> {
        self.run_git(&["rev-parse", "--abbrev-ref", "HEAD"], path)
    }

    pub fn list_commits_to_target(
        &self,
        path: &str,
        target: &str,
    ) -> Result<GitCommitComparison, DomainRpcError> {
        let current = self.current_branch(path)?;
        let range = format!("{target}..HEAD");
        let out = self.run_git(
            &["log", &range, "--pretty=format:%H %h %an %aI %s", "--name-only"],
            path,
        )?;
        let mut commits: Vec<GitCommit> = Vec::new();
        let mut all_changed: Vec<String> = Vec::new();
        let mut current_commit: Option<GitCommit> = None;
        for line in out.lines() {
            if line.is_empty() {
                if let Some(c) = current_commit.take() {
                    commits.push(c);
                }
                continue;
            }
            if line.starts_with(|c: char| c.is_ascii_hexdigit()) && line.contains(' ') {
                if let Some(c) = current_commit.take() {
                    commits.push(c);
                }
                let mut parts = line.splitn(5, ' ');
                let hash = parts.next().unwrap_or("").to_string();
                let short_hash = parts.next().unwrap_or("").to_string();
                let author_name = parts.next().unwrap_or("").to_string();
                let committed_at = parts.next().unwrap_or("").to_string();
                let subject = parts.next().unwrap_or("").to_string();
                current_commit = Some(GitCommit {
                    hash, short_hash, author_name, committed_at, subject,
                    changed_files: Vec::new(),
                });
            } else if let Some(ref mut c) = current_commit {
                c.changed_files.push(line.to_string());
                if !all_changed.contains(&line.to_string()) {
                    all_changed.push(line.to_string());
                }
            }
        }
        if let Some(c) = current_commit {
            commits.push(c);
        }
        Ok(GitCommitComparison {
            current_branch: current,
            target_branch: target.to_string(),
            all_changed_files: all_changed,
            commits,
        })
    }

    pub fn branch_diff_summary(
        &self,
        path: &str,
        target: &str,
    ) -> Result<GitBranchDiffSummary, DomainRpcError> {
        let range = format!("{target}...HEAD");
        let out = self.run_git(&["diff", "--stat", &range], path)?;
        let mut additions = 0i64;
        let mut deletions = 0i64;
        let mut files: Vec<String> = Vec::new();
        for line in out.lines() {
            if line.contains('+') || line.contains('-') {
                let file = line.split('|').next().unwrap_or("").trim().to_string();
                if !file.is_empty() {
                    files.push(file);
                }
                // Parse `+n -m` from summary line.
                if let Some(stats) = line.split('|').nth(1) {
                    for token in stats.split_whitespace() {
                        if token.starts_with('+') {
                            additions += token.chars().filter(|&c| c == '+').count() as i64;
                        }
                        if token.starts_with('-') {
                            deletions += token.chars().filter(|&c| c == '-').count() as i64;
                        }
                    }
                }
            }
        }
        Ok(GitBranchDiffSummary {
            file_count: files.len() as i64,
            additions,
            deletions,
            files,
        })
    }

    pub fn read_commit_diff(
        &self,
        path: &str,
        commit_hash: &str,
        file_path: &str,
    ) -> Result<GitDiffContent, DomainRpcError> {
        let old_content = self
            .run_git(&["show", &format!("{commit_hash}^:{file_path}")], path)
            .unwrap_or_default();
        let new_content = self
            .run_git(&["show", &format!("{commit_hash}:{file_path}")], path)
            .unwrap_or_default();
        Ok(GitDiffContent { old_content, new_content })
    }

    pub fn read_branch_comparison_diff(
        &self,
        path: &str,
        target: &str,
        file_path: &str,
    ) -> Result<GitDiffContent, DomainRpcError> {
        let old_content = self
            .run_git(&["show", &format!("{target}:{file_path}")], path)
            .unwrap_or_default();
        let new_content = std::fs::read_to_string(std::path::Path::new(path).join(file_path))
            .unwrap_or_default();
        Ok(GitDiffContent { old_content, new_content })
    }

    pub fn list_branches(&self, path: &str) -> Result<GitBranchList, DomainRpcError> {
        let cache_key = path.to_string();
        {
            let cache = self.branch_cache.lock().unwrap();
            if let Some(entry) = cache.get(&cache_key) {
                if entry.at.elapsed() < BRANCH_CACHE_TTL {
                    return Ok(entry.data.clone());
                }
            }
        }
        let current = self.current_branch(path).unwrap_or_default();
        let local_out = self.run_git(&["branch", "--format=%(refname:short)"], path)?;
        let local: Vec<String> = local_out.lines().map(|l| l.to_string()).collect();
        let remote_out = self
            .run_git(&["branch", "-r", "--format=%(refname:short)"], path)
            .unwrap_or_default();
        let remote: Vec<String> = remote_out.lines().map(|l| l.to_string()).collect();
        let mut branches = local.clone();
        for r in &remote {
            if !branches.contains(r) {
                branches.push(r.clone());
            }
        }
        let result = GitBranchList {
            current_branch: current,
            branches,
            local_branches: local,
            remote_branches: remote,
            worktree_branches: Vec::new(),
        };
        self.branch_cache.lock().unwrap().insert(
            cache_key,
            BranchCacheEntry { data: result.clone(), at: Instant::now() },
        );
        Ok(result)
    }

    pub fn push_branch(&self, path: &str) -> Result<String, DomainRpcError> {
        self.run_git(&["push"], path)
    }

    pub fn publish_branch(&self, path: &str) -> Result<String, DomainRpcError> {
        let branch = self.current_branch(path)?;
        self.run_git(&["push", "-u", "origin", &branch], path)
    }

    pub fn rename_branch(&self, path: &str, next_branch: &str) -> Result<(), DomainRpcError> {
        self.run_git(&["branch", "-m", next_branch], path).map(|_| ())
    }

    pub fn remove_branch(&self, path: &str, branch: &str, force: bool) -> Result<(), DomainRpcError> {
        let flag = if force { "-D" } else { "-d" };
        self.run_git(&["branch", flag, branch], path).map(|_| ())
    }

    pub fn merge_pull_request(
        &self,
        path: &str,
        pr_number: i64,
        method: &str,
        delete_branch: bool,
    ) -> Result<String, DomainRpcError> {
        let pr = pr_number.to_string();
        let mut args = vec!["pr", "merge", &pr, "--auto"];
        match method {
            "squash" => args.push("--squash"),
            "rebase" => args.push("--rebase"),
            _ => args.push("--merge"),
        }
        if delete_branch { args.push("--delete-branch"); }
        self.run_gh(&args, path)
    }

    pub fn close_pull_request(&self, path: &str, pr_number: i64) -> Result<String, DomainRpcError> {
        let pr = pr_number.to_string();
        self.run_gh(&["pr", "close", &pr], path)
    }

    pub fn create_worktree(
        &self,
        path: &str,
        branch: &str,
        worktree_path: &str,
        create_branch: bool,
        from_ref: &str,
    ) -> Result<(), DomainRpcError> {
        let mut args = vec!["worktree", "add"];
        if create_branch { args.push("-b"); args.push(branch); }
        args.push(worktree_path);
        if !from_ref.is_empty() { args.push(from_ref); } else if !create_branch { args.push(branch); }
        self.run_git(&args, path).map(|_| ())
    }

    pub fn main_worktree_path(&self, path: &str) -> Result<String, DomainRpcError> {
        // `git worktree list --porcelain` — first entry is main worktree.
        let out = self.run_git(&["worktree", "list", "--porcelain"], path)?;
        for line in out.lines() {
            if let Some(rest) = line.strip_prefix("worktree ") {
                return Ok(rest.trim().to_string());
            }
        }
        Ok(path.to_string())
    }

    pub fn remove_worktree(&self, main_path: &str, worktree_path: &str, force: bool) -> Result<(), DomainRpcError> {
        let flag = if force { "--force" } else { "" };
        let mut args = vec!["worktree", "remove"];
        if force { args.push(flag); }
        args.push(worktree_path);
        self.run_git(&args, main_path).map(|_| ())
    }

    pub fn author_name(&self, path: &str) -> Result<String, DomainRpcError> {
        self.run_git(&["config", "user.name"], path)
    }
}

impl Default for GitService {
    fn default() -> Self { Self::new() }
}

fn status_kind(c: char) -> String {
    match c {
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'U' => "unmerged",
        _ => "modified",
    }
    .to_string()
}
