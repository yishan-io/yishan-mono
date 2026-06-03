use crate::workspace::types::TerminalDetectedPort;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::OnceLock;

const MAX_LSOF_PIDS_PER_INVOCATION: usize = 256;
const PORT_SCAN_TAIL_SIZE: usize = 256;

#[derive(Clone, Copy)]
pub(super) struct ProcessInfo {
    pub pid: i32,
    pub ppid: i32,
}

pub(super) struct ListeningPort {
    pub pid: i32,
    pub address: String,
    pub port: u16,
    pub process_name: String,
}

#[derive(Clone)]
pub(super) struct SessionPortRef {
    pub session_id: String,
    pub workspace_id: String,
    pub pid: i32,
}

pub(super) fn append_port_scan_tail(previous_tail: &str, chunk: &str) -> (String, bool) {
    let combined = format!("{previous_tail}{chunk}");
    let next_tail = last_n_chars(&combined, PORT_SCAN_TAIL_SIZE);
    (next_tail, output_mentions_ports(&combined))
}

pub(super) fn collect_detected_ports_for_sessions(sessions: &[SessionPortRef]) -> Vec<TerminalDetectedPort> {
    if sessions.is_empty() {
        return Vec::new();
    }

    let mut session_by_pid = HashMap::new();
    let mut root_pids = Vec::new();
    for session in sessions {
        if session.pid <= 0 {
            continue;
        }
        session_by_pid.insert(session.pid, session.clone());
        root_pids.push(session.pid);
    }
    if root_pids.is_empty() {
        return Vec::new();
    }

    let processes = match list_processes() {
        Ok(processes) => processes,
        Err(_) => return Vec::new(),
    };
    let pid_to_root = build_pid_to_root_map(&root_pids, &processes);
    if pid_to_root.is_empty() {
        return Vec::new();
    }

    let tracked_pids = pid_to_root.keys().copied().collect::<Vec<_>>();
    let listening_ports = match list_listening_tcp_ports(&tracked_pids) {
        Ok(ports) => ports,
        Err(_) => return Vec::new(),
    };

    let mut detected_ports = Vec::new();
    for listening_port in listening_ports {
        let Some(root_pid) = pid_to_root.get(&listening_port.pid).copied() else {
            continue;
        };
        let Some(session) = session_by_pid.get(&root_pid) else {
            continue;
        };
        detected_ports.push(TerminalDetectedPort {
            session_id: session.session_id.clone(),
            workspace_id: session.workspace_id.clone(),
            pid: listening_port.pid,
            port: listening_port.port,
            address: listening_port.address,
            process_name: listening_port.process_name,
        });
    }

    detected_ports.sort_by(|left, right| {
        left.workspace_id
            .cmp(&right.workspace_id)
            .then(left.port.cmp(&right.port))
            .then(left.pid.cmp(&right.pid))
    });
    detected_ports
}

fn list_processes() -> std::io::Result<Vec<ProcessInfo>> {
    let output = Command::new("ps").args(["-axo", "pid=,ppid="]).output()?;
    Ok(parse_processes(&output.stdout))
}

fn list_listening_tcp_ports(pids: &[i32]) -> std::io::Result<Vec<ListeningPort>> {
    let normalized = normalize_positive_pids(pids);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let mut ports = Vec::new();
    for chunk in normalized.chunks(MAX_LSOF_PIDS_PER_INVOCATION) {
        ports.extend(list_listening_tcp_ports_for_chunk(chunk)?);
    }
    Ok(ports)
}

fn list_listening_tcp_ports_for_chunk(pids: &[i32]) -> std::io::Result<Vec<ListeningPort>> {
    let pid_values = pids.iter().map(ToString::to_string).collect::<Vec<_>>();
    let output = Command::new("lsof")
        .args([
            "-nP",
            "-a",
            "-p",
            &pid_values.join(","),
            "-iTCP",
            "-sTCP:LISTEN",
            "-F",
            "pcn",
        ])
        .output()?;

    if !output.status.success() && output.status.code() != Some(1) {
        return Err(std::io::Error::other(String::from_utf8_lossy(&output.stderr).into_owned()));
    }

    Ok(parse_lsof_listening_tcp_ports(&output.stdout))
}

fn parse_processes(output: &[u8]) -> Vec<ProcessInfo> {
    String::from_utf8_lossy(output)
        .lines()
        .filter_map(|line| {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 2 {
                return None;
            }
            let pid = fields[0].parse::<i32>().ok()?;
            let ppid = fields[1].parse::<i32>().ok()?;
            Some(ProcessInfo { pid, ppid })
        })
        .collect()
}

