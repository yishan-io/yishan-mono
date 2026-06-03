use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};

#[derive(Subcommand)]
pub enum WorkspaceCommands {
    /// List workspaces
    List(WorkspaceListArgs),
    /// Create workspace
    Create(WorkspaceCreateArgs),
    /// Close workspace
    Close(WorkspaceCloseArgs),
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
    pub node_id: String,
    #[arg(long)]
    pub local_path: String,
    #[arg(long, default_value = "git")]
    pub kind: String,
    #[arg(long)]
    pub branch: Option<String>,
    #[arg(long)]
    pub source_branch: Option<String>,
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
            let resp = client
                .create_workspace(
                    &org_id,
                    &args.project_id,
                    args.id.as_deref(),
                    &args.node_id,
                    &args.local_path,
                    &args.kind,
                    args.branch.as_deref(),
                    args.source_branch.as_deref(),
                )
                .await?;
            print_any(resp)
        }
        WorkspaceCommands::Close(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client
                .close_workspace(&org_id, &args.project_id, &args.workspace_id)
                .await?;
            print_any(resp)
        }
    }
}
