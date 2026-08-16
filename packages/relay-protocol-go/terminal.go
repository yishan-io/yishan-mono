package relayprotocol

import "bytes"

// TerminalStreamRequestParams is sent by a subscribing node to request PTY
// streaming for a session owned by another node.
type TerminalStreamRequestParams struct {
	SessionID string `json:"sessionId"`
	OwnerNode string `json:"ownerNode"`
	FromNode  string `json:"fromNode"`
}

// TerminalStreamAcceptParams is sent by the owning node to confirm the stream.
type TerminalStreamAcceptParams struct {
	SessionID string `json:"sessionId"`
}

// TerminalStreamCancelParams is sent by either side to tear down a stream.
type TerminalStreamCancelParams struct {
	SessionID string `json:"sessionId"`
	FromNode  string `json:"fromNode"`
}

// Binary PTY frame opcodes for the terminal I/O fast-path.
const (
	// BinaryFrameOpcodeInput marks a frame carrying terminal input from a
	// subscriber to the owning node (routed to the session owner).
	BinaryFrameOpcodeInput byte = 0x01
	// BinaryFrameOpcodeOutput marks a frame carrying terminal output from the
	// owning node to every subscribed node.
	BinaryFrameOpcodeOutput byte = 0x02
)

// EncodeBinaryFrame builds a binary PTY frame:
// [1 byte opcode][session ID (null-terminated)][payload].
func EncodeBinaryFrame(opcode byte, sessionID string, payload []byte) []byte {
	frame := make([]byte, 0, 1+len(sessionID)+1+len(payload))
	frame = append(frame, opcode)
	frame = append(frame, sessionID...)
	frame = append(frame, 0)
	frame = append(frame, payload...)
	return frame
}

// DecodeBinaryFrame splits a binary PTY frame into its opcode, session ID
// (as a byte slice, not copied), and payload. It returns ok=false when the
// frame is malformed (shorter than opcode + non-empty session ID + null
// terminator).
func DecodeBinaryFrame(frame []byte) (opcode byte, sessionID []byte, payload []byte, ok bool) {
	if len(frame) < 3 {
		return 0, nil, nil, false
	}
	opcode = frame[0]
	rest := frame[1:]
	nullIdx := bytes.IndexByte(rest, 0)
	if nullIdx <= 0 {
		return 0, nil, nil, false
	}
	return opcode, rest[:nullIdx], rest[nullIdx+1:], true
}