fn parse_lsof_listening_tcp_ports(output: &[u8]) -> Vec<ListeningPort> {
    let mut current_pid = 0;
    let mut current_process_name = String::new();
    let mut ports = Vec::new();

    for line in String::from_utf8_lossy(output).lines() {
        if line.len() < 2 {
            continue;
        }
        let (prefix, value) = line.split_at(1);
        let value = value.trim();
        match prefix {
            "p" => {
                current_pid = value.parse::<i32>().unwrap_or_default();
                current_process_name.clear();
            }
            "c" => {
                current_process_name = value.to_string();
            }
            "n" => {
                let Some((address, port)) = parse_lsof_network_address(value) else {
                    continue;
                };
                ports.push(ListeningPort {
                    pid: current_pid,
                    address,
                    port,
                    process_name: current_process_name.clone(),
                });
            }
            _ => {}
        }
    }

    ports
}

fn parse_lsof_network_address(value: &str) -> Option<(String, u16)> {
    let value = value.trim().trim_start_matches("TCP ").trim_end_matches(" (LISTEN)");
    let colon_index = value.rfind(':')?;
    let port = value[colon_index + 1..].parse::<u16>().ok()?;
    let mut address = value[..colon_index].trim_matches(&['[', ']'][..]).to_string();
    if address.is_empty() || address == "*" {
        address = "0.0.0.0".to_string();
    }
    Some((address, port))
}

fn normalize_positive_pids(pids: &[i32]) -> Vec<i32> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for pid in pids {
        if *pid <= 0 || !seen.insert(*pid) {
            continue;
        }
        unique.push(*pid);
    }
    unique.sort_unstable();
    unique
}

fn build_pid_to_root_map(root_pids: &[i32], processes: &[ProcessInfo]) -> HashMap<i32, i32> {
    let root_set = root_pids.iter().copied().collect::<HashSet<_>>();
    let parent_by_pid = processes
        .iter()
        .map(|process| (process.pid, process.ppid))
        .collect::<HashMap<_, _>>();

    let mut cache = HashMap::<i32, Option<i32>>::new();
    let mut pid_to_root = HashMap::new();
    for pid in parent_by_pid.keys().copied().chain(root_pids.iter().copied()) {
        if let Some(root_pid) = resolve_root_pid(pid, &root_set, &parent_by_pid, &mut cache) {
            pid_to_root.insert(pid, root_pid);
        }
    }
    pid_to_root
}

fn resolve_root_pid(
    pid: i32,
    root_set: &HashSet<i32>,
    parent_by_pid: &HashMap<i32, i32>,
    cache: &mut HashMap<i32, Option<i32>>,
) -> Option<i32> {
    if let Some(cached) = cache.get(&pid) {
        return *cached;
    }
    if root_set.contains(&pid) {
        cache.insert(pid, Some(pid));
        return Some(pid);
    }

    let parent_pid = parent_by_pid.get(&pid).copied().unwrap_or_default();
    if parent_pid <= 0 || parent_pid == pid {
        cache.insert(pid, None);
        return None;
    }

    let root_pid = resolve_root_pid(parent_pid, root_set, parent_by_pid, cache);
    cache.insert(pid, root_pid);
    root_pid
}

fn output_mentions_ports(chunk: &str) -> bool {
    port_announcement_re().is_match(&strip_ansi(chunk))
}

fn strip_ansi(value: &str) -> String {
    ansi_escape_re().replace_all(value, "").into_owned()
}

fn ansi_escape_re() -> &'static Regex {
    static ANSI_ESCAPE_RE: OnceLock<Regex> = OnceLock::new();
    ANSI_ESCAPE_RE.get_or_init(|| {
        Regex::new(
            r#"\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|\][^\x1b]*\x1b\\|[A-Z\\@^_])"#,
        )
        .expect("compile ansi escape regex")
    })
}

fn port_announcement_re() -> &'static Regex {
    static PORT_ANNOUNCEMENT_RE: OnceLock<Regex> = OnceLock::new();
    PORT_ANNOUNCEMENT_RE.get_or_init(|| {
        Regex::new(
            r#"(?i)(?:(?:(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]|[a-zA-Z0-9\-]+\.local))?:\d{2,5}\b|\bport[=\s]+\d{2,5}\b|(?:listening\s+on|running\s+on|started\s+on|available\s+at)\s+\S*:\d{2,5}\b)"#,
        )
        .expect("compile port announcement regex")
    })
}

fn last_n_chars(value: &str, max_chars: usize) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= max_chars {
        return value.to_string();
    }
    chars[chars.len() - max_chars..].iter().collect()
}
