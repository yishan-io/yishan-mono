package relayprotocol

// Relay protocol method names. These strings are the wire protocol between
// daemon nodes and the relay server.
const (
	MethodPing                     = "relay.ping"
	MethodPong                     = "relay.pong"
	MethodJobRun                   = "job.run"
	MethodJobAck                   = "job.ack"
	MethodJobResult                = "job.result"
	MethodWorkspaceSnapshotChanged = "workspace.snapshot.changed"
	MethodTerminalSessionChanged   = "terminal.session.changed"
	MethodTerminalStreamRequest    = "terminal.stream.request"
	MethodTerminalStreamAccept     = "terminal.stream.accept"
	MethodTerminalStreamCancel     = "terminal.stream.cancel"
)
