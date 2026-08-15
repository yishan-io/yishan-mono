package daemon

import "yishan/apps/cli/internal/rpc"

// request/response/notification are daemon-side aliases for the JSON-RPC
// protocol envelopes defined in internal/rpc.
type (
	request      = rpc.Request
	response     = rpc.Response
	notification = rpc.Notification
)
