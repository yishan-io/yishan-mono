package rpc

import "encoding/json"

// AgentRuntime identifies the execution runtime selected by agent.* callers.
type AgentRuntime string

const (
	AgentRuntimePi  AgentRuntime = "pi"
	AgentRuntimeDSH AgentRuntime = "dsh"

	// DSHTranscriptProtocolVersion is the only transcript projection supported at the renderer boundary.
	DSHTranscriptProtocolVersion = 2
)

// AgentStartParams starts a runtime-neutral agent session.
type AgentStartParams struct {
	Runtime                   AgentRuntime `json:"runtime"`
	SessionID                 string       `json:"sessionId"`
	TabID                     string       `json:"tabId"`
	PaneID                    string       `json:"paneId,omitempty"`
	WorkspaceID               string       `json:"workspaceId"`
	CWD                       string       `json:"cwd"`
	Resume                    bool         `json:"resume,omitempty"`
	TranscriptProtocolVersion int          `json:"transcriptProtocolVersion,omitempty"`
}

// AgentAttachParams attaches a client connection to an existing session.
type AgentAttachParams struct {
	Runtime                   AgentRuntime `json:"runtime"`
	SessionID                 string       `json:"sessionId"`
	TabID                     string       `json:"tabId,omitempty"`
	WorkspaceID               string       `json:"workspaceId"`
	CWD                       string       `json:"cwd"`
	AfterSeq                  int64        `json:"afterSeq,omitempty"`
	AfterSeqProvided          bool         `json:"-"`
	TranscriptProtocolVersion int          `json:"transcriptProtocolVersion,omitempty"`
}

// UnmarshalJSON distinguishes an omitted DSH replay cursor from an explicit
// zero cursor. Omitted cursors begin before the transcript at -1.
func (p *AgentAttachParams) UnmarshalJSON(raw []byte) error {
	var wire struct {
		Runtime                   AgentRuntime `json:"runtime"`
		SessionID                 string       `json:"sessionId"`
		TabID                     string       `json:"tabId"`
		WorkspaceID               string       `json:"workspaceId"`
		CWD                       string       `json:"cwd"`
		AfterSeq                  *int64       `json:"afterSeq"`
		TranscriptProtocolVersion int          `json:"transcriptProtocolVersion"`
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		return err
	}
	p.Runtime, p.SessionID, p.TabID = wire.Runtime, wire.SessionID, wire.TabID
	p.WorkspaceID, p.CWD = wire.WorkspaceID, wire.CWD
	p.AfterSeqProvided = wire.AfterSeq != nil
	p.TranscriptProtocolVersion = wire.TranscriptProtocolVersion
	p.AfterSeq = 0
	if wire.AfterSeq != nil {
		p.AfterSeq = *wire.AfterSeq
	}
	return nil
}

// AgentPromptParams sends one runtime-neutral prompt to a session.
type AgentPromptParams struct {
	Runtime           AgentRuntime    `json:"runtime"`
	SessionID         string          `json:"sessionId"`
	WorkspaceID       string          `json:"workspaceId"`
	CWD               string          `json:"cwd"`
	Message           json.RawMessage `json:"message"`
	StreamingBehavior string          `json:"streamingBehavior,omitempty"`
}

// AgentAbortParams aborts a running agent session.
type AgentAbortParams struct {
	Runtime     AgentRuntime `json:"runtime"`
	SessionID   string       `json:"sessionId"`
	WorkspaceID string       `json:"workspaceId"`
	CWD         string       `json:"cwd"`
}

// AgentDisposeParams disposes an agent session and its runtime resources.
type AgentDisposeParams AgentAbortParams

// AgentListSessionsParams lists durable sessions for one runtime and workspace.
type AgentListSessionsParams struct {
	Runtime     AgentRuntime `json:"runtime"`
	WorkspaceID string       `json:"workspaceId"`
	CWD         string       `json:"cwd"`
}

// AgentReadHistoryParams reads the durable history for one session.
type AgentReadHistoryParams struct {
	Runtime                   AgentRuntime `json:"runtime"`
	SessionID                 string       `json:"sessionId"`
	WorkspaceID               string       `json:"workspaceId"`
	CWD                       string       `json:"cwd"`
	TranscriptProtocolVersion int          `json:"transcriptProtocolVersion,omitempty"`
}

// AgentStartResult is the stable start response shared by agent runtimes.
type AgentStartResult struct {
	Runtime   AgentRuntime `json:"runtime"`
	SessionID string       `json:"sessionId"`
}

// AgentAckResult is the stable acknowledgement for session mutations.
type AgentCapabilitiesResult struct {
	DSH AgentDSHCapabilities `json:"dsh"`
}
type AgentDSHCapabilities struct {
	Configured                bool   `json:"configured"`
	Ready                     bool   `json:"ready"`
	Incarnation               string `json:"incarnation,omitempty"`
	TranscriptProtocolVersion int    `json:"transcriptProtocolVersion"`
}

