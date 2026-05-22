package output

// Exit codes used by the CLI. The values are POSIX-safe (0-125) and stable —
// agents and scripts can rely on them across versions.
//
//	0  Success
//	1  General / unclassified error
//	2  Usage / argument error (bad flags, missing required args)
//	3  Authentication required or token expired
//	4  Resource not found
//	5  Permission denied
//	6  Daemon not running
//	7  Network or server error
const (
	ExitSuccess         = 0
	ExitError           = 1
	ExitUsageError      = 2
	ExitUnauthenticated = 3
	ExitNotFound        = 4
	ExitForbidden       = 5
	ExitDaemonNotRun    = 6
	ExitServerError     = 7
)

// CodeToExitCode maps the string error codes produced by ClassifyError to the
// numeric exit codes above. Returns ExitError for any unrecognised code.
func CodeToExitCode(code string) int {
	switch code {
	case "unauthenticated":
		return ExitUnauthenticated
	case "not_found":
		return ExitNotFound
	case "permission_denied":
		return ExitForbidden
	case "daemon_not_running":
		return ExitDaemonNotRun
	case "server_error":
		return ExitServerError
	case "validation_error":
		return ExitUsageError
	default:
		return ExitError
	}
}
