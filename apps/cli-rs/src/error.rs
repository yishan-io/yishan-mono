use thiserror::Error;

/// Exit codes for the Yishan CLI. POSIX-safe (0–125), stable across versions.
///
/// 0  Success
/// 1  General / unclassified error
/// 2  Usage / argument error (bad flags, missing required args)
/// 3  Authentication required or token expired
/// 4  Resource not found
/// 5  Permission denied
/// 6  Daemon not running
/// 7  Network or server error
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitCode {
    Success = 0,
    Error = 1,
    UsageError = 2,
    Unauthenticated = 3,
    NotFound = 4,
    Forbidden = 5,
    DaemonNotRunning = 6,
    ServerError = 7,
}

impl ExitCode {
    pub fn as_code(&self) -> &'static str {
        match self {
            ExitCode::Success => "success",
            ExitCode::Error => "error",
            ExitCode::UsageError => "validation_error",
            ExitCode::Unauthenticated => "unauthenticated",
            ExitCode::NotFound => "not_found",
            ExitCode::Forbidden => "permission_denied",
            ExitCode::DaemonNotRunning => "daemon_not_running",
            ExitCode::ServerError => "server_error",
        }
    }
}

/// Top-level CLI error — wraps domain errors and carries an exit code.
#[derive(Debug, Error)]
pub enum CliError {
    #[error("API error {status}: {body}")]
    Api {
        status: u16,
        body: String,
        #[source]
        source: anyhow::Error,
    },
    #[error("authentication required: {0}")]
    Unauthenticated(String),
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("permission denied: {0}")]
    Forbidden(String),
    #[error("daemon is not running")]
    DaemonNotRunning,
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

/// Classify any error into the numeric exit code.
pub fn classify_exit_code(err: &CliError) -> ExitCode {
    match err {
        CliError::Api { status, .. } => match *status {
            400 => ExitCode::UsageError,
            401 => ExitCode::Unauthenticated,
            403 => ExitCode::Forbidden,
            404 => ExitCode::NotFound,
            409 => ExitCode::Error,
            s if s >= 500 => ExitCode::ServerError,
            _ => ExitCode::Error,
        },
        CliError::Unauthenticated(_) => ExitCode::Unauthenticated,
        CliError::NotFound(_) => ExitCode::NotFound,
        CliError::Forbidden(_) => ExitCode::Forbidden,
        CliError::DaemonNotRunning => ExitCode::DaemonNotRunning,
        CliError::Network(_) => ExitCode::ServerError,
        CliError::Other(_) => ExitCode::Error,
    }
}
