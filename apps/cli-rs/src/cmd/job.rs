use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};

#[derive(Subcommand)]
pub enum JobCommands {
    /// Start a scheduled job run
    StartRun(JobStartRunArgs),
    /// Complete a scheduled job run
    CompleteRun(JobCompleteRunArgs),
}

#[derive(Args)]
pub struct JobStartRunArgs {
    #[arg(long)]
    pub node_id: String,
    #[arg(long)]
    pub run_id: String,
    #[arg(long)]
    pub started_at: Option<String>,
}

#[derive(Args)]
pub struct JobCompleteRunArgs {
    #[arg(long)]
    pub node_id: String,
    #[arg(long)]
    pub run_id: String,
    #[arg(long)]
    pub status: String,
    #[arg(long)]
    pub finished_at: Option<String>,
    #[arg(long)]
    pub response_body: Option<String>,
    #[arg(long)]
    pub error_code: Option<String>,
    #[arg(long)]
    pub error_message: Option<String>,
}

pub async fn run(cmd: JobCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match cmd {
        JobCommands::StartRun(args) => {
            let resp = client
                .start_scheduled_job_run(&args.node_id, &args.run_id, args.started_at.as_deref())
                .await?;
            print_any(resp)
        }
        JobCommands::CompleteRun(args) => {
            let resp = client
                .complete_scheduled_job_run(
                    &args.node_id,
                    &args.run_id,
                    &args.status,
                    args.finished_at.as_deref(),
                    args.response_body.as_deref(),
                    args.error_code.as_deref(),
                    args.error_message.as_deref(),
                    None,
                )
                .await?;
            print_any(resp)
        }
    }
}
