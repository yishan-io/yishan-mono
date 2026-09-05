package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	yishanProviderContextWindowsMethod = "yishan.v1.providers.context-windows"
	yishanProvidersListMethod          = "yishan.v1.providers.list"
	yishanSessionDisposeMethod         = "yishan.v1.session.dispose"
	yishanSessionFilePathMethod        = "yishan.v1.session.file-path"
	yishanSessionListMethod            = "yishan.v1.session.list"
	yishanSessionTitleSummaryMethod    = "yishan.v1.session.title-summary"
	yishanSessionReadMethod            = "yishan.v1.session.read"
	yishanSessionResumeMethod          = "yishan.v1.session.resume"
	yishanSubagentInterruptMethod      = "yishan.v1.subagent.interrupt"
)

var (
	// ErrRuntimeUnavailable reports that the current runtime cannot receive a request.
	ErrRuntimeUnavailable = errors.New("DSH runtime is unavailable")
	// ErrRequestInterrupted reports a request abandoned because its runtime stopped.
	ErrRequestInterrupted = errors.New("DSH request interrupted")
)

// RequestError is an error returned by the DSH JSON-RPC server.
type RequestError struct {
	Method  string
	Code    int
	Message string
	Data    json.RawMessage
}

func (e *RequestError) Error() string {
	return fmt.Sprintf("DSH request %s failed (%d): %s", e.Method, e.Code, e.Message)
}

// ProviderCatalog lists the runtime routes that may be selected for DSH sessions.
// It deliberately contains no credential values or credential references.
type ProviderCatalog struct {
	Providers []ProviderCatalogProvider `json:"providers"`
}

// ProviderCatalogProvider is one selectable DSH provider route.
type ProviderCatalogProvider struct {
	ID             string                 `json:"id"`
	Authentication string                 `json:"authentication"`
	SetupRequired  bool                   `json:"setupRequired"`
	Models         []ProviderCatalogModel `json:"models"`
}

// ProviderCatalogModel is one selectable model on a provider route.
type ProviderCatalogModel struct {
	Provider      string `json:"provider"`
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow *int64 `json:"contextWindow,omitempty"`
}

// ProviderContextWindowRoute identifies one exact provider-owned model route.
type ProviderContextWindowRoute struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// ProviderContextWindowRequest requests optional capacities for catalog routes.
type ProviderContextWindowRequest struct {
	Routes []ProviderContextWindowRoute `json:"routes"`
}

// ProviderContextWindow is one matched route capacity returned by a runtime.
type ProviderContextWindow struct {
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	ContextWindow int64  `json:"contextWindow"`
}

// ProviderContextWindowResult contains only routes whose safe capacity the runtime resolved.
type ProviderContextWindowResult struct {
	ContextWindows []ProviderContextWindow `json:"contextWindows"`
}

// ListProviderCatalog reads the compatible runtime-owned provider catalog and optionally enriches it with capacities.
func (s *Supervisor) ListProviderCatalog(ctx context.Context) (ProviderCatalog, error) {
	var response providerCatalogWire
	if err := s.call(ctx, yishanProvidersListMethod, struct{}{}, &response); err != nil {
		return ProviderCatalog{}, err
	}
	catalog, err := response.validate()
	if err != nil {
		return ProviderCatalog{}, err
	}
	contextWindows, err := s.ListProviderContextWindows(ctx, providerCatalogRoutes(catalog))
	if err != nil {
		return catalog, nil
	}
	return applyProviderContextWindows(catalog, contextWindows), nil
}

// ListProviderContextWindows reads optional capacities for already-known provider catalog routes.
func (s *Supervisor) ListProviderContextWindows(ctx context.Context, request ProviderContextWindowRequest) (ProviderContextWindowResult, error) {
	if err := validateProviderContextWindowRequest(request); err != nil {
		return ProviderContextWindowResult{}, err
	}
	var response providerContextWindowWireResult
	if err := s.call(ctx, yishanProviderContextWindowsMethod, request, &response); err != nil {
		return ProviderContextWindowResult{}, err
	}
	return response.validate(request)
}

func providerCatalogRoutes(catalog ProviderCatalog) ProviderContextWindowRequest {
	routes := make([]ProviderContextWindowRoute, 0)
	for _, provider := range catalog.Providers {
		for _, model := range provider.Models {
			routes = append(routes, ProviderContextWindowRoute{Provider: provider.ID, Model: model.ID})
		}
	}
	return ProviderContextWindowRequest{Routes: routes}
}

func applyProviderContextWindows(catalog ProviderCatalog, result ProviderContextWindowResult) ProviderCatalog {
	contextWindows := make(map[string]int64, len(result.ContextWindows))
	for _, entry := range result.ContextWindows {
		contextWindows[entry.Provider+"\x00"+entry.Model] = entry.ContextWindow
	}
	for providerIndex := range catalog.Providers {
		for modelIndex := range catalog.Providers[providerIndex].Models {
			model := &catalog.Providers[providerIndex].Models[modelIndex]
			if contextWindow, ok := contextWindows[model.Provider+"\x00"+model.ID]; ok {
				model.ContextWindow = &contextWindow
			}
		}
	}
	return catalog
}

