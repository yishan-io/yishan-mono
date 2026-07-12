package agentmanager

import (
	"bufio"
	"io"

	"github.com/rs/zerolog/log"
)

// readStdout reads JSONL lines from the agent's stdout and forwards each one
// to the OnEvent callback. It blocks until stdout reaches EOF (process exits or
// pipe closes). When the goroutine returns, it unregisters the session from the
// manager and closes the session's done channel.
//
// Uses bufio.Scanner with ScanLines (splits on \n only), which is compatible
// with pi's strict LF-delimited JSONL framing. Unlike bufio.ScanLines, we do
// NOT use the default scanner because it also splits on carriage returns;
// however ScanLines only splits on \n. If a line ends with \r\n, the \r is
// retained in the token — the caller (OnEvent) is responsible for stripping
// trailing \r before JSON parsing.
func readStdout(session *Session, stdout io.ReadCloser, onEvent func(sessionID, tabID, workspaceID string, event []byte)) {
	defer func() {
		stdout.Close()
		session.manager.removeSession(session.id)
		close(session.done)
	}()

	scanner := bufio.NewScanner(stdout)
	// Default bufio.MaxScanTokenSize is 64KB. Pi events (especially message
	// updates with large tool outputs) can exceed this. Use 10MB.
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	scanner.Split(scanLinesStrict)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		// Strip trailing \r (from \r\n input).
		if line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		if len(line) == 0 {
			continue
		}

		if onEvent != nil {
			onEvent(session.id, session.tabID, session.workspaceID, line)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Warn().
			Err(err).
			Str("sessionId", session.id).
			Msg("agentmanager: stdout scan error")
	}
}

// scanLinesStrict splits on \n only. It is identical to bufio.ScanLines but
// does not strip the trailing \r — we handle that explicitly above so we can
// validate the framing.
func scanLinesStrict(data []byte, atEOF bool) (advance int, token []byte, err error) {
	for i := 0; i < len(data); i++ {
		if data[i] == '\n' {
			return i + 1, data[:i], nil
		}
	}
	if !atEOF {
		return 0, nil, nil
	}
	// At EOF, return the remaining data even without a trailing newline.
	return len(data), data, bufio.ErrFinalToken
}