// AgentAckResult is the stable acknowledgement for session mutations.
type AgentAckResult struct {
	Runtime AgentRuntime `json:"runtime"`
	OK      bool         `json:"ok"`
}

// AgentDSHAttachResult seeds a renderer's DSH controller from the same
// authoritative subscribe/replay merge that backs notifications. AsOfSeq is
// the durable baseline; DurableThroughSeq is its persisted cursor. Events can
// also include contiguous in-memory replay through HeadSeq and remain safe to
// deduplicate with racing notifications.
type AgentDSHAttachResult struct {
	Runtime           AgentRuntime      `json:"runtime"`
	SessionID         string            `json:"sessionId"`
	Incarnation       string            `json:"incarnation"`
	Events            []json.RawMessage `json:"events"`
	AsOfSeq           int64             `json:"asOfSeq"`
	DurableThroughSeq int64             `json:"durableThroughSeq"`
	HeadSeq           int64             `json:"headSeq"`
}

// AgentSessionSummary is the stable cross-runtime representation of a durable session.
type AgentSessionSummary struct {
	SessionID     string `json:"sessionId"`
	CWD           string `json:"cwd"`
	CreatedAt     int64  `json:"createdAt"`
	Model         string `json:"model,omitempty"`
	PreviewText   string `json:"previewText,omitempty"`
	SessionName   string `json:"sessionName,omitempty"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
	Live          bool   `json:"live"`
	Persisted     bool   `json:"persisted"`
}

// AgentSessionsResult is a runtime-tagged durable-session response.
type AgentSessionsResult struct {
	Runtime  AgentRuntime          `json:"runtime"`
	Sessions []AgentSessionSummary `json:"sessions"`
}

// AgentPiHistory is the Pi-specific durable history representation.
type AgentPiHistory struct {
	FilePath string `json:"filePath"`
}

// AgentDSHSessionMetadata identifies a durable DSH session.
type AgentDSHSessionMetadata struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     int64  `json:"createdAt"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
}

// AgentDSHHistory is the DSH-specific durable history representation.
type AgentDSHHistory struct {
	Session           AgentDSHSessionMetadata `json:"session"`
	Events            []json.RawMessage       `json:"events"`
	Incarnation       string                  `json:"incarnation"`
	AsOfSeq           int64                   `json:"asOfSeq"`
	DurableThroughSeq int64                   `json:"durableThroughSeq"`
}

// AgentHistoryResult is a runtime-tagged session-history response. Exactly one
// runtime-specific field is present.
type AgentHistoryResult struct {
	Runtime AgentRuntime     `json:"runtime"`
	Pi      *AgentPiHistory  `json:"pi,omitempty"`
	DSH     *AgentDSHHistory `json:"dsh,omitempty"`
}

// Wire types for the pi.*, skill.*, and customize.* namespaces. These structs
// are the JSON-RPC payload contract for the agent RPC methods; field names and
// shapes must stay compatible with the desktop and CLI clients.

// ---- pi namespace ----

// PiActiveSessionSummary describes one live pi session the desktop can
// recover. Session identity rule: the daemon live session id is also the Pi
// resume/session id.
type PiActiveSessionSummary struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
}

type PiStartParams struct {
	// Session identity rule: sessionId is used both for daemon attach and Pi resume.
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	PaneID      string `json:"paneId,omitempty"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
	Resume      bool   `json:"resume,omitempty"`
}

type PiAttachParams struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	CWD         string `json:"cwd,omitempty"`
}

type PiStopParams struct {
	SessionID string `json:"sessionId"`
}

type PiSendParams struct {
	SessionID string          `json:"sessionId"`
	Command   json.RawMessage `json:"command"`
}

type PiListSessionsParams struct {
	CWD string `json:"cwd"`
}

type PiGetSessionFileParams struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}

type PiRenameParams struct {
	SessionID string `json:"sessionId"`
	Title     string `json:"title"`
}

type PiSaveProviderParams struct {
	Provider string            `json:"provider"`
	Key      string            `json:"key"`
	Env      map[string]string `json:"env,omitempty"`
}

type PiRemoveProviderParams struct {
	Provider string `json:"provider"`
}

// ---- skill namespace ----

type SkillNameParams struct {
	Name string `json:"name"`
}

type SkillSourceParams struct {
	Source string `json:"source"`
}

// ---- customize namespace ----

// CustomizeExtensionSourceParams is the source spec of an install/update
// call. pi matches installs/removals/updates by source identity, so the full
// spec (npm:, git:, https:, local path) is required — a bare package name is
// never a valid target.
type CustomizeExtensionSourceParams struct {
	Source string `json:"source"`
}

type CustomizeAgentNameParams struct {
	Name string `json:"name"`
}

type CustomizeAgentCreateParams struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Content     string   `json:"content"`
	Model       string   `json:"model"`
	Thinking    string   `json:"thinking"`
	Tools       []string `json:"tools"`
}

type CustomizeAgentUpdateParams struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}
