use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::builder::PossibleValuesParser;
use clap::{Args, Subcommand};
use serde_json::json;

#[derive(Subcommand)]
pub enum WorkspaceCommands {
    /// List workspaces
    List(WorkspaceListArgs),
    /// Create workspace
    Create(WorkspaceCreateArgs),
    /// Close workspace
    Close(WorkspaceCloseArgs),
    /// Find workspace by local path
    Find(WorkspaceFindArgs),
}

#[derive(Args)]
pub struct WorkspaceListArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: String,
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
    /// Local filesystem path to search by
    pub path: String,
}

pub async fn run(cmd: WorkspaceCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match cmd {
        WorkspaceCommands::List(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.list_workspaces(&org_id, &args.project_id).await?;
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
            let resp = client.find_workspace_by_path(&org_id, &args.path).await?;
            print_any(resp)
        }
    }
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
    let branch = args.branch.as_deref().map(str::trim).filter(|s| !s.is_empty());
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
            let branch = branch.ok_or_else(|| anyhow::anyhow!("branch is required for worktree workspaces"))?;
            let workspace_name = workspace_name
                .ok_or_else(|| anyhow::anyhow!("workspace name is required for worktree workspaces"))?;
            if project.repo_key.trim().is_empty() {
                anyhow::bail!("project {} is missing repo key", args.project_id);
            }
            if local_path.is_none() {
                local_path = Some(default_worktree_path(&project.repo_key, workspace_name)?);
            }
            if source_branch.is_none() {
                source_branch = resolve_default_source_branch(client, org_id, &args.project_id, &node_id).await?;
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
        .map_err(|error| anyhow::anyhow!("workspace {} created in api but local provisioning failed: {error}", resp.workspace.id))?;
    }

    Ok(resp)
}

fn resolve_workspace_node_id(args: &WorkspaceCreateArgs, runtime: &AppRuntime) -> anyhow::Result<String> {
    if let Some(node_id) = args.node_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
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
        .ok_or_else(|| anyhow::anyhow!("project {} not found in organization {}", project_id, org_id))
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
        .find(|workspace| workspace.kind == "primary" && workspace.node_id == node_id && !workspace.local_path.trim().is_empty())
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
    let source_path = resolve_worktree_source_path(runtime, org_id, project_id, node_id, project).await?;
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
