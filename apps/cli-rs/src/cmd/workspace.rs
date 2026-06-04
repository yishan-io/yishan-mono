use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::builder::PossibleValuesParser;
use clap::{Args, Subcommand};
use serde_json::json;
use std::path::Path;

#[derive(Subcommand)]
pub enum WorkspaceCommands {
    /// List workspaces
    List(WorkspaceListArgs),
    /// Create workspace
    Create(WorkspaceCreateArgs),
    /// Close workspace
    Close(WorkspaceCloseArgs),
    /// Find workspace by project and workspace ID
    Find(WorkspaceFindArgs),
    /// Find workspace by local path
    #[command(name = "find-path", hide = true)]
    FindPath(WorkspaceFindPathArgs),
}

#[derive(Args)]
pub struct WorkspaceListArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: Option<String>,
}

#[derive(Args)]
pub struct WorkspaceCreateArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: String,
    #[arg(long)]
    pub node_id: Option<String>,
    #[arg(long)]
    pub local_path: Option<String>,
    #[arg(long, default_value = "primary", value_parser = PossibleValuesParser::new(["primary", "worktree"]))]
    pub kind: String,
    #[arg(long)]
    pub branch: Option<String>,
    #[arg(long)]
    pub source_branch: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
    #[arg(long)]
    pub id: Option<String>,
}

#[derive(Args)]
pub struct WorkspaceCloseArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: String,
    #[arg(long)]
    pub workspace_id: String,
}

#[derive(Args)]
pub struct WorkspaceFindArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: String,
    #[arg(long)]
    pub workspace_id: String,
}

#[derive(Args)]
pub struct WorkspaceFindPathArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    /// Local filesystem path to search by
    pub path: String,
}

pub async fn run(cmd: WorkspaceCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match cmd {
        WorkspaceCommands::List(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = list_workspaces(&client, &org_id, args.project_id.as_deref()).await?;
            print_any(resp)
        }
        WorkspaceCommands::Create(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = create_workspace(&client, runtime, &org_id, args).await?;
            print_any(resp)
        }
        WorkspaceCommands::Close(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client
                .close_workspace(&org_id, &args.project_id, &args.workspace_id)
                .await?;
            print_any(resp)
        }
        WorkspaceCommands::Find(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp =
                find_workspace(&client, &org_id, &args.project_id, &args.workspace_id).await?;
            print_any(resp)
        }
        WorkspaceCommands::FindPath(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.find_workspace_by_path(&org_id, &args.path).await?;
            print_any(resp)
        }
    }
}

async fn list_workspaces(
    client: &crate::api::ApiClient,
    org_id: &str,
    project_id: Option<&str>,
) -> anyhow::Result<crate::api::ListWorkspacesResponse> {
    if let Some(project_id) = project_id.map(str::trim).filter(|s| !s.is_empty()) {
        return client.list_workspaces(org_id, project_id).await;
    }

    let projects = client.list_projects(org_id).await?;
    let mut workspaces = Vec::new();
    for project in projects.projects {
        let response = client.list_workspaces(org_id, &project.id).await?;
        workspaces.extend(response.workspaces);
    }

    Ok(crate::api::ListWorkspacesResponse { workspaces })
}

async fn find_workspace(
    client: &crate::api::ApiClient,
    org_id: &str,
    project_id: &str,
    workspace_id: &str,
) -> anyhow::Result<serde_json::Value> {
    let response = client.list_workspaces(org_id, project_id).await?;
    let workspace = response
        .workspaces
        .into_iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "workspace {} was not found in project {}; run `yishan workspace list --project-id {}` to find a valid id",
                workspace_id,
                project_id,
                project_id
            )
        })?;

    Ok(json!({
        "workspace": workspace,
        "organizationId": org_id,
        "projectId": project_id,
    }))
}