// SessionListRequest lists persisted top-level sessions for a workspace.
type SessionListRequest struct {
	CWD string `json:"cwd"`
}

// SessionListEntry is one persisted DSH session.
type SessionListEntry struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     int64  `json:"createdAt"`
	PreviewText   string `json:"-"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
	Live          bool   `json:"live"`
	Persisted     bool   `json:"persisted"`
}

// SessionListResult is the response to a session list request.
type SessionListResult struct {
	Sessions []SessionListEntry `json:"sessions"`
}

// SessionTitleSummaryRequest reads titles for sessions already listed in one workspace.
type SessionTitleSummaryRequest struct {
	CWD        string   `json:"cwd"`
	SessionIDs []string `json:"sessionIds"`
}

// SessionTitleSummary is the latest observed log-backed title for one DSH session.
type SessionTitleSummary struct {
	SessionID   string `json:"sessionId"`
	PreviewText string `json:"previewText"`
}

// SessionTitleSummaryResult is the response to a title-summary request.
type SessionTitleSummaryResult struct {
	Titles []SessionTitleSummary `json:"titles"`
}

// SessionFilePathResult identifies a materialized DSH session artifact.
type SessionFilePathResult struct {
	FilePath string `json:"filePath"`
}

// SessionReadRequest reads a persisted workspace session.
type SessionReadRequest struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}

// SessionResumeRequest identifies a persisted session and its daemon-authorized workspace context.
type SessionResumeRequest struct {
	CWD         string `json:"cwd"`
	SessionID   string `json:"sessionId"`
	WorkspaceID string `json:"workspaceId"`
}

// SessionHeader is the durable header returned with a session transcript.
type SessionHeader struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     int64  `json:"createdAt"`
	ParentSession string `json:"parentSession,omitempty"`
	Origin        string `json:"origin,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
}

// SessionReadResult is the response to a session read request.
type SessionReadResult struct {
	Session           SessionHeader     `json:"session"`
	Events            []json.RawMessage `json:"events"`
	InstanceID        string            `json:"instanceId"`
	AsOfSeq           int64             `json:"asOfSeq"`
	DurableThroughSeq int64             `json:"durableThroughSeq"`
}

// SessionResumeResult is the response to a session resume request.
type SessionResumeResult struct {
	SessionID string `json:"sessionId"`
}

// SessionDisposeResult is the response to a session dispose request.
type SessionDisposeResult struct {
	SessionID string `json:"sessionId"`
	Disposed  bool   `json:"disposed"`
}

// SubagentInterruptRequest identifies one direct child of a Yishan-owned parent.
type SubagentInterruptRequest struct {
	CWD             string `json:"cwd"`
	ParentSessionID string `json:"parentSessionId"`
	ChildSessionID  string `json:"childSessionId"`
}

// SubagentInterruptResult reports whether the runtime accepted interrupt dispatch.
type SubagentInterruptResult struct {
	ParentSessionID    string `json:"parentSessionId"`
	ChildSessionID     string `json:"childSessionId"`
	InterruptRequested bool   `json:"interruptRequested"`
}

// InterruptSubagent asks DSH to interrupt one authorized direct subagent.
func (s *Supervisor) InterruptSubagent(ctx context.Context, request SubagentInterruptRequest) (SubagentInterruptResult, error) {
	if err := validateSubagentInterruptRequest(request); err != nil {
		return SubagentInterruptResult{}, err
	}
	var response subagentInterruptWireResult
	if err := s.call(ctx, yishanSubagentInterruptMethod, request, &response); err != nil {
		return SubagentInterruptResult{}, err
	}
	return response.validate(request)
}

// DisposeSession stops one resumed live session after DSH verifies its cwd.
func (s *Supervisor) DisposeSession(ctx context.Context, request SessionReadRequest) (SessionDisposeResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionDisposeResult{}, err
	}
	var response sessionDisposeWireResult
	if err := s.call(ctx, yishanSessionDisposeMethod, request, &response); err != nil {
		return SessionDisposeResult{}, err
	}
	result, err := response.validate(request)
	if err != nil {
		return SessionDisposeResult{}, err
	}
	if result.Disposed {
		s.removeWorkspaceBindings(request.SessionID)
	}
	return result, nil
}

// ListSessions requests persisted top-level sessions for one workspace.
func (s *Supervisor) ListSessions(ctx context.Context, request SessionListRequest) (SessionListResult, error) {
	if request.CWD == "" {
		return SessionListResult{}, errors.New("DSH session list cwd is required")
	}
	var response sessionListWireResult
	if err := s.call(ctx, yishanSessionListMethod, request, &response); err != nil {
		return SessionListResult{}, err
	}
	return response.validate()
}

