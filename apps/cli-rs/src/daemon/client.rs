use anyhow::Context;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// JSON-RPC 2.0 client connecting over WebSocket to the local daemon.
pub struct RpcClient {
    url: String,
    token: Option<String>,
}

#[derive(Serialize)]
struct RpcRequest<'a> {
    jsonrpc: &'static str,
    id: u64,
    method: &'a str,
    params: Value,
}

#[derive(Deserialize)]
struct RpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: u64,
    result: Option<Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Debug)]
struct RpcError {
    code: i64,
    message: String,
}

impl RpcClient {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            url: format!("ws://{host}:{port}/ws"),
            token: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    /// Execute a JSON-RPC 2.0 call and return the `result` field as a `Value`.
    pub async fn call(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        use tokio_tungstenite::tungstenite::http::Request;

        let req = {
            let mut builder = Request::builder().uri(&self.url);
            if let Some(tok) = &self.token {
                builder = builder.header("Authorization", format!("Bearer {tok}"));
            }
            builder.body(()).context("build WebSocket request")?
        };

        let (mut ws, _) = connect_async(req)
            .await
            .with_context(|| format!("connect daemon WebSocket at {}", self.url))?;

        let body = serde_json::to_string(&RpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
        })
        .context("serialize RPC request")?;

        ws.send(Message::Text(body.into()))
            .await
            .context("send RPC request")?;

        let msg = ws
            .next()
            .await
            .ok_or_else(|| anyhow::anyhow!("WebSocket closed before response"))??;

        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => {
                String::from_utf8(b.to_vec()).context("decode binary response")?
            }
            other => anyhow::bail!("unexpected WebSocket message type: {other:?}"),
        };

        let resp: RpcResponse = serde_json::from_str(&text).context("parse RPC response")?;

        if let Some(err) = resp.error {
            anyhow::bail!("daemon RPC error {}: {}", err.code, err.message);
        }

        Ok(resp.result.unwrap_or(Value::Null))
    }
}
