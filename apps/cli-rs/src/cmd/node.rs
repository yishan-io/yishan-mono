use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};

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
            let resp = client
                .update_node_scope(&org_id, &args.node_id, &args.scope)
                .await?;
            print_any(resp)
        }
    }
}