// ListSessionTitleSummaries reads optional title previews for sessions already listed in one workspace.
func (s *Supervisor) ListSessionTitleSummaries(ctx context.Context, request SessionTitleSummaryRequest) (SessionTitleSummaryResult, error) {
	if request.CWD == "" {
		return SessionTitleSummaryResult{}, errors.New("DSH session title summary cwd is required")
	}
	if len(request.SessionIDs) == 0 {
		return SessionTitleSummaryResult{Titles: []SessionTitleSummary{}}, nil
	}
	seenSessionIDs := make(map[string]struct{}, len(request.SessionIDs))
	for _, sessionID := range request.SessionIDs {
		if sessionID == "" {
			return SessionTitleSummaryResult{}, errors.New("DSH session title summary requires sessionIds")
		}
		if _, exists := seenSessionIDs[sessionID]; exists {
			return SessionTitleSummaryResult{}, errors.New("DSH session title summary sessionIds must be unique")
		}
		seenSessionIDs[sessionID] = struct{}{}
	}
	var response sessionTitleSummaryWireResult
	if err := s.call(ctx, yishanSessionTitleSummaryMethod, request, &response); err != nil {
		return SessionTitleSummaryResult{}, err
	}
	return response.validate(request)
}

// GetSessionFilePath resolves one materialized session artifact without resuming the session.
func (s *Supervisor) GetSessionFilePath(ctx context.Context, request SessionReadRequest) (SessionFilePathResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionFilePathResult{}, err
	}
	var response sessionFilePathWireResult
	if err := s.call(ctx, yishanSessionFilePathMethod, request, &response); err != nil {
		return SessionFilePathResult{}, err
	}
	return response.validate()
}

// ReadSession requests one persisted session and its durable events.
func (s *Supervisor) ReadSession(ctx context.Context, request SessionReadRequest) (SessionReadResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionReadResult{}, err
	}
	var response sessionReadWireResult
	if err := s.call(ctx, yishanSessionReadMethod, request, &response); err != nil {
		return SessionReadResult{}, err
	}
	return response.validate(request)
}

// ResumeSession asks DSH to resume a persisted session for its workspace.
// A local deadline abandons only the response; retrying the same session is safe
// because the runtime coalesces in-flight resumes and returns an existing live session.
func (s *Supervisor) ResumeSession(ctx context.Context, request SessionResumeRequest) (SessionResumeResult, error) {
	if err := validateSessionResumeRequest(request); err != nil {
		return SessionResumeResult{}, err
	}
	lease, err := s.registerWorkspaceBinding(request.SessionID, request.WorkspaceID, request.CWD)
	if err != nil {
		return SessionResumeResult{}, err
	}
	var response SessionResumeResult
	if err := s.call(ctx, yishanSessionResumeMethod, request, &response); err != nil {
		s.releaseWorkspaceBinding(lease)
		return SessionResumeResult{}, err
	}
	if response.SessionID == "" || response.SessionID != request.SessionID {
		s.releaseWorkspaceBinding(lease)
		return SessionResumeResult{}, errors.New("invalid DSH session resume response")
	}
	return response, nil
}

func (s *Supervisor) call(ctx context.Context, method string, params any, target any) error {
	_, err := s.callWithProcess(ctx, method, params, target)
	return err
}

func (s *Supervisor) callWithProcess(ctx context.Context, method string, params any, target any) (*runtimeProcess, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	process, id, response, remove, err := s.prepareRequest()
	if err != nil {
		return nil, err
	}
	defer remove()
	if err := writeRequest(process, id, method, params); err != nil {
		return nil, err
	}
	if err := waitForResponse(ctx, response, method, target); err != nil {
		return nil, err
	}
	return process, nil
}

func (s *Supervisor) prepareRequest() (*runtimeProcess, string, <-chan rpcResponse, func(), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosing || s.process == nil || !s.health.IsReady {
		return nil, "", nil, nil, ErrRuntimeUnavailable
	}
	s.nextID++
	id := fmt.Sprintf("dsh-%d", s.nextID)
	response, remove := s.process.registerPending(id)
	return s.process, id, response, remove, nil
}

func waitForResponse(ctx context.Context, response <-chan rpcResponse, method string, target any) error {
	select {
	case frame := <-response:
		if frame.err != nil {
			return frame.err
		}
		if frame.rpcError != nil {
			return &RequestError{Method: method, Code: frame.rpcError.Code, Message: frame.rpcError.Message, Data: frame.rpcError.Data}
		}
		if err := decodeStrictJSON(frame.result, target); err != nil {
			return fmt.Errorf("decode DSH response for %s: %w", method, err)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
