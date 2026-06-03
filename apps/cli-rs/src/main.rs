mod api;
mod buildinfo;
mod cmd;
mod config;
mod daemon;
mod error;
mod login;
mod output;
mod relay;
mod runtime;
mod watcher;
mod workspace;

use std::process;

fn main() {
    let code = match cmd::run() {
        Ok(()) => 0,
        Err(err) => {
            let code = error::classify_exit_code(&err);
            output::print_error(&err, code);
            code as i32
        }
    };
    process::exit(code);
}
