package terminal

import "regexp"

type processInfo struct {
	PID  int
	PPID int
	Name string // populated on Windows; empty on Unix (name comes from lsof -F c)
}

type listeningPort struct {
	PID         int
	Address     string
	Port        int
	ProcessName string
}

// ansiEscapeRe matches ANSI/VT100 escape sequences that terminals embed in
// output for colours, cursor movement, etc. Examples:
//
//	\x1b[32m   \x1b[0m   \x1b[1;31m   \x1b(B   \x1b]0;title\x07
//
// Stripping these before port-pattern matching prevents sequences like
// "http://127.0.0.1\x1b[0m:3000" from evading the regex.
var ansiEscapeRe = regexp.MustCompile(
	`\x1b` +
		`(?:` +
		`\[[0-9;]*[A-Za-z]` + // CSI sequences: ESC [ ... final-byte  (most common: colors, cursor)
		`|` +
		`\][^\x07]*\x07` + // OSC sequences: ESC ] ... BEL
		`|` +
		`\][^\x1b]*\x1b\\` + // OSC sequences: ESC ] ... ST (ESC \)
		`|` +
		`[A-Z\\@^_]` + // Fe/Fs sequences: ESC followed by single 0x40-0x5F byte
		`)`,
)

// portAnnouncementRe matches common "server started on port NNNN" patterns in
// terminal output. It intentionally casts a wide net — a false positive only
// triggers an extra lsof scan, not a wrong port report.
//
// Matched patterns (case-insensitive):
//   - bare address:port            →  :3000  /  localhost:3000  /  0.0.0.0:8080
//   - "port 3000" keyword          →  port 3000
//   - "listening on …" / "running on …" / "started on …" / "available at …"
var portAnnouncementRe = regexp.MustCompile(
	`(?i)` +
		// address:port  (2-5 digit port to avoid false-positives on timestamps)
		`(?:` +
		`(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]|[a-zA-Z0-9\-]+\.local)` +
		`)?` +
		`:(\d{2,5})\b` +
		`|` +
		// "port 3000" / "port=3000"
		`\bport[=\s]+(\d{2,5})\b` +
		`|` +
		// "listening on …" / "running on …" / "started on …" / "available at …"
		`(?:listening\s+on|running\s+on|started\s+on|available\s+at)\s+\S*:(\d{2,5})\b`,
)

// stripANSI removes ANSI/VT100 escape sequences from s.
func stripANSI(s string) string {
	return ansiEscapeRe.ReplaceAllString(s, "")
}

// outputMentionsPorts returns true when the chunk of terminal output contains
// text that looks like a port-start announcement. ANSI escape sequences are
// stripped before matching so that colorized output (e.g. Vite, Next.js) does
// not prevent detection.
func outputMentionsPorts(chunk string) bool {
	return portAnnouncementRe.MatchString(stripANSI(chunk))
}
