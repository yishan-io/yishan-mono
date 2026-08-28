package main

import (
	"encoding/json"
	"fmt"
)

type responseEnvelope struct {
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
}

type rawResponseEnvelope struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int            `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   json.RawMessage `json:"error"`
}

func parseResponse(line []byte) (responseEnvelope, error) {
	var raw rawResponseEnvelope
	if err := json.Unmarshal(line, &raw); err != nil {
		return responseEnvelope{}, fmt.Errorf("decode JSON-RPC response: %w", err)
	}
	if raw.JSONRPC != "2.0" || raw.ID == nil {
		return responseEnvelope{}, fmt.Errorf("expected JSON-RPC response")
	}
	if len(raw.Error) > 0 {
		return responseEnvelope{ID: *raw.ID}, parseResponseError(raw.Error)
	}
	if len(raw.Result) == 0 {
		return responseEnvelope{}, fmt.Errorf("JSON-RPC response has no result")
	}
	return responseEnvelope{ID: *raw.ID, Result: raw.Result}, nil
}

func parseResponseError(rawError json.RawMessage) error {
	var rpcError struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawError, &rpcError); err != nil {
		return fmt.Errorf("decode JSON-RPC error: %w", err)
	}
	return fmt.Errorf("JSON-RPC error %d: %s", rpcError.Code, rpcError.Message)
}
