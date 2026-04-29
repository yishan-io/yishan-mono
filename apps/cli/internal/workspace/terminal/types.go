package terminal

type StartRequest struct {
	WorkspaceID string   `json:"workspaceId"`
	Command     string   `json:"command"`
	Args        []string `json:"args,omitempty"`
	Env         []string `json:"env,omitempty"`
}

type StartResponse struct {
	SessionID string `json:"sessionId"`
}

type SendRequest struct {
	SessionID string `json:"sessionId"`
	Input     string `json:"input"`
}

type SendResponse struct {
	Written int `json:"written"`
}

type ReadRequest struct {
	SessionID string `json:"sessionId"`
}

type ReadResponse struct {
	Output   string `json:"output"`
	ExitCode *int   `json:"exitCode,omitempty"`
	Running  bool   `json:"running"`
}

type StopRequest struct {
	SessionID string `json:"sessionId"`
}

type StopResponse struct {
	Stopped bool `json:"stopped"`
}

type ListSessionsRequest struct {
	IncludeExited bool `json:"includeExited,omitempty"`
}

type SessionSummary struct {
	SessionID   string `json:"sessionId"`
	WorkspaceID string `json:"workspaceId"`
	PID         int    `json:"pid"`
	Status      string `json:"status"`
	StartedAt   string `json:"startedAt,omitempty"`
	ExitedAt    string `json:"exitedAt,omitempty"`
}

type DetectedPort struct {
	SessionID   string `json:"sessionId"`
	WorkspaceID string `json:"workspaceId"`
	PID         int    `json:"pid"`
	Port        int    `json:"port"`
	Address     string `json:"address"`
	ProcessName string `json:"processName"`
}

type ResizeRequest struct {
	SessionID string `json:"sessionId"`
	Cols      uint16 `json:"cols"`
	Rows      uint16 `json:"rows"`
}

type ResizeResponse struct {
	Resized bool `json:"resized"`
}

type SubscribeRequest struct {
	SessionID string `json:"sessionId"`
}

type SubscribeResponse struct {
	Subscribed bool `json:"subscribed"`
}

type UnsubscribeRequest struct {
	SessionID      string `json:"sessionId"`
	SubscriptionID uint64 `json:"subscriptionId"`
}

type UnsubscribeResponse struct {
	Unsubscribed bool `json:"unsubscribed"`
}

type Event struct {
	SessionID string `json:"sessionId"`
	Type      string `json:"type"`
	Chunk     string `json:"chunk,omitempty"`
	ExitCode  *int   `json:"exitCode,omitempty"`
}

type Subscription struct {
	ID     uint64
	Events <-chan Event
}
