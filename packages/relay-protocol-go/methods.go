package relayprotocol

// Relay protocol method names. These strings are the wire protocol between
// daemon nodes and the relay server.
const (
	MethodPing = "relay.ping"
	MethodPong = "relay.pong"
)
