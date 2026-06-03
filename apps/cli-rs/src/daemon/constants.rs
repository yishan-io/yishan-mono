// JSON-RPC 2.0 error codes (standard + custom)
#![allow(dead_code)]

pub const RPC_PARSE_ERROR: i64 = -32700;
pub const RPC_INVALID_REQUEST: i64 = -32600;
pub const RPC_METHOD_NOT_FOUND: i64 = -32601;
pub const RPC_INVALID_PARAMS: i64 = -32602;
pub const RPC_SERVER_ERROR: i64 = -32000;
pub const RPC_NOT_FOUND: i64 = -32004;
pub const RPC_PATH_RESTRICTED: i64 = -32003;
pub const RPC_TOOL_UNAVAILABLE: i64 = -32010;
pub const RPC_SESSION_INACTIVE: i64 = -32005;

// Binary frame opcodes for terminal I/O fast-path.
pub const BIN_OPCODE_TERMINAL_INPUT: u8 = 0x01;
pub const BIN_OPCODE_TERMINAL_OUTPUT: u8 = 0x02;

// Max in-flight JSON-RPC requests per WebSocket connection.
pub const MAX_IN_FLIGHT_RPC: usize = 16;

// ── JSON-RPC method names ─────────────────────────────────────────────────────

// Workspace methods
pub const METHOD_WORKSPACE_OPEN: &str = "workspace.open";
pub const METHOD_WORKSPACE_LIST: &str = "workspace.list";
pub const METHOD_WORKSPACE_CREATE: &str = "workspace.create";
pub const METHOD_WORKSPACE_CLOSE: &str = "workspace.close";
pub const METHOD_WORKSPACE_SYNC_CONTEXT_LINK: &str = "workspace.syncContextLink";
pub const METHOD_WORKSPACE_SET_ACTIVE: &str = "workspace.setActive";

// Git methods
pub const METHOD_GIT_STATUS: &str = "git.status";
pub const METHOD_GIT_INSPECT: &str = "git.inspect";
pub const METHOD_GIT_LIST_CHANGES: &str = "git.listChanges";
pub const METHOD_GIT_TRACK: &str = "git.track";
pub const METHOD_GIT_UNSTAGE: &str = "git.unstage";
pub const METHOD_GIT_REVERT: &str = "git.revert";
pub const METHOD_GIT_COMMIT: &str = "git.commit";
pub const METHOD_GIT_BRANCH_STATUS: &str = "git.branchStatus";
pub const METHOD_GIT_BRANCH_PR: &str = "git.branchPullRequest";
pub const METHOD_GIT_COMMITS_TO_TARGET: &str = "git.commitsToTarget";
pub const METHOD_GIT_BRANCH_DIFF_SUMMARY: &str = "git.branchDiffSummary";
pub const METHOD_GIT_COMMIT_DIFF: &str = "git.commitDiff";
pub const METHOD_GIT_BRANCH_DIFF: &str = "git.branchDiff";
pub const METHOD_GIT_BRANCHES: &str = "git.branches";
pub const METHOD_GIT_PUSH: &str = "git.push";
pub const METHOD_GIT_PUBLISH: &str = "git.publish";
pub const METHOD_GIT_RENAME_BRANCH: &str = "git.renameBranch";
pub const METHOD_GIT_REMOVE_BRANCH: &str = "git.removeBranch";
pub const METHOD_GIT_PR_MERGE: &str = "git.prMerge";
pub const METHOD_GIT_PR_CLOSE: &str = "git.prClose";
pub const METHOD_GIT_WORKTREE_CREATE: &str = "git.worktreeCreate";
pub const METHOD_GIT_WORKTREE_REMOVE: &str = "git.worktreeRemove";
pub const METHOD_GIT_AUTHOR_NAME: &str = "git.authorName";

// File methods
pub const METHOD_FILE_READ: &str = "file.read";
pub const METHOD_FILE_LIST: &str = "file.list";
pub const METHOD_FILE_STAT: &str = "file.stat";
pub const METHOD_FILE_WRITE: &str = "file.write";
pub const METHOD_FILE_DELETE: &str = "file.delete";
pub const METHOD_FILE_MOVE: &str = "file.move";
pub const METHOD_FILE_MKDIR: &str = "file.mkdir";
pub const METHOD_FILE_DIFF: &str = "file.diff";

// Terminal methods
pub const METHOD_TERMINAL_START: &str = "terminal.start";
pub const METHOD_TERMINAL_SEND: &str = "terminal.send";
pub const METHOD_TERMINAL_READ: &str = "terminal.read";
pub const METHOD_TERMINAL_STOP: &str = "terminal.stop";
pub const METHOD_TERMINAL_KILL_PROCESS: &str = "terminal.killProcess";
pub const METHOD_TERMINAL_LIST_SESSIONS: &str = "terminal.listSessions";
pub const METHOD_TERMINAL_LIST_PORTS: &str = "terminal.listPorts";
pub const METHOD_TERMINAL_RESIZE: &str = "terminal.resize";
pub const METHOD_TERMINAL_SUBSCRIBE: &str = "terminal.subscribe";
pub const METHOD_TERMINAL_UNSUBSCRIBE: &str = "terminal.unsubscribe";

// System methods
pub const METHOD_DAEMON_PING: &str = "daemon.ping";
pub const METHOD_FRONTEND_EVENTS_STREAM: &str = "frontend.eventsStream";
pub const METHOD_AGENT_LIST_DETECTION_STATUSES: &str = "agent.listDetectionStatuses";
pub const METHOD_CLI_TOOL_LIST_STATUSES: &str = "cliTool.listStatuses";
pub const METHOD_INTEGRATION_GITHUB_STATUS: &str = "integration.githubStatus";
pub const METHOD_APP_PERSIST_AUTH_TOKENS: &str = "app.persistAuthTokens";
pub const METHOD_APP_GET_ACCESS_TOKEN: &str = "app.getAccessToken";
pub const METHOD_APP_CHECK_AUTH_STATUS: &str = "app.checkAuthStatus";
pub const METHOD_APP_LOGOUT: &str = "app.logout";
pub const METHOD_APP_RELOAD_AUTH_CONFIG: &str = "app.reloadAuthConfig";
pub const METHOD_TOKEN_USAGE_DEBUG_STATE: &str = "tokenUsage.debugState";