async fn create_workspace(
    client: &crate::api::ApiClient,
    runtime: &AppRuntime,
    org_id: &str,
    args: WorkspaceCreateArgs,
) -> anyhow::Result<crate::api::CreateWorkspaceResponse> {
    let node_id = resolve_workspace_node_id(&args, runtime)?;
    let project = resolve_project(client, org_id, &args.project_id).await?;

    let kind = args.kind.trim();
    let branch = args
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let workspace_name = args
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or(branch);

    let mut local_path = args
        .local_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let mut source_branch = args
        .source_branch
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    match kind {
        "primary" => {
            if local_path.is_none() {
                anyhow::bail!("local-path is required for primary workspaces");
            }
        }
        "worktree" => {
            let branch = branch
                .ok_or_else(|| anyhow::anyhow!("branch is required for worktree workspaces"))?;
            let workspace_name = workspace_name.ok_or_else(|| {
                anyhow::anyhow!("workspace name is required for worktree workspaces")
            })?;
            if project.repo_key.trim().is_empty() {
                anyhow::bail!("project {} is missing repo key", args.project_id);
            }
            if local_path.is_none() {
                local_path = Some(default_worktree_path(&project.repo_key, workspace_name)?);
            }
            if source_branch.is_none() {
                source_branch =
                    resolve_default_source_branch(client, org_id, &args.project_id, &node_id)
                        .await?;
            }
            if source_branch.is_none() {
                anyhow::bail!("source-branch is required for worktree workspaces");
            }
            let _ = branch;
        }
        _ => anyhow::bail!("invalid kind {:?}: expected primary or worktree", kind),
    }

    let resp = client
        .create_workspace(
            org_id,
            &args.project_id,
            args.id.as_deref(),
            &node_id,
            local_path.as_deref().unwrap_or(""),
            kind,
            branch,
            source_branch.as_deref(),
        )
        .await?;

    if resp.workspace.id.trim().is_empty() {
        anyhow::bail!("created workspace response is missing workspace id");
    }

    if resp.workspace.kind == "worktree" {
        provision_worktree_locally(
            runtime,
            org_id,
            &args.project_id,
            &node_id,
            &project,
            &resp.workspace,
            source_branch.as_deref().unwrap_or(""),
            workspace_name.unwrap_or(resp.workspace.branch.as_str()),
        )
        .await
        .map_err(|error| {
            anyhow::anyhow!(
                "workspace {} created in api but local provisioning failed: {error}",
                resp.workspace.id
            )
        })?;
    }

    Ok(resp)
}

fn resolve_workspace_node_id(
    args: &WorkspaceCreateArgs,
    runtime: &AppRuntime,
) -> anyhow::Result<String> {
    if let Some(node_id) = args
        .node_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Ok(node_id.to_string());
    }
    crate::daemon::ensure_daemon_id(&runtime.config().config_path)
}

async fn resolve_project(
    client: &crate::api::ApiClient,
    org_id: &str,
    project_id: &str,
) -> anyhow::Result<crate::api::Project> {
    let response = client.list_projects(org_id).await?;
    response
        .projects
        .into_iter()
        .find(|project| project.id == project_id)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "project {} not found in organization {}",
                project_id,
                org_id
            )
        })
}

async fn resolve_default_source_branch(
    client: &crate::api::ApiClient,
    org_id: &str,
    project_id: &str,
    node_id: &str,
) -> anyhow::Result<Option<String>> {
    let response = client.list_workspaces(org_id, project_id).await?;
    Ok(response
        .workspaces
        .into_iter()
        .find(|workspace| {
            workspace.kind == "primary"
                && workspace.node_id == node_id
                && !workspace.local_path.trim().is_empty()
        })
        .and_then(|workspace| {
            let branch = workspace.branch.trim();
            if branch.is_empty() {
                None
            } else {
                Some(branch.to_string())
            }
        }))
}

fn default_worktree_path(repo_key: &str, workspace_name: &str) -> anyhow::Result<String> {
    let home = crate::config::home_dir()?;
    Ok(home
        .join("worktrees")
        .join(repo_key.trim())
        .join(workspace_name.trim())
        .to_string_lossy()
        .into_owned())
}

async fn provision_worktree_locally(
    runtime: &AppRuntime,
    org_id: &str,
    project_id: &str,
    node_id: &str,
    project: &crate::api::Project,
    workspace: &crate::api::Workspace,
    source_branch: &str,
    workspace_name: &str,
) -> anyhow::Result<()> {
    let source_path =
        resolve_worktree_source_path(runtime, org_id, project_id, node_id, project).await?;
    let rpc = crate::daemon::rpc_client(runtime)?;
    rpc.call(
        "workspace.create",
        json!({
            "id": workspace.id,
            "organizationId": org_id,
            "projectId": project_id,
            "repoKey": project.repo_key,
            "workspaceName": workspace_name,
            "sourcePath": source_path,
            "targetBranch": workspace.branch,
            "sourceBranch": source_branch,
            "contextEnabled": project.context_enabled,
            "setupHook": project.setup_script,
        }),
    )
    .await?;
    Ok(())
}

