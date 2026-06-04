use crate::daemon::process::{
    restart, start_detached, stop, wait_for_ready, RunConfig, StartConfig,
};
use crate::output::print_any;
use crate::runtime::AppRuntime;
use anyhow::Context;
use clap::{Args, Subcommand};
use serde_json::json;
use std::time::Duration;

/// Daemon management commands.
/// Note: bare `yishan daemon` shows help (not a silent start). See U5 fix.
#[derive(Subcommand)]
pub enum DaemonCommands {
    /// Start daemon in background (idempotent)
    Start(DaemonStartArgs),
    /// Run daemon in foreground (useful for debugging)
    Run(DaemonRunArgs),
    /// Stop running daemon
    Stop,
    /// Restart daemon
    Restart,
    /// Show daemon status
    Status,
    /// Tail daemon log file
    Logs(DaemonLogsArgs),
}

#[derive(Args)]
pub struct DaemonStartArgs {
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = "0")]
    pub port: u16,
    #[arg(long, default_value = "false")]
    pub relay_enabled: bool,
    #[arg(long, default_value = "")]
    pub relay_url: String,
}

#[derive(Args)]
pub struct DaemonRunArgs {
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = "0")]
    pub port: u16,
    #[arg(long, default_value = "false")]
    pub relay_enabled: bool,
    #[arg(long, default_value = "")]
    pub relay_url: String,
}

#[derive(Args)]
pub struct DaemonLogsArgs {
    /// Follow log output
    #[arg(long, short = 'f')]
    pub follow: bool,
}

pub async fn run(cmd: DaemonCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    match cmd {
        DaemonCommands::Run(args) => {
            let run_cfg = RunConfig {
                host: args.host,
                port: args.port,
                relay_enabled: args.relay_enabled,
                relay_url: args.relay_url,
                log_file_path: String::new(),
            };
            crate::daemon::process::run(run_cfg, runtime.clone()).await
        }

        DaemonCommands::Start(args) => {
            let cfg = runtime.config();
            // Check if already running.
            if let Some(state) = crate::daemon::load_state(&cfg.config_path) {
                if state.running && crate::daemon::state::is_process_running(state.pid) {
                    print_any(json!({
                        "status": "already_running",
                        "pid": state.pid,
                        "host": state.host,
                        "port": state.port,
                    }))?;
                    return Ok(());
                }
            }

            let start_cfg = StartConfig {
                run: RunConfig {
                    host: args.host,
                    port: args.port,
                    relay_enabled: args.relay_enabled,
                    relay_url: args.relay_url,
                    log_file_path: String::new(),
                },
                config_path: cfg.config_path.clone(),
                ..Default::default()
            };

            let _pid = start_detached(&start_cfg).context("start daemon")?;
            let state = wait_for_ready(&cfg.config_path, Duration::from_secs(10))
                .context("wait for daemon ready")?;

            print_any(json!({
                "status": "started",
                "pid": state.pid,
                "host": state.host,
                "port": state.port,
            }))?;
            Ok(())
        }

        DaemonCommands::Stop => {
            let cfg = runtime.config();
            let state = stop(&cfg.config_path, Duration::from_secs(10)).context("stop daemon")?;
            print_any(json!({ "status": "stopped", "pid": state.pid }))?;
            Ok(())
        }

        DaemonCommands::Restart => {
            let cfg = runtime.config();
            let start_cfg = StartConfig {
                config_path: cfg.config_path.clone(),
                ..Default::default()
            };
            let state = restart(
                &start_cfg,
                &cfg.config_path,
                Duration::from_secs(10),
                Duration::from_secs(10),
            )
            .context("restart daemon")?;
            print_any(json!({
                "status": "restarted",
                "pid": state.pid,
                "host": state.host,
                "port": state.port,
            }))?;
            Ok(())
        }

        DaemonCommands::Status => {
            let cfg = runtime.config();
            let state = crate::daemon::load_state(&cfg.config_path);
            match state {
                Some(s) => print_any(json!({
                    "running": s.running,
                    "pid": s.pid,
                    "host": s.host,
                    "port": s.port,
                    "startedAt": s.started_at,
                }))?,
                None => print_any(json!({ "running": false }))?,
            }
            Ok(())
        }

        DaemonCommands::Logs(args) => {
            let cfg = runtime.config();
            let log_path = crate::daemon::log_file_path(&cfg.config_path)?;
            if args.follow {
                tail_follow(&log_path)
            } else {
                let content = std::fs::read_to_string(&log_path)
                    .with_context(|| format!("read daemon log: {}", log_path.display()))?;
                print!("{content}");
                Ok(())
            }
        }
    }
}

fn tail_follow(path: &std::path::Path) -> anyhow::Result<()> {
    use std::io::{BufRead, BufReader, Seek, SeekFrom};
    use std::thread;
    use std::time::Duration;

    let mut file = std::fs::File::open(path)
        .with_context(|| format!("open daemon log: {}", path.display()))?;
    file.seek(SeekFrom::End(0))?;
    let mut reader = BufReader::new(file);
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => thread::sleep(Duration::from_millis(200)),
            Ok(_) => print!("{line}"),
            Err(e) => return Err(e.into()),
        }
    }
}
