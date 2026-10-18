package rpc

import (
	"context"
	"encoding/json"
)

const (
	MethodPreferencesGet = "preferences.get"
	MethodPreferencesSet = "preferences.set"
)

// PreferencesGetParams addresses one exact opaque scope/key pair.
// Scope is 1..1024 bytes; key is 1..256 bytes; neither is normalized.
// Both methods return {found:false} without value for absence, or
// {found:true,value:JSON} for a stored entry (including explicit null).
// Payload schemas, versions, defaults, and legacy workspace-order migration
// belong exclusively to the caller. No key has special runtime behavior.
type PreferencesGetParams struct {
	Scope string `json:"scope"`
	Key   string `json:"key"`
}

// PreferencesSetParams requires Value; JSON null is distinct from omission.
// InitializeOnly atomically preserves an existing value and returns it.
// Value must be valid JSON of at most 1 MiB. Omission is invalid, not null.
// Writes replace the whole value; initializeOnly defaults to false.
type PreferencesSetParams struct {
	Scope          string          `json:"scope"`
	Key            string          `json:"key"`
	Value          json.RawMessage `json:"value"`
	InitializeOnly bool            `json:"initializeOnly"`
}

type preferencesService interface {
	GetPreference(context.Context, PreferencesGetParams) (any, error)
	SetPreference(context.Context, PreferencesSetParams) (any, error)
}

// PreferencesHandler owns generic preferences.* decoding, not storage.
type PreferencesHandler struct{ Services preferencesService }

// Call implements Handler.
func (handler *PreferencesHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodPreferencesGet:
		var request PreferencesGetParams
		if err := DecodeParams(params, &request); err != nil {
			return nil, err
		}
		return handler.Services.GetPreference(ctx, request)
	case MethodPreferencesSet:
		var request PreferencesSetParams
		if err := DecodeParams(params, &request); err != nil {
			return nil, err
		}
		return handler.Services.SetPreference(ctx, request)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown preferences method: "+method)
	}
}
