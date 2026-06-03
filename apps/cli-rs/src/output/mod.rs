mod format;
mod print;
mod table;

pub use format::{set_format, OutputFormat, FORMAT};
pub use print::{print_any, print_error, print_json, print_render_data};
pub use table::render_table;

use serde::Serialize;

/// Structured data to render — either a list (table) or a single object.
#[derive(Debug)]
pub struct RenderData {
    pub title: Option<String>,
    pub columns: Vec<String>,
    pub rows: Option<Vec<serde_json::Value>>,
    pub object: Option<serde_json::Value>,
}

impl RenderData {
    pub fn from_object<T: Serialize>(obj: T) -> Self {
        let value = serde_json::to_value(obj).unwrap_or(serde_json::Value::Null);
        Self {
            title: None,
            columns: vec![],
            rows: None,
            object: Some(value),
        }
    }

    pub fn from_rows(columns: Vec<String>, rows: Vec<serde_json::Value>) -> Self {
        Self {
            title: None,
            columns,
            rows: Some(rows),
            object: None,
        }
    }

    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }
}
