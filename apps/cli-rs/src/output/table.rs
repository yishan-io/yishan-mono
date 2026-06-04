use comfy_table::{presets::UTF8_FULL_CONDENSED, ContentArrangement, Table};
use serde_json::Value;

/// Render a list of JSON objects as a table to stdout.
pub fn render_table(columns: &[String], rows: &[Value]) {
    if rows.is_empty() {
        println!("(no items)");
        return;
    }

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL_CONDENSED)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(columns);

    for row in rows {
        let cells: Vec<String> = columns
            .iter()
            .map(|col| {
                row.get(col)
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Null => String::new(),
                        other => other.to_string(),
                    })
                    .unwrap_or_default()
            })
            .collect();
        table.add_row(cells);
    }

    println!("{table}");
}
