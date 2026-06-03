use super::format::FORMAT;
use super::table::render_table;
use super::RenderData;
use crate::error::{CliError, ExitCode};
use serde::Serialize;
use serde_json::Value;

/// Print any serializable value to stdout.
/// In JSON mode: pretty-printed JSON. In default mode: auto-formatted table or object.
pub fn print_any<T: Serialize>(value: T) -> anyhow::Result<()> {
    let json = serde_json::to_value(value)?;
    if FORMAT::is_json() {
        print_json_value(&json);
        return Ok(());
    }
    print_value_default(&json);
    Ok(())
}

/// Always emit pretty-printed JSON regardless of format setting.
pub fn print_json<T: Serialize>(value: T) -> anyhow::Result<()> {
    let json = serde_json::to_value(value)?;
    print_json_value(&json);
    Ok(())
}

/// Print structured render data.
pub fn print_render_data(data: RenderData) -> anyhow::Result<()> {
    if FORMAT::is_json() {
        let json = render_data_to_json(&data);
        print_json_value(&json);
        return Ok(());
    }

    if let Some(rows) = &data.rows {
        render_table(&data.columns, rows);
        return Ok(());
    }

    if let Some(obj) = &data.object {
        print_value_default(obj);
    } else {
        println!("{{}}");
    }

    Ok(())
}

/// Print an error to stderr.
/// In JSON mode: `{"error": {"code": "...", "message": "..."}}`.
/// In default mode: no-op (clap / anyhow already wrote to stderr).
pub fn print_error(err: &CliError, code: ExitCode) {
    if !FORMAT::is_json() {
        // In default mode, eprintln the error message so it's visible.
        eprintln!("Error: {err}");
        return;
    }

    let envelope = serde_json::json!({
        "error": {
            "code": code.as_code(),
            "message": err.to_string(),
        }
    });
    let text = serde_json::to_string_pretty(&envelope)
        .unwrap_or_else(|_| format!(r#"{{"error":{{"code":"internal","message":{:?}}}}}"#, err.to_string()));
    eprintln!("{text}");
}

fn print_json_value(value: &Value) {
    let text = serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
    println!("{text}");
}

fn print_value_default(value: &Value) {
    match value {
        Value::Array(arr) => {
            // Try to render as table if items are objects.
            if arr.is_empty() {
                println!("(no items)");
                return;
            }
            if let Some(Value::Object(first)) = arr.first() {
                let cols: Vec<String> = first.keys().cloned().collect();
                let rows: Vec<Value> = arr.to_vec();
                render_table(&cols, &rows);
                return;
            }
            // Fallback to JSON.
            print_json_value(value);
        }
        Value::Object(_) => {
            let text = serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
            println!("{text}");
        }
        _ => println!("{value}"),
    }
}

fn render_data_to_json(data: &RenderData) -> Value {
    if let Some(obj) = &data.object {
        return obj.clone();
    }
    if let Some(rows) = &data.rows {
        if let Some(title) = &data.title {
            return serde_json::json!({ title: rows });
        }
        return Value::Array(rows.clone());
    }
    if let Some(title) = &data.title {
        return serde_json::json!({ "title": title });
    }
    serde_json::json!({})
}
