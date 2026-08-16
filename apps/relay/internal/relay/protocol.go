package relay

// The wire protocol types and constants live in the shared relay protocol
// module (yishan/packages/relay-protocol-go). This file keeps the short local
// names server code uses; the JSON shapes are owned by the shared module and
// protected by its compatibility tests.

import relayprotocol "yishan/packages/relay-protocol-go"

type request = relayprotocol.Request
type response = relayprotocol.Response
type notification = relayprotocol.Notification
type rpcError = relayprotocol.RPCError

// Relay protocol methods.
const (
	MethodPing                     = relayprotocol.MethodPing
	MethodPong                     = relayprotocol.MethodPong
	MethodJobRun                   = relayprotocol.MethodJobRun
	MethodJobAck                   = relayprotocol.MethodJobAck
	MethodJobResult                = relayprotocol.MethodJobResult
	MethodWorkspaceSnapshotChanged = relayprotocol.MethodWorkspaceSnapshotChanged
	MethodTerminalSessionChanged   = relayprotocol.MethodTerminalSessionChanged
	MethodTerminalStreamRequest    = relayprotocol.MethodTerminalStreamRequest
	MethodTerminalStreamAccept     = relayprotocol.MethodTerminalStreamAccept
	MethodTerminalStreamCancel     = relayprotocol.MethodTerminalStreamCancel
)

// JSON-RPC error codes.
const (
	CodeParseError     = relayprotocol.CodeParseError
	CodeInvalidRequest = relayprotocol.CodeInvalidRequest
	CodeMethodNotFound = relayprotocol.CodeMethodNotFound
	CodeInvalidParams  = relayprotocol.CodeInvalidParams
	CodeInternalError  = relayprotocol.CodeInternalError

	CodeAuthFailed       = relayprotocol.CodeAuthFailed
	CodeNodeOffline      = relayprotocol.CodeNodeOffline
	CodeDispatchRejected = relayprotocol.CodeDispatchRejected
)

type jobRunParams = relayprotocol.JobRunParams
type jobAckParams = relayprotocol.JobAckParams
type jobResultParams = relayprotocol.JobResultParams
type jobError = relayprotocol.JobError

type terminalStreamRequestParams = relayprotocol.TerminalStreamRequestParams
type terminalStreamAcceptParams = relayprotocol.TerminalStreamAcceptParams
type terminalStreamCancelParams = relayprotocol.TerminalStreamCancelParams
