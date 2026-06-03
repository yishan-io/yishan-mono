mod auth;
mod daemon;
mod job;
mod login;
mod logout;
mod node;
mod org;
mod project;
mod self_update;
mod system;
mod terminal;
mod version;
mod workspace;

use crate::config;
use crate::error::CliError;
use crate::output::set_format;
use crate::runtime::AppRuntime;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// Root CLI definition.
#[derive(Parser)]
#[command(
    name = "yishan",
    about = "Yishan CLI — local developer workflow tool",
    version = crate::buildinfo::VERSION,
    propagate_version = true,
)]
pub struct Cli {
    /// Config file path (default: ~/.yishan/profiles/<profile>/credential.yaml)
    #[arg(long, global = true)]
    pub config: Option<PathBuf>,

    /// Runtime profile name
    #[arg(long, global = true, default_value = "default", env = "YISHAN_PROFILE")]
    pub profile: String,

    /// Log level (debug, info, warn, error)
    #[arg(long, global = true, env = "YISHAN_LOG_LEVEL")]
    pub log_level: Option<String>,

    /// Log format (pretty, json)
    #[arg(long, global = true, env = "YISHAN_LOG_FORMAT")]
    pub log_format: Option<String>,

    /// Output format (default, json)
    #[arg(
        long = "output",
        short = 'o',
        global = true,
        default_value = "default",
        env = "YISHAN_OUTPUT"
    )]
    pub output: String,

    /// API service base URL
    #[arg(
        long,
        global = true,
        default_value = "https://api.yishan.io",
        env = "YISHAN_API_BASE_URL"
    )]
    pub api_base_url: String,

    /// API access token (Bearer)
    #[arg(long, global = true, env = "YISHAN_API_TOKEN")]
    pub api_token: Option<String>,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Login via OAuth browser flow or service token
    Login(login::LoginArgs),
    /// Logout and revoke tokens
    Logout(logout::LogoutArgs),
    /// Auth management (service tokens, refresh)
    Auth(auth::AuthArgs),
    /// Show version information
    Version(version::VersionArgs),
    /// System utilities (health, whoami)
    #[command(subcommand)]
    System(system::SystemCommands),
    /// Organization management
    #[command(subcommand)]
    Org(org::OrgCommands),
    /// Project management
    #[command(subcommand)]
    Project(project::ProjectCommands),
    /// Node management
    #[command(subcommand)]
    Node(node::NodeCommands),
    /// Workspace management
    #[command(subcommand)]
    Workspace(workspace::WorkspaceCommands),
    /// Terminal management
    #[command(subcommand)]
    Terminal(terminal::TerminalCommands),
    /// Job management
    #[command(subcommand)]
    Job(job::JobCommands),
    /// Daemon management
    #[command(subcommand)]
    Daemon(daemon::DaemonCommands),
    /// Update the CLI to the latest (or specified) version
    #[command(name = "self-update")]
    SelfUpdate(self_update::SelfUpdateArgs),
    /// Show authenticated user information (alias for `system whoami`)
    #[command(hide = true)]
    Whoami,
    /// Check API health (alias for `system health`)
    #[command(hide = true)]
    Health,
}

/// Entry point: parse CLI args, initialise config/runtime, dispatch.
pub fn run() -> Result<(), CliError> {
    let cli = Cli::parse();

    // Configure output format first so error printing works correctly.
    set_format(&cli.output).map_err(|e| CliError::Other(anyhow::anyhow!(e)))?;

    // Initialise async runtime for all async work.
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("build tokio runtime");

    rt.block_on(async { dispatch(cli).await })
}

async fn dispatch(cli: Cli) -> Result<(), CliError> {
    // Resolve config path.
    let config_path = config::resolve_config_path(cli.config.as_deref(), &cli.profile)
        .map_err(|e| CliError::Other(e))?;

    // Load config (missing file = fresh install, not an error).
    let app_config = config::load(
        &config_path,
        cli.log_level.as_deref().unwrap_or(""),
        cli.log_format.as_deref().unwrap_or(""),
        &cli.api_base_url,
        cli.api_token.as_deref().unwrap_or(""),
    )
    .map_err(|e| CliError::Other(e))?;

    // Initialise tracing subscriber.
    init_tracing(&app_config.log_level, &app_config.log_format);

    let runtime = AppRuntime::new(app_config);

    let Some(cmd) = cli.command else {
        // bare `yishan` — print help (clap handles this via PrintHelp, but we reach here
        // only when a command is defined as optional).
        Cli::parse_from(["yishan", "--help"]);
        return Ok(());
    };

    match cmd {
        Commands::Login(args) => login::run(args, &runtime).await,
        Commands::Logout(args) => logout::run(args, &runtime).await,
        Commands::Auth(args) => auth::run(args, &runtime).await,
        Commands::Version(args) => version::run(args),
        Commands::System(sub) => system::run(sub, &runtime).await,
        Commands::Org(sub) => org::run(sub, &runtime).await,
        Commands::Project(sub) => project::run(sub, &runtime).await,
        Commands::Node(sub) => node::run(sub, &runtime).await,
        Commands::Workspace(sub) => workspace::run(sub, &runtime).await,
        Commands::Terminal(sub) => terminal::run(sub, &runtime).await,
        Commands::Job(sub) => job::run(sub, &runtime).await,
        Commands::Daemon(sub) => daemon::run(sub, &runtime).await,
        Commands::SelfUpdate(args) => self_update::run(args, &runtime).await,
        Commands::Whoami => system::run(system::SystemCommands::Whoami, &runtime).await,
        Commands::Health => system::run(system::SystemCommands::Health, &runtime).await,
    }
    .map_err(|e| CliError::Other(e))
}

fn init_tracing(level: &str, format: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_new(level).unwrap_or_else(|_| EnvFilter::new("info"));

    if format == "json" {
        fmt()
            .json()
            .with_env_filter(filter)
            .with_writer(std::io::stderr)
            .init();
    } else {
        fmt()
            .with_env_filter(filter)
            .with_writer(std::io::stderr)
            .init();
    }
}

/// Resolve org ID from flag or in-memory runtime config.
pub fn resolve_org_id(flag_org_id: Option<&str>, runtime: &AppRuntime) -> anyhow::Result<String> {
    if let Some(id) = flag_org_id.filter(|s| !s.is_empty()) {
        return Ok(id.to_string());
    }
    let cfg = runtime.config();
    if !cfg.current_org_id.is_empty() {
        return Ok(cfg.current_org_id);
    }
    anyhow::bail!("org-id is required: use --org-id <org-id> or run `yishan org use <org-id>`")
}