async fn resolve_worktree_source_path(
    runtime: &AppRuntime,
    org_id: &str,
    project_id: &str,
    node_id: &str,
    project: &crate::api::Project,
) -> anyhow::Result<String> {
    if !project.local_path.trim().is_empty() {
        return Ok(project.local_path.trim().to_string());
    }

    if !project.repo_url.trim().is_empty() {
        if project.repo_key.trim().is_empty() {
            anyhow::bail!("project {} is missing repo key", project_id);
        }
        let repo_path = default_repo_path(&project.repo_key)?;
        ensure_bare_repo_clone(&project.repo_url, &repo_path).await?;
        return Ok(repo_path);
    }

    let client = runtime.api_client();
    let response = client.list_workspaces(org_id, project_id).await?;
    response
        .workspaces
        .into_iter()
        .find(|workspace| {
            workspace.kind == "primary"
                && workspace.node_id == node_id
                && !workspace.local_path.trim().is_empty()
        })
        .map(|workspace| workspace.local_path)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "no primary workspace found on node {} for project {}; create one first",
                node_id,
                project_id
            )
        })
}

fn default_repo_path(repo_key: &str) -> anyhow::Result<String> {
    let home = crate::config::home_dir()?;
    Ok(home
        .join("repos")
        .join(repo_key.trim())
        .to_string_lossy()
        .into_owned())
}

async fn ensure_bare_repo_clone(repo_url: &str, repo_path: &str) -> anyhow::Result<()> {
    let repo_url = repo_url.trim().to_string();
    let repo_path = repo_path.trim().to_string();
    let parent_dir = Path::new(&repo_path)
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("repo path is missing a parent directory: {}", repo_path))?;

    if let Ok(metadata) = std::fs::metadata(&repo_path) {
        if !metadata.is_dir() {
            anyhow::bail!("repo path exists and is not a directory: {}", repo_path);
        }
        return update_git_repo(&repo_path).await;
    }

    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        std::fs::create_dir_all(&parent_dir)?;
        let output = std::process::Command::new("git")
            .args(["clone", "--bare", &repo_url, &repo_path])
            .output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let message = if !stderr.is_empty() { stderr } else { stdout };
            anyhow::bail!("clone bare repo ({}): git clone failed", message);
        }
        Ok(())
    })
    .await
    .map_err(|error| anyhow::anyhow!("clone bare repo task failed: {error}"))??;

    Ok(())
}

async fn update_git_repo(repo_path: &str) -> anyhow::Result<()> {
    let repo_path = repo_path.trim().to_string();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let remote_output = std::process::Command::new("git")
            .args(["-C", &repo_path, "remote"])
            .output()?;
        if !remote_output.status.success() {
            let stderr = String::from_utf8_lossy(&remote_output.stderr)
                .trim()
                .to_string();
            anyhow::bail!("list git remotes ({}): git remote failed", stderr);
        }
        if String::from_utf8_lossy(&remote_output.stdout)
            .trim()
            .is_empty()
        {
            return Ok(());
        }

        let fetch_output = std::process::Command::new("git")
            .args(["-C", &repo_path, "fetch", "--all", "--prune"])
            .output()?;
        if !fetch_output.status.success() {
            let stderr = String::from_utf8_lossy(&fetch_output.stderr)
                .trim()
                .to_string();
            let stdout = String::from_utf8_lossy(&fetch_output.stdout)
                .trim()
                .to_string();
            let message = if !stderr.is_empty() { stderr } else { stdout };
            anyhow::bail!("fetch git repo ({}): git fetch failed", message);
        }
        Ok(())
    })
    .await
    .map_err(|error| anyhow::anyhow!("update git repo task failed: {error}"))??;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_worktree_path_uses_yishan_worktrees_root() {
        let path = default_worktree_path("owner/repo", "feature-branch").unwrap();
        assert!(
            path.ends_with("/.yishan/worktrees/owner/repo/feature-branch")
                || path.ends_with("\\.yishan\\worktrees\\owner/repo\\feature-branch")
                || path.ends_with("\\.yishan\\worktrees\\owner\\repo\\feature-branch")
        );
    }

    #[test]
    fn default_repo_path_uses_yishan_repos_root() {
        let path = default_repo_path("owner/repo").unwrap();
        assert!(
            path.ends_with("/.yishan/repos/owner/repo")
                || path.ends_with("\\.yishan\\repos\\owner/repo")
                || path.ends_with("\\.yishan\\repos\\owner\\repo")
        );
    }
}
