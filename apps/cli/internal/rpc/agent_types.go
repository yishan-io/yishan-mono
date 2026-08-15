package rpc

import "encoding/json"

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
