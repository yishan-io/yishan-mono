use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::Subcommand;

#[derive(Subcommand)]
pub enum SystemCommands {
    /// Check API health
    Health,
    /// Show authenticated user information
    Whoami,
}

pub async fn run(cmd: SystemCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    match cmd {
        SystemCommands::Health => {
            let client = runtime.api_client();
            let resp = client.health().await?;
            print_any(resp)
        }
        SystemCommands::Whoami => {
            let client = runtime.api_client();
            let resp = client.whoami().await?;
            print_any(resp)
        }
    }
}
