use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};

/// Terminal commands proxy to the daemon JSON-RPC over WebSocket.
#[derive(Subcommand)]
pub enum TerminalCommands {
    /// List terminal sessions for a workspace
    List(TerminalListArgs),
    /// Start a terminal session
    Start(TerminalStartArgs),
    /// Stop a terminal session
    Stop(TerminalStopArgs),
    /// List detected ports for a terminal session
    Ports(TerminalPortsArgs),
}

#[derive(Args)]
pub struct TerminalListArgs {
    #[arg(long)]
    pub workspace_id: String,
}

#[derive(Args)]
pub struct TerminalStartArgs {
    #[arg(long)]
    pub workspace_id: String,
    #[arg(long)]
    pub command: Option<String>,
}

#[derive(Args)]
pub struct TerminalStopArgs {
    #[arg(long)]
    pub workspace_id: String,
    #[arg(long)]
    pub terminal_id: String,
}

#[derive(Args)]
pub struct TerminalPortsArgs {
    #[arg(long)]
    pub workspace_id: String,
    #[arg(long)]
    pub terminal_id: String,
}

pub async fn run(cmd: TerminalCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = crate::daemon::rpc_client(runtime)?;
    match cmd {
        TerminalCommands::List(args) => {
            let resp = client
                .call("terminal.list", serde_json::json!({ "workspaceId": args.workspace_id }))
                .await?;
            print_any(resp)
        }
        TerminalCommands::Start(args) => {
            let mut params = serde_json::json!({ "workspaceId": args.workspace_id });
            if let Some(cmd) = args.command {
                params["command"] = serde_json::json!(cmd);
            }
            let resp = client.call("terminal.start", params).await?;
            print_any(resp)
        }
        TerminalCommands::Stop(args) => {
            let resp = client
                .call(
                    "terminal.stop",
                    serde_json::json!({
                        "workspaceId": args.workspace_id,
                        "terminalId": args.terminal_id,
                    }),
                )
                .await?;
            print_any(resp)
        }
        TerminalCommands::Ports(args) => {
            let resp = client
                .call(
                    "terminal.ports",
                    serde_json::json!({
                        "workspaceId": args.workspace_id,
                        "terminalId": args.terminal_id,
                    }),
                )
                .await?;
            print_any(resp)
        }
    }
}
