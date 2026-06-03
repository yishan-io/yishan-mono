use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};

#[derive(Subcommand)]
pub enum ProjectCommands {
    /// List projects
    List(ProjectListArgs),
    /// Create project
    Create(ProjectCreateArgs),
    /// Delete project
    Delete(ProjectDeleteArgs),
}

#[derive(Args)]
pub struct ProjectListArgs {
    #[arg(long)]
    pub org_id: Option<String>,
}

#[derive(Args)]
pub struct ProjectCreateArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub repo_url: Option<String>,
    #[arg(long)]
    pub node_id: Option<String>,
    #[arg(long)]
    pub local_path: Option<String>,
}

#[derive(Args)]
pub struct ProjectDeleteArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub project_id: String,
}

pub async fn run(cmd: ProjectCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match cmd {
        ProjectCommands::List(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.list_projects(&org_id).await?;
            print_any(resp)
        }
        ProjectCommands::Create(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client
                .create_project(
                    &org_id,
                    &args.name,
                    None,
                    args.repo_url.as_deref(),
                    args.node_id.as_deref(),
                    args.local_path.as_deref(),
                )
                .await?;
            print_any(resp)
        }
        ProjectCommands::Delete(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.delete_project(&org_id, &args.project_id).await?;
            print_any(resp)
        }
    }
}
