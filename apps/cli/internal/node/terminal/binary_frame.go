package terminal

import (
	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/cli/internal/rpc"
)

// HandleBinaryFrame implements rpc.BinaryFrameHandler: terminal input frames
// are written straight to the local PTY. Output frames only flow daemon ->
// client, so inbound output frames are ignored.
func (s *Service) HandleBinaryFrame(_ *rpc.Connection, opcode byte, sessionID string, payload []byte) {
	if opcode != relayprotocol.BinaryFrameOpcodeInput {
		return
	}
	// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
	inputData := terminalInputData(payload)
	if len(inputData) == 0 {
		return
	}
	s.deps.Terminals.SendRaw(sessionID, inputData)
}

// terminalInputData slices the payload after the null-terminated session id.
func terminalInputData(payload []byte) []byte {
	_, _, data, ok := relayprotocol.DecodeBinaryFrame(payload)
	if !ok {
		return nil
	}
	return data
}
