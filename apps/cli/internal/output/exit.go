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
