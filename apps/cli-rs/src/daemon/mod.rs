pub mod client;
pub mod constants;
pub mod event_hub;
pub mod id;
pub mod process;
pub mod rpc;
pub mod server;
pub mod state;

pub use client::RpcClient;
pub use id::ensure_daemon_id;
pub use process::{RunConfig, StartConfig, DETACHED_ENV_KEY};
pub use server::DaemonApp;
pub use state::{load_state, log_file_path, save_state, DaemonState};

use crate::runtime::AppRuntime;

/// Build an RPC client connected to the running daemon.
pub fn rpc_client(runtime: &AppRuntime) -> anyhow::Result<RpcClient> {
    let cfg = runtime.config();
    let state = load_state(&cfg.config_path)
        .ok_or_else(|| anyhow::anyhow!("daemon is not running; start it with `yishan daemon start`"))?;
    if !state.running {
        anyhow::bail!("daemon is not running; start it with `yishan daemon start`");
    }
    Ok(RpcClient::new(&state.host, state.port))
}
