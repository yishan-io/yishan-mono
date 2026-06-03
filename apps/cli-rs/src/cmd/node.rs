use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};
use dialoguer::Confirm;

#[derive(Subcommand)]
pub enum NodeCommands {
    /// List nodes
    List(NodeListArgs),
    /// Delete a node
    Delete(NodeDeleteArgs),
    /// Update node scope
    SetScope(NodeSetScopeArgs),
}

#[derive(Args)]
pub struct NodeListArgs {
    #[arg(long)]
    pub org_id: Option<String>,
}

#[derive(Args)]
pub struct NodeDeleteArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub node_id: String,
}

#[derive(Args)]
pub struct NodeSetScopeArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub node_id: String,
    #[arg(long)]
    pub scope: String,
    #[arg(long)]
    pub force: bool,
}

pub async fn run(cmd: NodeCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match cmd {
        NodeCommands::List(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.list_nodes(&org_id).await?;
            print_any(resp)
        }
        NodeCommands::Delete(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.delete_node(&org_id, &args.node_id).await?;
            print_any(resp)
        }
        NodeCommands::SetScope(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let scope = args.scope.trim();
            if scope != "private" && scope != "shared" {
                anyhow::bail!("--scope must be \"private\" or \"shared\"");
            }

            if !args.force {
                let warning = if scope == "shared" {
                    format!(
                        "Making node \"{}\" shared will allow all organization members to use it.",
                        args.node_id
                    )
                } else {
                    format!(
                        "Making node \"{}\" private will restrict access to the node owner only. Workspaces using this node may lose access.",
                        args.node_id
                    )
                };

                if atty::is(atty::Stream::Stdout) {
                    let confirmed = Confirm::new()
                        .with_prompt(format!("{} Proceed?", warning))
                        .default(false)
                        .interact()?;
                    if !confirmed {
                        println!("Aborted.");
                        return Ok(());
                    }
                } else {
                    anyhow::bail!("confirmation required: rerun with --force");
                }
            }

            let resp = client
                .update_node_scope(&org_id, &args.node_id, scope)
                .await?;
            print_any(resp)
        }
    }
}
