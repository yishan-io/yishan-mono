use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OutputFormat {
    #[default]
    Default,
    Json,
}

/// Process-wide output format. Set once during CLI initialisation.
static FORMAT: OnceLock<OutputFormat> = OnceLock::new();

/// Global accessor used throughout the output module and commands.
pub mod FORMAT {
    use super::{OutputFormat, FORMAT as INNER};

    pub fn get() -> OutputFormat {
        *INNER.get().unwrap_or(&OutputFormat::Default)
    }

    pub fn is_json() -> bool {
        get() == OutputFormat::Json
    }
}

/// Set the output format. Must be called once at startup.
/// Subsequent calls are silently ignored (OnceLock semantics).
pub fn set_format(raw: &str) -> Result<(), String> {
    let fmt = match raw.trim().to_lowercase().as_str() {
        "" | "default" => OutputFormat::Default,
        "json" => OutputFormat::Json,
        other => return Err(format!("invalid output format {other:?}: use default or json")),
    };
    let _ = FORMAT.set(fmt); // Ok to fail if already set.
    Ok(())
}
