package dsh

import (
	"encoding/json"
	"errors"
	"fmt"
)

type rpcServerError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type rpcResponse struct {
	result   json.RawMessage
	rpcError *rpcServerError
	err      error
}

type rpcEnvelope struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *uint64         `json:"id"`
	Method  string          `json:"method"`
	Result  json.RawMessage `json:"result"`
	Error   *rpcServerError `json:"error"`
	Params  json.RawMessage `json:"params"`
}

func writeRequest(process *runtimeProcess, id uint64, method string, params any) error {
	frame, err := json.Marshal(struct {
		JSONRPC string `json:"jsonrpc"`
		ID      uint64 `json:"id"`
		Method  string `json:"method"`
		Params  any    `json:"params,omitempty"`
	}{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	if err != nil {
		return fmt.Errorf("encode DSH request %s: %w", method, err)
	}
	process.writeMu.Lock()
	defer process.writeMu.Unlock()
	if _, err := process.stdin.Write(append(frame, '\n')); err != nil {
		return fmt.Errorf("write DSH request %s: %w", method, err)
	}
	return nil
}

func (p *runtimeProcess) registerPending(id uint64) (<-chan rpcResponse, func()) {
	response := make(chan rpcResponse, 1)
	p.pendingMu.Lock()
	if p.terminalErr != nil {
		response <- interruptedResponse(p.terminalErr)
	} else {
		p.pending[id] = response
	}
	p.pendingMu.Unlock()
	return response, func() { p.removePending(id) }
}

func (p *runtimeProcess) removePending(id uint64) {
	p.pendingMu.Lock()
	delete(p.pending, id)
	p.pendingMu.Unlock()
}

func (p *runtimeProcess) routeResponse(frame rpcEnvelope) {
	if frame.ID == nil || frame.JSONRPC != "2.0" {
		return
	}
	p.pendingMu.Lock()
	response := p.pending[*frame.ID]
	delete(p.pending, *frame.ID)
	p.pendingMu.Unlock()
	if response != nil {
		response <- rpcResponse{result: frame.Result, rpcError: frame.Error}
	}
}

func (p *runtimeProcess) interruptPending(err error) {
	p.pendingMu.Lock()
	pending := p.pending
	p.pending = make(map[uint64]chan rpcResponse)
	p.pendingMu.Unlock()
	deliverInterrupted(pending, err)
}

func (p *runtimeProcess) failPending(err error) {
	p.pendingMu.Lock()
	p.terminalErr = err
	pending := p.pending
	p.pending = make(map[uint64]chan rpcResponse)
	p.pendingMu.Unlock()
	deliverInterrupted(pending, err)
}

func deliverInterrupted(pending map[uint64]chan rpcResponse, err error) {
	for _, response := range pending {
		response <- interruptedResponse(err)
	}
}

func interruptedResponse(err error) rpcResponse {
	return rpcResponse{err: fmt.Errorf("%w: %w", ErrRequestInterrupted, err)}
}

func (s *Supervisor) drainOutput(process *runtimeProcess) {
	for process.output.Scan() {
		s.routeOutput(process, process.output.Bytes())
	}
	if err := process.output.Err(); err != nil {
		s.diagnose(fmt.Sprintf("read DSH stdout: %v", err))
	}
}

func (s *Supervisor) routeOutput(process *runtimeProcess, line []byte) {
	frame, err := parseRPCEnvelope(line)
	if err != nil {
		s.handleMalformedEnvelope(process, line, err)
		return
	}
	if frame.ID == nil {
		s.routeNotification(process, frame)
		return
	}
	if frame.Method != "" {
		s.diagnose("unsupported DSH runtime request: " + frame.Method)
		return
	}
	process.routeResponse(frame)
}

func (s *Supervisor) handleMalformedEnvelope(process *runtimeProcess, line []byte, cause error) {
	s.diagnose(fmt.Sprintf("decode DSH stdout: %v", cause))
	method, ok := extractEnvelopeMethod(line)
	if !ok || !isKnownNotification(method) {
		return
	}
	s.invalidateProcess(process, fmt.Errorf("malformed DSH notification %s: %w", method, cause))
}

func extractEnvelopeMethod(line []byte) (string, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(line, &fields) != nil || fields == nil {
		return "", false
	}
	method, ok := rawString(fields["method"])
	return method, ok && method != ""
}

func parseRPCEnvelope(line []byte) (rpcEnvelope, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(line, &fields); err != nil || fields == nil {
		return rpcEnvelope{}, errors.New("frame must be a JSON object")
	}
	if !rawStringEquals(fields["jsonrpc"], "2.0") {
		return rpcEnvelope{}, errors.New("frame has invalid jsonrpc version")
	}
	if _, hasID := fields["id"]; hasID {
		return parseRPCFrameWithID(fields)
	}
	return parseRPCNotification(fields)
}

func parseRPCFrameWithID(fields map[string]json.RawMessage) (rpcEnvelope, error) {
	var id uint64
	if string(fields["id"]) == "null" {
		return rpcEnvelope{}, errors.New("frame has invalid id")
	}
	if err := json.Unmarshal(fields["id"], &id); err != nil {
		return rpcEnvelope{}, errors.New("frame has invalid id")
	}
	if method, ok := rawString(fields["method"]); ok {
		if !hasExactKeys(fields, "jsonrpc", "id", "method", "params") {
			return rpcEnvelope{}, errors.New("runtime request has unsupported fields")
		}
		return rpcEnvelope{JSONRPC: "2.0", ID: &id, Method: method}, nil
	}
	return parseRPCResponse(fields, id)
}

func parseRPCResponse(fields map[string]json.RawMessage, id uint64) (rpcEnvelope, error) {
	_, hasResult := fields["result"]
	_, hasError := fields["error"]
	if hasResult == hasError || !hasExactKeys(fields, "jsonrpc", "id", responseKey(hasError)) {
		return rpcEnvelope{}, errors.New("response must contain exactly one result or error")
	}
	frame := rpcEnvelope{JSONRPC: "2.0", ID: &id, Result: fields["result"]}
	if hasError {
		var wireError struct {
			Code    *int            `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data"`
		}
		if err := decodeStrictJSON(fields["error"], &wireError); err != nil || wireError.Code == nil || wireError.Message == "" {
			return rpcEnvelope{}, errors.New("response has invalid error")
		}
		frame.Error = &rpcServerError{Code: *wireError.Code, Message: wireError.Message, Data: wireError.Data}
	}
	return frame, nil
}

func parseRPCNotification(fields map[string]json.RawMessage) (rpcEnvelope, error) {
	method, ok := rawString(fields["method"])
	if !ok || method == "" {
		return rpcEnvelope{}, errors.New("notification has invalid method")
	}
	if !hasExactKeys(fields, "jsonrpc", "method") && !hasExactKeys(fields, "jsonrpc", "method", "params") {
		return rpcEnvelope{}, errors.New("notification has unsupported fields")
	}
	return rpcEnvelope{JSONRPC: "2.0", Method: method, Params: fields["params"]}, nil
}

func responseKey(hasError bool) string {
	if hasError {
		return "error"
	}
	return "result"
}

func hasExactKeys(fields map[string]json.RawMessage, keys ...string) bool {
	if len(fields) != len(keys) {
		return false
	}
	for _, key := range keys {
		if _, ok := fields[key]; !ok {
			return false
		}
	}
	return true
}

func rawString(value json.RawMessage) (string, bool) {
	var result string
	if value == nil || json.Unmarshal(value, &result) != nil {
		return "", false
	}
	return result, true
}

func rawStringEquals(value json.RawMessage, expected string) bool {
	actual, ok := rawString(value)
	return ok && actual == expected
}

type subagentInterruptWireResult struct {
	ParentSessionID    string `json:"parentSessionId"`
	ChildSessionID     string `json:"childSessionId"`
	InterruptRequested *bool  `json:"interruptRequested"`
}

func (response subagentInterruptWireResult) validate(request SubagentInterruptRequest) (SubagentInterruptResult, error) {
	if response.ParentSessionID != request.ParentSessionID || response.ChildSessionID != request.ChildSessionID || response.InterruptRequested == nil || !*response.InterruptRequested {
		return SubagentInterruptResult{}, errors.New("invalid DSH subagent interrupt response")
	}
	return SubagentInterruptResult{
		ParentSessionID:    response.ParentSessionID,
		ChildSessionID:     response.ChildSessionID,
		InterruptRequested: *response.InterruptRequested,
	}, nil
}
