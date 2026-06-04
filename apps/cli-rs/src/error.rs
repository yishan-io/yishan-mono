use crate::api::{ApiError, TokenRefreshError};
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
#[allow(dead_code)]
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

const RELOGIN_MESSAGE: &str = "session expired; run `yishan login` and retry";

/// Top-level CLI error — wraps domain errors and carries an exit code.
#[allow(dead_code)]
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

impl CliError {
    pub fn from_anyhow(err: anyhow::Error) -> Self {
        if let Some(refresh_err) = err.downcast_ref::<TokenRefreshError>() {
            if is_invalid_refresh_token_error(refresh_err) {
                return CliError::Unauthenticated(RELOGIN_MESSAGE.to_string());
            }
        }

        if let Some(api_err) = err.downcast_ref::<ApiError>() {
            return match api_err.status {
                401 => CliError::Unauthenticated(api_err.body.clone()),
                403 => CliError::Forbidden(api_err.body.clone()),
                404 => CliError::NotFound(api_err.body.clone()),
                status => CliError::Api {
                    status,
                    body: api_err.body.clone(),
                    source: err,
                },
            };
        }

        CliError::Other(err)
    }
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

fn is_invalid_refresh_token_error(err: &TokenRefreshError) -> bool {
    let Some(api_err) = err.refresh_error.downcast_ref::<ApiError>() else {
        return false;
    };

    api_err.status == 401
        && api_err.path == "/auth/refresh"
        && api_err.body.contains("Invalid refresh token")
}

#[cfg(test)]
mod tests {
    use super::{CliError, RELOGIN_MESSAGE};
    use crate::api::{ApiError, TokenRefreshError};

    #[test]
    fn from_anyhow_maps_invalid_refresh_token_to_relogin_error() {
        let err = anyhow::Error::new(TokenRefreshError {
            request_error: ApiError {
                method: "GET".to_string(),
                path: "/projects".to_string(),
                status: 401,
                body: r#"{"error":"Unauthorized"}"#.to_string(),
            }
            .into(),
            refresh_error: ApiError {
                method: "POST".to_string(),
                path: "/auth/refresh".to_string(),
                status: 401,
                body: r#"{"error":"Invalid refresh token"}"#.to_string(),
            }
            .into(),
        });

        match CliError::from_anyhow(err) {
            CliError::Unauthenticated(message) => assert_eq!(message, RELOGIN_MESSAGE),
            other => panic!("expected unauthenticated error, got {other:?}"),
        }
    }
}
