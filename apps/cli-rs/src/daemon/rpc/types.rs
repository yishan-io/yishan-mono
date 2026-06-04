use serde::{Deserialize, Serialize};
use serde_json::{value::RawValue, Value};

/// JSON-RPC 2.0 request frame.
#[derive(Debug, Deserialize)]
pub struct RpcRequest {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Box<RawValue>>,
}

/// JSON-RPC 2.0 successful response.
#[derive(Debug, Serialize)]
pub struct RpcResponse {
    pub jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

impl RpcResponse {
    pub fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<Value>, err: RpcError) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(err),
        }
    }
}

/// JSON-RPC 2.0 error object.
#[derive(Debug, Serialize, Clone)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

/// JSON-RPC 2.0 notification (no id, no response expected).
#[derive(Debug, Serialize)]
pub struct RpcNotification {
    pub jsonrpc: &'static str,
    pub method: String,
    pub params: Value,
}

impl RpcNotification {
    pub fn new(method: impl Into<String>, params: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            method: method.into(),
            params,
        }
    }
}

/// Domain-level RPC error — carries a code and message, maps to `RpcError`.
#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct DomainRpcError {
    pub code: i64,
    pub message: String,
}

impl DomainRpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_params(msg: impl Into<String>) -> Self {
        Self::new(crate::daemon::constants::RPC_INVALID_PARAMS, msg)
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new(crate::daemon::constants::RPC_NOT_FOUND, msg)
    }

    pub fn method_not_found(method: &str) -> Self {
        Self::new(
            crate::daemon::constants::RPC_METHOD_NOT_FOUND,
            format!("method not found: {method}"),
        )
    }

    pub fn server_error(msg: impl Into<String>) -> Self {
        Self::new(crate::daemon::constants::RPC_SERVER_ERROR, msg)
    }
}

impl From<DomainRpcError> for RpcError {
    fn from(e: DomainRpcError) -> Self {
        Self {
            code: e.code,
            message: e.message,
        }
    }
}

impl From<anyhow::Error> for RpcError {
    fn from(e: anyhow::Error) -> Self {
        // Try to downcast to DomainRpcError first.
        if let Some(domain) = e.downcast_ref::<DomainRpcError>() {
            return Self {
                code: domain.code,
                message: domain.message.clone(),
            };
        }
        Self {
            code: crate::daemon::constants::RPC_SERVER_ERROR,
            message: e.to_string(),
        }
    }
}

/// Decode JSON-RPC params into a typed struct.
pub fn decode_params<T: serde::de::DeserializeOwned>(
    raw: Option<&RawValue>,
) -> Result<T, DomainRpcError> {
    let raw = raw.ok_or_else(|| DomainRpcError::invalid_params("missing params"))?;
    serde_json::from_str(raw.get()).map_err(|_| DomainRpcError::invalid_params("invalid params"))
}
